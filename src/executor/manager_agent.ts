import OpenAI from "openai";
import { randomUUID } from "crypto";
import { FileLockManager } from "./file_lock_manager.ts";
import { AgentOutput, Batch, ExecutionEvent, ManagerVerdict } from "./dag_types.ts";
import { appendAgentLog, runCommand } from "../tools/terminal_tools.ts";
import { listDir, readFile, writeFile } from "../tools/file_tools.ts";
import { addImport, applyLineEdits, insertFunction, replaceFunction } from "../tools/ast_tools.ts";
import { createBrowserSession, BrowserSession } from "../tools/browser_tools.ts";

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

function getDeepSeekApiKey(): string {
  const keysStr = process.env.DEEPSEEK_API_KEYS || process.env.DEEPSEEK_API_KEY || "";
  const keys = keysStr.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
  if (keys.length === 0) {
    throw new Error("No API keys found for DeepSeek.");
  }
  return keys[Math.floor(Math.random() * keys.length)];
}

function makeClient(): OpenAI {
  return new OpenAI({
    apiKey: getDeepSeekApiKey(),
    baseURL: DEEPSEEK_BASE_URL,
  });
}

/**
 * Manager Agent — ReAct loop AI Agent with Browser Use capabilities.
 * Manages a batch of parallel worker tasks.
 * 1. Formulates an Outcome Model Document before workers run.
 * 2. Verifies worker outputs using filesystem, terminal, AND live browser inspection.
 * 3. Iterates and fixes bugs directly to ensure batch result matches the Outcome Model.
 */
export class ManagerAgent {
  public readonly agentId: string;
  private batch: Batch;
  private fullSpec: string;
  private fileLockManager: FileLockManager;
  private cwd: string;
  private maxFixAttempts: number;
  private onEvent?: (event: ExecutionEvent) => void;
  private outcomeModel: string = "";
  private browserSession: BrowserSession;

  constructor(
    batch: Batch,
    fullSpec: string,
    fileLockManager: FileLockManager,
    cwd: string = process.cwd(),
    maxFixAttempts: number = 5,
    onEvent?: (event: ExecutionEvent) => void
  ) {
    this.agentId = `manager-${randomUUID().substring(0, 8)}`;
    this.batch = batch;
    this.fullSpec = fullSpec;
    this.fileLockManager = fileLockManager;
    this.cwd = cwd;
    this.maxFixAttempts = maxFixAttempts;
    this.onEvent = onEvent;
    this.browserSession = createBrowserSession(this.agentId, onEvent);
  }

  /**
   * Phase 1: Build an Outcome Model Document detailing what the manager expects
   * to see at the end of the batch's tasks to satisfy the spec.
   */
  public async buildOutcomeModel(): Promise<string> {
    const startTime = Date.now();
    appendAgentLog(
      this.agentId,
      `MANAGER STARTED: Building Outcome Model for Batch "${this.batch.batchId}" (${this.batch.tasks.length} tasks)`
    );

    if (this.onEvent) {
      this.onEvent({
        type: "manager_started",
        payload: {
          agentId: this.agentId,
          batchId: this.batch.batchId,
          taskCount: this.batch.tasks.length,
        },
        timestamp: startTime,
      });
    }

    const client = makeClient();

    const systemPrompt = `YOU ARE A SENIOR MANAGER AI AGENT IN AN AGENT SWARM SYSTEM.
YOUR AGENT ID: ${this.agentId}

YOUR GOAL IN THIS PHASE:
Formulate a rigorous "Outcome Model Document" for Batch "${this.batch.batchId}".

INSTRUCTIONS:
1. Review the overarching project specification and all tasks in your assigned batch.
2. Detail exactly what files, components, behaviors, and visual UI elements MUST exist after all workers in this batch finish.
3. State the exact verification criteria (e.g. console errors = 0, specific DOM elements present, build succeeds).`;

    const userPrompt = `[OVERARCHING SPECIFICATION]\n${this.fullSpec}\n\n[BATCH TASKS]\n${JSON.stringify(
      this.batch.tasks,
      null,
      2
    )}`;

    const submitOutcomeModelTool: OpenAI.Chat.Completions.ChatCompletionTool = {
      type: "function",
      function: {
        name: "submit_outcome_model",
        description: "Submit the formal Outcome Model Document defining expected batch outputs and verification criteria.",
        parameters: {
          type: "object",
          properties: {
            outcomeModel: {
              type: "string",
              description: "Comprehensive outcome model text detailing expected files, UI behaviors, and verification rules.",
            },
          },
          required: ["outcomeModel"],
        },
      },
    };

    try {
      const response = await client.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [submitOutcomeModelTool],
        tool_choice: "auto",
        temperature: 0.2,
      });

      const msg = response.choices[0]?.message;
      if (msg?.tool_calls && msg.tool_calls.length > 0) {
        const args = JSON.parse(msg.tool_calls[0].function.arguments || "{}");
        this.outcomeModel = args.outcomeModel || "Outcome model: Verify batch outputs compile clean.";
      } else {
        this.outcomeModel = msg?.content || "Outcome model: Verify files exist and compile clean.";
      }

      appendAgentLog(this.agentId, `OUTCOME MODEL CREATED:\n${this.outcomeModel}`);

      if (this.onEvent) {
        this.onEvent({
          type: "manager_outcome_model",
          payload: {
            agentId: this.agentId,
            batchId: this.batch.batchId,
            preview: this.outcomeModel.substring(0, 300),
            fullModel: this.outcomeModel,
          },
          timestamp: Date.now(),
        });
      }

      return this.outcomeModel;
    } catch (err: any) {
      appendAgentLog(this.agentId, `ERROR building outcome model: ${err.message}`);
      this.outcomeModel = "Default outcome model: Verify batch task outputs.";
      return this.outcomeModel;
    }
  }

  /**
   * Phase 2: Verify worker outputs, inspect browser/console, and apply fixes if needed.
   */
  public async verifyAndFix(workerOutputs: AgentOutput[]): Promise<ManagerVerdict> {
    appendAgentLog(
      this.agentId,
      `MANAGER VERIFY & FIX PHASE STARTED for Batch ${this.batch.batchId}. Received ${workerOutputs.length} worker outputs.`
    );

    if (this.onEvent) {
      this.onEvent({
        type: "manager_verifying",
        payload: {
          agentId: this.agentId,
          batchId: this.batch.batchId,
          workerOutputsCount: workerOutputs.length,
        },
        timestamp: Date.now(),
      });
    }

    const client = makeClient();
    let fixesApplied = 0;
    let isPass = false;
    let managerReport = "";

    const systemPrompt = `YOU ARE A SENIOR MANAGER AI AGENT WITH PRIVILEGED BROWSER AND SYSTEM USE CAPABILITIES.
YOUR AGENT ID: ${this.agentId}

YOUR MANDATE:
Verify that the output produced by the worker agents for Batch "${this.batch.batchId}" fully satisfies your Outcome Model Document and the Overarching Project Specification.

YOU HAVE PRIVILEGED ACCESS TO:
1. Terminal execution to test builds, run linters/compilers, and diagnostic scripts.
2. Filesystem and surgical AST editing tools.
3. PRIVILEGED LIVE BROWSER USE: Only Manager agents have browser use capabilities. You can open URLs, inspect rendered <body> DOM content, read browser console.error messages, click, type, and verify live web applications!

VERIFICATION STEPS:
1. Inspect the modified files and test builds using terminal or file tools.
2. If UI is involved, use your browser tools ("browserOpen", "browserReadDOM", "browserConsoleErrors") to verify the rendered interface.
3. If bugs, broken imports, missing features, or console errors exist, FIX THEM DIRECTLY using AST surgical tools ("replaceFunction", "applyLineEdits") or "writeFile" for brand-new files.
4. Align and realign the batch output until the final result is 100% equal to what you envisioned in your Outcome Model Document.
5. Once verified, call "emitVerdict" with status "PASS". If unfixable, call with "FAIL".

OUTCOME MODEL EXPECTATIONS:
${this.outcomeModel}

WORKER OUTPUTS RECORD:
${JSON.stringify(workerOutputs, null, 2)}`;

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "readFile",
          description: "Read a file from disk.",
          parameters: {
            type: "object",
            properties: { filePath: { type: "string" } },
            required: ["filePath"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "writeFile",
          description: "Create a BRAND-NEW file. STRICTLY PROHIBITED FROM OVERWRITING EXISTING FILES. For modifying existing files, use AST surgical tools.",
          parameters: {
            type: "object",
            properties: {
              filePath: { type: "string" },
              content: { type: "string" },
            },
            required: ["filePath", "content"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "replaceFunction",
          description: "Surgically replace a function/declaration in a file.",
          parameters: {
            type: "object",
            properties: {
              filePath: { type: "string" },
              functionName: { type: "string" },
              newFunctionCode: { type: "string" },
            },
            required: ["filePath", "functionName", "newFunctionCode"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "applyLineEdits",
          description: "Apply targeted surgical line edits to a file.",
          parameters: {
            type: "object",
            properties: {
              filePath: { type: "string" },
              edits: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startLine: { type: "number" },
                    endLine: { type: "number" },
                    targetContent: { type: "string" },
                    replacementContent: { type: "string" },
                  },
                  required: ["startLine", "endLine", "targetContent", "replacementContent"],
                },
              },
            },
            required: ["filePath", "edits"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "runCommand",
          description: "Execute terminal commands (builds, tests, linters).",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string" },
            },
            required: ["command"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "browserOpen",
          description: "Open a URL in the manager's live Playwright browser.",
          parameters: {
            type: "object",
            properties: {
              url: { type: "string", description: "URL to open (e.g. http://localhost:3000)" },
            },
            required: ["url"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "browserReadDOM",
          description: "Read rendered <body> HTML content from the active browser page.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "browserConsoleErrors",
          description: "Fetch all browser console.error messages logged during page execution.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "emitVerdict",
          description: "Finalize the verification phase and output your verdict for the batch.",
          parameters: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["PASS", "FAIL"] },
              report: { type: "string", description: "Detailed verification summary" },
              remainingIssues: { type: "array", items: { type: "string" } },
            },
            required: ["status", "report"],
          },
        },
      },
    ];

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: "Begin verification of batch outputs. Inspect code, run build/test commands, or use browser tools as needed.",
      },
    ];

    for (let step = 0; step < this.maxFixAttempts * 3 && !managerReport; step++) {
      try {
        const response = await client.chat.completions.create({
          model: DEEPSEEK_MODEL,
          messages,
          tools,
          tool_choice: "auto",
        });

        const msg = response.choices[0]?.message;
        if (!msg) break;
        messages.push(msg);

        if (msg.content) {
          appendAgentLog(this.agentId, `MANAGER THINK: ${msg.content}`);
        }

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const toolCall of msg.tool_calls) {
            const fn = (toolCall as any).function;
            if (!fn) continue;
            const toolName = fn.name;
            const args = JSON.parse(fn.arguments || "{}");
            appendAgentLog(this.agentId, `MANAGER TOOL: ${toolName} with args: ${JSON.stringify(args)}`);

            let resultStr = "";

            // Each tool call wrapped independently — always append tool response even on failure
            try {
              if (toolName === "readFile") {
                resultStr = await readFile(args.filePath, this.agentId, this.onEvent, this.cwd);
              } else if (toolName === "writeFile") {
                await writeFile(args.filePath, args.content, this.agentId, this.fileLockManager, this.onEvent, this.cwd);
                fixesApplied++;
                resultStr = `Manager fix applied to ${args.filePath}`;
                if (this.onEvent) {
                  this.onEvent({
                    type: "manager_fix_applied",
                    payload: { agentId: this.agentId, batchId: this.batch.batchId, fixNumber: fixesApplied, description: `Modified ${args.filePath}` },
                    timestamp: Date.now(),
                  });
                }
              } else if (toolName === "replaceFunction") {
                await replaceFunction(args.filePath, args.functionName, args.newFunctionCode, this.agentId, this.fileLockManager, this.onEvent, this.cwd);
                fixesApplied++;
                resultStr = `Manager function fix applied to ${args.filePath}`;
              } else if (toolName === "applyLineEdits") {
                await applyLineEdits(args.filePath, args.edits, this.agentId, this.fileLockManager, this.onEvent, this.cwd);
                fixesApplied++;
                resultStr = `Manager line edits applied to ${args.filePath}`;
              } else if (toolName === "runCommand") {
                const res = await runCommand(args.command, this.cwd, this.agentId, 60000, this.onEvent);
                resultStr = `[Exit ${res.exitCode}]\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`;
              } else if (toolName === "browserOpen") {
                await this.browserSession.open(args.url);
                resultStr = `Browser opened ${args.url}`;
              } else if (toolName === "browserReadDOM") {
                const html = await this.browserSession.readDOM();
                resultStr = html.substring(0, 10000);
              } else if (toolName === "browserConsoleErrors") {
                const errs = await this.browserSession.readConsoleErrors();
                resultStr = JSON.stringify(errs);
              } else if (toolName === "emitVerdict") {
                isPass = args.status === "PASS";
                managerReport = args.report;
                resultStr = `Verdict emitted: ${args.status}`;
              }
            } catch (toolErr: any) {
              resultStr = `ERROR executing tool "${toolName}": ${toolErr.message}`;
              appendAgentLog(this.agentId, `MANAGER TOOL ERROR: ${resultStr}`);
            }

            // Always append tool result message to satisfy API requirements
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: resultStr.substring(0, 30000),
            });
          }
        } else if (!managerReport) {
          messages.push({
            role: "user",
            content: "Please continue verification or call emitVerdict to finish.",
          });
        }
      } catch (err: any) {
        appendAgentLog(this.agentId, `ERROR in Manager verification loop: ${err.message}`);
        // API-level error — no assistant message was pushed, safe to push user message
        messages.push({
          role: "user",
          content: `API error: ${err.message}. Please fix or emit verdict.`,
        });
      }
    }

    // Close browser session
    await this.browserSession.close();

    const verdict: ManagerVerdict = {
      batchId: this.batch.batchId,
      status: isPass ? "PASS" : "FAIL",
      fixesApplied,
      report: managerReport || "Verification phase completed.",
    };

    appendAgentLog(
      this.agentId,
      `MANAGER VERDICT: ${verdict.status} for Batch ${this.batch.batchId}. Fixes applied: ${fixesApplied}.`
    );

    if (this.onEvent) {
      this.onEvent({
        type: "manager_verdict",
        payload: {
          agentId: this.agentId,
          batchId: this.batch.batchId,
          status: verdict.status,
          fixesApplied: verdict.fixesApplied,
          report: verdict.report,
        },
        timestamp: Date.now(),
      });
    }

    return verdict;
  }
}
