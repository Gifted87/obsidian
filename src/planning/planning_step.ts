import OpenAI from "openai"; // used for client construction
import { randomUUID } from "crypto";
import {
  ExecutionEvent,
  PlanLevel,
  PlannerProposal,
  PlanningAudit,
  PlanningStepResult,
  TaskDAG,
  TaskNode,
} from "../executor/dag_types.ts";
import {
  ARCHITECTURE_PLANNER_PROMPT,
  DEPENDENCY_PLANNER_PROMPT,
  PLANNING_AUDITOR_PROMPT,
  PLANNING_CONSOLIDATOR_PROMPT,
  SEQUENCER_PLANNER_PROMPT,
  SINGLE_GROUND_LEVEL_PLANNER_PROMPT,
} from "./planning_prompts.ts";

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

/**
 * Key rotator for DeepSeek API keys
 */
function getDeepSeekApiKey(): string {
  const keysStr = process.env.DEEPSEEK_API_KEYS || process.env.DEEPSEEK_API_KEY || "";
  const keys = keysStr.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
  if (keys.length === 0) {
    throw new Error("No API keys found for DeepSeek in DEEPSEEK_API_KEYS or DEEPSEEK_API_KEY.");
  }
  const idx = Math.floor(Math.random() * keys.length);
  return keys[idx];
}

function makeClient(): OpenAI {
  return new OpenAI({
    apiKey: getDeepSeekApiKey(),
    baseURL: DEEPSEEK_BASE_URL,
  });
}

/**
 * Utility to extract clean JSON from raw model string response
 */
function extractJson(text: string): any {
  let cleanText = text.trim();
  if (cleanText.startsWith("```json")) {
    cleanText = cleanText.substring(7);
  } else if (cleanText.startsWith("```")) {
    cleanText = cleanText.substring(3);
  }
  if (cleanText.endsWith("```")) {
    cleanText = cleanText.substring(0, cleanText.length - 3);
  }
  cleanText = cleanText.trim();

  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleanText);
}

/**
 * Call DeepSeek model for raw markdown/text reasoning output (Planners A, B, C and Auditor)
 */
async function callRawTextAgent(
  systemPrompt: string,
  userMessage: string,
  agentLabel: string,
  retries = 2
): Promise<string> {
  const client = makeClient();
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content || "";
      if (content.trim()) {
        return content;
      }
    } catch (err: any) {
      console.warn(`[PlanningStep] ${agentLabel} attempt ${attempt + 1} failed: ${err.message}`);
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw new Error(`[PlanningStep] ${agentLabel} failed after ${retries + 1} attempts: ${lastError?.message}`);
}

/**
 * Call DeepSeek model using JSON mode (response_format: json_object) to guarantee structured JSON output.
 * Used by the Consolidator Agent and Single Ground-Level Planner Agent only.
 */
async function callJsonModeAgent<T>(
  systemPrompt: string,
  userMessage: string,
  agentLabel: string,
  retries = 2
): Promise<T> {
  const client = makeClient();
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 16384,
      });

      const rawText = response.choices[0]?.message?.content || "";
      if (!rawText.trim()) {
        throw new Error("Empty response from model.");
      }

      // Sanitize JS-isms that are not valid JSON before parsing
      const sanitized = rawText
        .replace(/:\s*undefined\b/g, ": null")    // undefined → null
        .replace(/\/\/[^\n]*/g, "")               // strip // line comments
        .replace(/\/\*[\s\S]*?\*\//g, "");        // strip /* */ block comments

      const parsed = JSON.parse(sanitized);
      return parsed as T;
    } catch (err: any) {
      console.warn(`[PlanningStep] ${agentLabel} attempt ${attempt + 1} failed: ${err.message}`);
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw new Error(`[PlanningStep] ${agentLabel} failed after ${retries + 1} attempts: ${lastError?.message}`);
}

/**
 * Runs Planning Process:
 * - TOP_LEVEL: 5-Agent Deliberative Planning:
 *   1. Planners A, B, C generate RAW text proposals in parallel.
 *   2. Meta-Reasoning Auditor audits the 3 raw proposal texts.
 *   3. ONLY the Final Consolidator parses all 4 raw text outputs and generates the structured JSON TaskDAG.
 * - GROUND_LEVEL: Single Ground-Level Planner Agent generates structured JSON TaskDAG.
 */
export async function runPlanningStep(
  input: string,
  fullSpec: string,
  level: PlanLevel,
  executionJobId: string,
  parentTaskId?: string,
  onEvent?: (event: ExecutionEvent) => void
): Promise<PlanningStepResult> {
  const startTime = Date.now();

  if (onEvent) {
    onEvent({
      type: "planning_started",
      payload: { level, executionJobId, parentTaskId },
      timestamp: startTime,
    });
  }

  const promptUserContext = `[PROJECT OVERARCHING SPECIFICATION]\n${fullSpec}\n\n[CURRENT PLANNING INPUT / MANDATE (${level})]\n${input}`;

  // ── GROUND-LEVEL: Single Agent Planner ──────────────────────────────────────
  if (level === "GROUND_LEVEL") {
    console.log(`[PlanningStep] GROUND_LEVEL: Launching Single Ground-Level Planner Agent for task ${parentTaskId}...`);

    const rawDag = await callJsonModeAgent<any>(
      SINGLE_GROUND_LEVEL_PLANNER_PROMPT,
      promptUserContext,
      "Single Ground-Level Planner"
    );

    const tasks: TaskNode[] = (rawDag.tasks || []).map((t: any, idx: number) => ({
      id: t.id || `ground-task-${idx + 1}`,
      batchId: t.batchId || "batch-1",
      title: t.title || `Ground Task ${idx + 1}`,
      description: t.description || "No description provided.",
      agentRole: t.agentRole === "MANAGER" ? "MANAGER" : "WORKER",
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
      filesToRead: Array.isArray(t.filesToRead) ? t.filesToRead : [],
      filesToWrite: Array.isArray(t.filesToWrite) ? t.filesToWrite : [],
      estimatedComplexity: t.estimatedComplexity || "MEDIUM",
      managerInstructions: t.managerInstructions || undefined,
      rollbackOnFailure: t.rollbackOnFailure ?? true,
      status: "PENDING",
    }));

    const finalDag: TaskDAG = {
      id: rawDag.id || randomUUID(),
      level: "GROUND_LEVEL",
      parentTaskId,
      executionJobId,
      fullSpecSummary: rawDag.fullSpecSummary || fullSpec.substring(0, 300),
      tasks,
      createdAt: Date.now(),
      status: "ACTIVE",
    };

    if (onEvent) {
      onEvent({
        type: "planning_proposal",
        payload: { plannerRole: "SINGLE_GROUND_PLANNER", taskCount: finalDag.tasks.length },
        timestamp: Date.now(),
      });
      onEvent({
        type: "planning_complete",
        payload: {
          level: "GROUND_LEVEL",
          taskCount: finalDag.tasks.length,
          batchCount: new Set(finalDag.tasks.map((t) => t.batchId)).size,
          dag: finalDag,
        },
        timestamp: Date.now(),
      });
    }

    console.log(
      `[PlanningStep] Single Ground-Level Planner Complete! Produced ${finalDag.tasks.length} tasks across ${
        new Set(finalDag.tasks.map((t) => t.batchId)).size
      } batches for parent task ${parentTaskId}.`
    );

    const singleProposal: PlannerProposal = {
      plannerRole: "SINGLE_GROUND_PLANNER",
      rationale: "Single Agent Ground-Level Planning",
      tasks: finalDag.tasks,
    };

    return {
      proposalA: singleProposal,
      proposalB: { plannerRole: "DEPENDENCY_RISK", rationale: "Single agent mode", tasks: [] },
      proposalC: { plannerRole: "EXECUTION_SEQUENCER", rationale: "Single agent mode", tasks: [] },
      audit: { overallVerdict: "APPROVED", auditReport: "Single agent ground planning complete.", issues: [] },
      finalDag,
    };
  }

  // ── TOP_LEVEL: 5-Agent Deliberative Planning ─────────────────────────────
  // Phase 1: 3 Parallel Planners generate raw text proposals
  console.log(`[PlanningStep] TOP_LEVEL Phase 1: Launching 3 parallel planners for raw text proposals...`);

  const [rawTextA, rawTextB, rawTextC] = await Promise.all([
    callRawTextAgent(
      ARCHITECTURE_PLANNER_PROMPT,
      promptUserContext,
      "Planner A (Architecture)"
    ).then((res) => {
      if (onEvent) {
        onEvent({
          type: "planning_proposal",
          payload: { plannerRole: "ARCHITECTURE", taskCount: 1, rawText: res },
          timestamp: Date.now(),
        });
      }
      return res;
    }),

    callRawTextAgent(
      DEPENDENCY_PLANNER_PROMPT,
      promptUserContext,
      "Planner B (Dependency/Risk)"
    ).then((res) => {
      if (onEvent) {
        onEvent({
          type: "planning_proposal",
          payload: { plannerRole: "DEPENDENCY_RISK", taskCount: 1, rawText: res },
          timestamp: Date.now(),
        });
      }
      return res;
    }),

    callRawTextAgent(
      SEQUENCER_PLANNER_PROMPT,
      promptUserContext,
      "Planner C (Sequencer)"
    ).then((res) => {
      if (onEvent) {
        onEvent({
          type: "planning_proposal",
          payload: { plannerRole: "EXECUTION_SEQUENCER", taskCount: 1, rawText: res },
          timestamp: Date.now(),
        });
      }
      return res;
    }),
  ]);

  // ── Phase 2: Audit Agent (Sequential, evaluates 3 raw text proposals) ───────
  console.log(`[PlanningStep] TOP_LEVEL Phase 2: Auditing raw proposals with Planning Auditor...`);

  const auditInput = `${promptUserContext}\n\n[PROPOSAL A - ARCHITECTURE (RAW TEXT)]\n${rawTextA}\n\n[PROPOSAL B - DEPENDENCY/RISK (RAW TEXT)]\n${rawTextB}\n\n[PROPOSAL C - EXECUTION SEQUENCER (RAW TEXT)]\n${rawTextC}`;

  const rawAudit = await callRawTextAgent(
    PLANNING_AUDITOR_PROMPT,
    auditInput,
    "Planning Auditor"
  );

  if (onEvent) {
    onEvent({
      type: "planning_audit",
      payload: { issueCount: 0, verdict: rawAudit.includes("NEEDS_REVISION") ? "NEEDS_REVISION" : "APPROVED", auditReport: rawAudit },
      timestamp: Date.now(),
    });
  }

  // ── Phase 3: Consolidator Agent (Sequential) — ONLY CONSOLIDATOR PRODUCES STRUCTURED JSON TaskDAG ──
  console.log(`[PlanningStep] TOP_LEVEL Phase 3: Consolidating final TaskDAG from 4 raw text outputs...`);

  const consolidatorInput = `${auditInput}\n\n[META-REASONING AUDIT REPORT (RAW TEXT)]\n${rawAudit}`;

  const rawDag = await callJsonModeAgent<any>(
    PLANNING_CONSOLIDATOR_PROMPT,
    consolidatorInput,
    "Planning Consolidator"
  );

  // Validate and format TaskDAG
  let rawTasks: any[] = rawDag.tasks || rawDag.planData?.tasks || rawDag.dag?.tasks || rawDag.canonicalDag?.tasks || (Array.isArray(rawDag) ? rawDag : []);

  const tasks: TaskNode[] = (rawTasks || []).map((t: any, idx: number) => ({
    id: t.id || `node-${idx + 1}`,
    batchId: t.batchId || "batch-1",
    title: t.title || `Task ${idx + 1}`,
    description: t.description || "No description provided.",
    agentRole: t.agentRole === "MANAGER" ? "MANAGER" : "WORKER",
    dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
    filesToRead: Array.isArray(t.filesToRead) ? t.filesToRead : [],
    filesToWrite: Array.isArray(t.filesToWrite) ? t.filesToWrite : [],
    estimatedComplexity: t.estimatedComplexity || "MEDIUM",
    managerInstructions: t.managerInstructions || undefined,
    rollbackOnFailure: t.rollbackOnFailure ?? true,
    status: "PENDING",
  }));

  const finalDag: TaskDAG = {
    id: rawDag.id || randomUUID(),
    level,
    parentTaskId,
    executionJobId,
    fullSpecSummary: rawDag.fullSpecSummary || fullSpec.substring(0, 300),
    tasks,
    createdAt: Date.now(),
    status: "ACTIVE",
  };

  if (onEvent) {
    onEvent({
      type: "planning_complete",
      payload: {
        level,
        taskCount: finalDag.tasks.length,
        batchCount: new Set(finalDag.tasks.map((t) => t.batchId)).size,
        dag: finalDag,
      },
      timestamp: Date.now(),
    });
  }

  console.log(
    `[PlanningStep] TOP_LEVEL Complete! Produced ${finalDag.tasks.length} tasks across ${
      new Set(finalDag.tasks.map((t) => t.batchId)).size
    } batches.`
  );

  const proposalA: PlannerProposal = { plannerRole: "ARCHITECTURE", rationale: rawTextA, tasks: [] };
  const proposalB: PlannerProposal = { plannerRole: "DEPENDENCY_RISK", rationale: rawTextB, tasks: [] };
  const proposalC: PlannerProposal = { plannerRole: "EXECUTION_SEQUENCER", rationale: rawTextC, tasks: [] };
  const audit: PlanningAudit = { overallVerdict: rawAudit.includes("NEEDS_REVISION") ? "NEEDS_REVISION" : "APPROVED", auditReport: rawAudit, issues: [] };

  return {
    proposalA,
    proposalB,
    proposalC,
    audit,
    finalDag,
  };
}
