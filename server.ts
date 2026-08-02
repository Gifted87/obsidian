import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { ThinkingEngine } from './src/lib/engine.ts';
import { DeepSeekEngine, globalCacheTracker } from './src/lib/deepseek_engine.ts';
import { IThinkingEngine } from './src/lib/engine_interface.ts';
import { Dimension, ReasoningGraph, GraphUtils, ThoughtStep } from './src/lib/types.ts';
import { keyRotator } from './src/lib/key_rotator.ts';
import { PromptMemory } from './src/lib/prompt_memory.ts';
import { SessionMemory } from './src/lib/session_memory.ts';
import { ExecutionJob, ExecutionEvent } from './src/executor/dag_types.ts';
import { FileLockManager } from './src/executor/file_lock_manager.ts';
import { DagExecutor } from './src/executor/dag_executor.ts';

dotenv.config();

const app = express();
const port = 3030;
const activeSessions = new Map<string, (response: string) => void>();

// Per-session mid-session instructions — injected into the loop on the next controller turn
const sessionInstructions = new Map<string, string>();

// Store reasoning graphs per session
const sessionGraphs = new Map<string, ReasoningGraph>();

/**
 * Per-session engine cache.
 * Reusing the same engine instance across all steps of a session is important for:
 *   1. DeepSeek prefix caching — identical message prefixes on sequential calls hit the cache.
 *   2. Cumulative cache stats via the module-level globalCacheTracker.
 * Engines are evicted when the session is cleaned up in the /api/think finally block.
 */
const sessionEngines = new Map<string, IThinkingEngine>();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const apiKey = process.env.GEMINI_API_KEY;

// Check keys for both providers
const geminiKeysExist = keyRotator.hasKeys();
const deepseekKeysExist = !!(process.env.DEEPSEEK_API_KEYS || process.env.DEEPSEEK_API_KEY);

if (!geminiKeysExist && !deepseekKeysExist) {
  console.error("CRITICAL ERROR: No API keys found in the environment for either Gemini or DeepSeek.");
  console.error("Please ensure you have configured GEMINI_API_KEY/GEMINI_API_KEYS or DEEPSEEK_API_KEYS in your .env file.");
  process.exit(1);
}

// Runtime provider state, default to the configured AI_PROVIDER or 'deepseek'
let currentProvider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
if (currentProvider !== 'gemini' && currentProvider !== 'deepseek') {
  currentProvider = 'deepseek';
}

console.log(`Initial AI Provider: ${currentProvider.toUpperCase()}`);
if (currentProvider === 'deepseek' && !deepseekKeysExist) {
  console.warn("WARNING: DeepSeek provider selected, but no DeepSeek API keys were found. Calls might fail.");
} else if (currentProvider === 'gemini' && !geminiKeysExist) {
  console.warn("WARNING: Gemini provider selected, but no Gemini API keys were found. Calls might fail.");
}

/**
 * Factory to return the currently active AI Thinking Engine for a given session.
 * For DeepSeek sessions the engine is cached per-session to enable prefix caching
 * across the multi-step reasoning loop.
 */
function getEngine(
  sessionId?: string,
  onRetry?: (msg: string) => void,
  onEvent?: (type: string, payload: any) => void
): IThinkingEngine {
  if (currentProvider === 'gemini') {
    return new ThinkingEngine(apiKey, onRetry, onEvent);
  }

  // Reuse the cached engine for this session if it exists.
  if (sessionId && sessionEngines.has(sessionId)) {
    const cached = sessionEngines.get(sessionId)!;
    // Update callbacks on the cached instance (they may differ per SSE connection)
    (cached as any).onRetry = onRetry;
    (cached as any).onEvent = onEvent;
    return cached;
  }

  const engine = new DeepSeekEngine(undefined, onRetry, onEvent);
  if (sessionId) {
    sessionEngines.set(sessionId, engine);
  }
  return engine;
}

// Provider switching API endpoints
app.get('/api/provider', (req, res) => {
  res.json({ provider: currentProvider });
});

app.post('/api/set-provider', (req, res) => {
  const { provider } = req.body;
  if (!provider || (provider !== 'gemini' && provider !== 'deepseek')) {
    return res.status(400).json({ error: "Invalid provider. Must be 'gemini' or 'deepseek'." });
  }

  currentProvider = provider;
  console.log(`Runtime AI Provider switched to: ${currentProvider.toUpperCase()}`);
  res.json({ provider: currentProvider });
});

// Cache statistics endpoint — exposes DeepSeek prefix-cache performance metrics
app.get('/api/cache-stats', (req, res) => {
  const stats = globalCacheTracker.getStats();
  res.json({
    ...stats,
    hitRatePct: stats.totalPromptTokens > 0
      ? Number(((stats.totalHitTokens / stats.totalPromptTokens) * 100).toFixed(1))
      : 0,
    estimatedCostSavingsPct: stats.totalPromptTokens > 0
      ? Number(((stats.totalHitTokens / stats.totalPromptTokens) * 90).toFixed(1)) // cache hit is ~1/10th cost → 90% saving on those tokens
      : 0,
    note: 'DeepSeek context caching is automatic. prompt_cache_hit_tokens are billed at ~1/10th the normal input price.',
  });
});

// Endpoint to inject a priority instruction into the CURRENT ongoing think session.
// The instruction is consumed by the controller loop at the start of its next reasoning turn.
app.post('/api/instruct', (req, res) => {
  const { sessionId, instruction } = req.body;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: "sessionId is required." });
  }
  if (!instruction || typeof instruction !== 'string') {
    return res.status(400).json({ error: "instruction must be a non-empty string." });
  }
  const trimmed = instruction.trim();
  sessionInstructions.set(sessionId, trimmed);
  console.log(`[Session ${sessionId}] Instruction queued: "${trimmed}"`);
  res.json({ ok: true, sessionId, instruction: trimmed });
});



app.post('/api/interactive-response', (req, res) => {
  const { sessionId, response: userResponse } = req.body;
  const resume = activeSessions.get(sessionId);

  if (!sessionId || !resume) {
    return res.status(404).json({ error: "No pending interactive request found for this session." });
  }

  activeSessions.delete(sessionId);
  resume(String(userResponse || "").trim());
  res.json({ ok: true });
});

app.get('/api/prompt-memory', (req, res) => {
  res.json(PromptMemory.load());
});

app.post('/api/prompt-memory/:id/upvote', (req, res) => {
  // Not used in new schema, but we keep the endpoint for UI compatibility
  res.json({ ok: true });
});

app.post('/api/prompt-memory/:id/downvote', (req, res) => {
  const mutations = PromptMemory.load();
  const m = mutations.find(x => x.id === req.params.id);
  if (m) {
    m.status = "RETIRED";
    PromptMemory.save(mutations);
  }
  res.json({ ok: true });
});

function waitForInteractiveResponse(sessionId: string): Promise<string> {
  return new Promise((resolve) => {
    activeSessions.set(sessionId, resolve);
  });
}

function appendInteractiveResponse(currentInput: string | any[], response: string): string | any[] {
  const directive = `\n\n[USER INTERACTIVE RESPONSE: ${response}]`;

  if (typeof currentInput === 'string') {
    return `${currentInput}${directive}`;
  }

  const nextInput = [...currentInput];
  if (nextInput[0]?.text) {
    nextInput[0] = { ...nextInput[0], text: `${nextInput[0].text}${directive}` };
  }
  return nextInput;
}

app.post('/api/think', async (req, res) => {
  const { input, files, mode, context, isContinuation } = req.body;
  const sessionId = (req.body.sessionId && String(req.body.sessionId).trim()) || randomUUID();

  // (Mid-session instructions are handled dynamically in the reasoning loop)

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const send = (type: string, payload: any) => {
    res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
  };

  const engine = getEngine(
    sessionId,
    (msg) => send('retry', msg),
    (type, payload) => send(type, payload)
  );

  try {
    let reasoningGraph: ReasoningGraph;
    let nextDim: any = null;
    let currentInput: any;
    let macroPlan: any;

    if (isContinuation) {
      const existingGraph = sessionGraphs.get(sessionId);
      if (!existingGraph) {
        throw new Error("Session graph not found for continuation.");
      }
      reasoningGraph = existingGraph;
      currentInput = reasoningGraph.metadata.originalInput;
      macroPlan = reasoningGraph.metadata.macroPlan;
      nextDim = Dimension.UNDERSTANDING; // Start follow-up with understanding

      // Append follow-up prompt to currentInput
      const directive = `\n\n[USER FOLLOW-UP]: ${input}`;
      if (typeof currentInput === 'string') {
        currentInput += directive;
      } else {
        currentInput[0] = { ...currentInput[0], text: `${currentInput[0].text}${directive}` };
      }
      reasoningGraph.metadata.originalInput = currentInput;

      // Add a synthetic interactive step for the UI
      const followUpStep: ThoughtStep = {
        dimension: Dimension.INTERACTIVE,
        question: "User Follow-up",
        answers: {
          internal: `User Follow-up: ${input}`,
          archival: "The user provided a follow-up prompt to continue the session.",
          external: "N/A"
        },
        controllerDecision: {
          nextDimension: Dimension.UNDERSTANDING,
          reasoning: "User provided a follow-up. Analyzing new intent."
        }
      };
      
      const node = GraphUtils.addNode(reasoningGraph, followUpStep, reasoningGraph.activeHeadId || null);
      send('step', followUpStep);
      send('graph_update', GraphUtils.serialize(reasoningGraph));

      activeSessions.set(sessionId, () => {});
    } else {
      reasoningGraph = {
        nodes: new Map(),
        rootIds: [],
        activeHeadId: "",
        metadata: { sessionId, createdAt: Date.now(), totalBranches: 0, maxDepth: 0 }
      };
      sessionGraphs.set(sessionId, reasoningGraph);
      
      currentInput = input;

      // Support multimodal input
      if (files && files.length > 0) {
        currentInput = [
          { text: input },
          ...files.map((f: any) => ({
            inlineData: { mimeType: f.type, data: f.base64 }
          }))
        ];
      }

      // Append user-supplied context so all agents can reason from it
      if (context && typeof context === 'string' && context.trim()) {
        const contextBlock = `\n\n[USER-PROVIDED CONTEXT — treat this as authoritative reference material that agents may draw from when answering questions]:\n${context.trim()}`;
        if (typeof currentInput === 'string') {
          currentInput += contextBlock;
        } else {
          currentInput[0] = { ...currentInput[0], text: (currentInput[0].text || '') + contextBlock };
        }
      }

      // Get the initial dimension from the controller (with guidance to choose Understanding or Interactive)
      const initialDimDecision = await engine.getInitialDimension(currentInput, mode, sessionId);
      nextDim = initialDimDecision.dimension;
      send('initial_dimension', {
        dimension: nextDim,
        reasoning: initialDimDecision.reasoning
      });

      reasoningGraph.metadata.originalInput = currentInput;
    }

    let safetyCounter = 0;

    while (safetyCounter < 120) {
      let isTerminated = false;
      while (!isTerminated && safetyCounter < 120) {
        send('current_dimension', nextDim);

        // ── Mid-session instruction injection ──────────────────────────────────
        // Consume any instruction the user sent via /api/instruct during this session.
        // It is prepended to currentInput so the controller (and all agents) see it
        // on this exact reasoning turn, then cleared so it only fires once.
        const midInstruction = sessionInstructions.get(sessionId);
        if (midInstruction) {
          sessionInstructions.delete(sessionId);
          const instructionBlock =
            `[MID-SESSION USER INSTRUCTION — highest priority, override previous direction if needed]:\n${midInstruction}\n\n`;
          if (typeof currentInput === 'string') {
            currentInput = instructionBlock + currentInput;
          } else {
            currentInput[0] = { ...currentInput[0], text: instructionBlock + (currentInput[0].text || '') };
          }
          console.log(`[Session ${sessionId}] Instruction injected into turn: "${midInstruction}"`);
          send('instruction_active', { instruction: midInstruction });
        }
        // ──────────────────────────────────────────────────────────────────────

        const lastStepNode = reasoningGraph.activeHeadId ? reasoningGraph.nodes.get(reasoningGraph.activeHeadId) : null;
        let decision: any; // ControllerDecision
        
        if (!lastStepNode) {
          decision = { mode: "SINGLE", dimension: nextDim, reasoning: "Initial dimension" };
        } else {
          send('status', 'Controller deciding next move...');
          decision = await engine.getNextDecision(currentInput, lastStepNode.step, reasoningGraph, mode, safetyCounter);
          // Store the decision in the previous step so it appears in the history
          lastStepNode.step.controllerDecision = {
            nextDimension: decision.dimension,
            reasoning: decision.reasoning
          };

          const ancestorChain = GraphUtils.getAncestorChain(reasoningGraph, lastStepNode.id);
          const stepIndex = ancestorChain.length - 1;
          send('step_update', { index: stepIndex, step: lastStepNode.step });
          send('graph_update', GraphUtils.serialize(reasoningGraph));
        }

        if (decision.dimension === "TERMINATE") {
          if (lastStepNode) {
            lastStepNode.step.controllerDecision = {
              nextDimension: "TERMINATE",
              reasoning: decision.reasoning
            };
            const ancestorChain = GraphUtils.getAncestorChain(reasoningGraph, lastStepNode.id);
            const stepIndex = ancestorChain.length - 1;
            send('step_update', { index: stepIndex, step: lastStepNode.step });
          }
          isTerminated = true;
          break;
        }

        const dimToRun = decision.dimension;
        send('current_dimension', dimToRun);

        const step = await engine.runStep(dimToRun, currentInput, reasoningGraph, mode);
        GraphUtils.addNode(reasoningGraph, step, reasoningGraph.activeHeadId || null);
        
        send('graph_update', GraphUtils.serialize(reasoningGraph));
        send('step', step);

        if (dimToRun === Dimension.INTERACTIVE) {
          const ancestorChain = GraphUtils.getAncestorChain(reasoningGraph, reasoningGraph.activeHeadId);
          const stepIndex = ancestorChain.length - 1;
          const rationale = ancestorChain[stepIndex - 1]?.controllerDecision?.reasoning
            || "The controller needs direct user input before it can continue with confidence.";

          send('interactive_request', {
            sessionId,
            question: step.question,
            rationale,
          });

          const userResponse = await waitForInteractiveResponse(sessionId);
          currentInput = appendInteractiveResponse(currentInput, userResponse);

          step.answers = {
            internal: `User response: ${userResponse}`,
            archival: "The user supplied this clarification directly through the interactive dialog.",
            external: "No external lookup was needed for this interactive turn.",
          };
          step.controllerDecision = {
            nextDimension: Dimension.UNDERSTANDING,
            reasoning: "The user has supplied new clarification. Return to Understanding to integrate it before selecting the next reasoning route.",
          };
          
          const headNode = reasoningGraph.nodes.get(reasoningGraph.activeHeadId);
          if (headNode) headNode.step = step;
          
          send('step_update', { index: stepIndex, step });
          send('graph_update', GraphUtils.serialize(reasoningGraph));
        }
        safetyCounter++;
      }

      send('current_dimension', null);

      // Call Grounding every 3 loops to prevent hallucination buildup
      if (safetyCounter > 0 && safetyCounter % 3 === 0) {
        send('status', 'Running grounding analysis to verify reasoning...');
        const grounding = await engine.runGrounding(currentInput, reasoningGraph);
        send('grounding_result', grounding);

        // If hallucinations require attention, signal the controller to revisit reasoning
        if (grounding.verdict === 'REQUIRES_ATTENTION') {
          send('warning', `Hallucinations detected: ${grounding.report}. Controller will revisit reasoning.`);
          // Add grounding report as context for next reasoning cycle
          const groundingDirective = `\n\n[GROUNDING CHECK RESULT]: ${grounding.report}`;
          if (typeof currentInput === 'string') {
            currentInput += groundingDirective;
          } else {
            currentInput[0].text += groundingDirective;
          }
          // Reset to Understanding to re-examine the problematic reasoning
          nextDim = Dimension.UNDERSTANDING;
          safetyCounter++;
          continue;
        }
      }

      const synthesis = await engine.synthesizeIntent(currentInput, reasoningGraph, mode);

      if (synthesis.status === "CONTINUE" && synthesis.nextDimension) {
        nextDim = synthesis.nextDimension;
        if (synthesis.newDirective) {
          const directive = `\n\n[SYNTHESIZER DIRECTIVE: ${synthesis.newDirective}]`;
          if (typeof currentInput === 'string') {
            currentInput += directive;
          } else {
            currentInput[0].text += directive;
          }
        }
        send('synthesis_continue', synthesis);
      } else {
        send('final_intent', synthesis.content);
        reasoningGraph.metadata.finalIntent = synthesis.content;

        // Generate Final Report
        send('status', 'Generating architectural report...');
        try {
          const report = await engine.generateFinalReport(currentInput, reasoningGraph, synthesis.content);
          send('final_report', report);
          reasoningGraph.metadata.finalReport = report;
        } catch (reportErr) {
          console.error("Report Generation Failed:", reportErr);
        }

        // Generate TTS
        send('status', 'Synthesizing neural audio...');
        try {
          const audio = await engine.generateTTS(synthesis.content.substring(0, 500));
          send('audio_base64', audio);
          reasoningGraph.metadata.audioBase64 = audio;
        } catch (ttsErr) {
          console.error("TTS Generation Failed:", ttsErr);
        }

        break;
      }
    }

    if (safetyCounter >= 120) {
      send('error', "Safety Termination: Cognitive loop exceeded maximum allowed steps (120).");
    }

  } catch (error) {
    console.error("Think error:", error);
    send('error', (error as Error).message);
  } finally {
    activeSessions.delete(sessionId);
    sessionInstructions.delete(sessionId); // clean up any unconsumed instruction
    sessionEngines.delete(sessionId);       // evict cached engine — session is over
    res.end();
  }
});

app.post('/api/summary', async (req, res) => {
  const { sessionId, steps } = req.body;
  try {
    let graph = sessionId ? sessionGraphs.get(sessionId) : null;

    if (!graph && steps && Array.isArray(steps) && steps.length > 0) {
      graph = {
        nodes: new Map(),
        rootIds: [],
        activeHeadId: "",
        metadata: { sessionId: sessionId || "temp", createdAt: Date.now(), totalBranches: 0, maxDepth: steps.length }
      };
      steps.forEach((step: any, idx: number) => {
        const nodeId = `step-${idx}`;
        graph!.nodes.set(nodeId, {
          id: nodeId,
          step: step,
          parentIds: idx > 0 ? [`step-${idx - 1}`] : [],
          childIds: idx < steps.length - 1 ? [`step-${idx + 1}`] : [],
          depth: idx,
          timestamp: Date.now()
        });
        if (idx === 0) graph!.rootIds.push(nodeId);
        graph!.activeHeadId = nodeId;
      });
    }

    if (!graph) return res.status(404).json({ error: "Session graph or thought steps not found." });
    // Use a fresh engine for summary — no session affinity needed here.
    const engine = currentProvider === 'gemini'
      ? new ThinkingEngine(apiKey)
      : new DeepSeekEngine();
    const summary = await engine.generateSummary(graph);
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/graph/:sessionId', (req, res) => {
  const graph = sessionGraphs.get(req.params.sessionId);
  if (!graph) return res.status(404).json({ error: "Session not found." });
  res.json(GraphUtils.serialize(graph));
});

app.post('/api/sessions/save', (req, res) => {
  const { sessionId, name } = req.body;
  const graph = sessionGraphs.get(sessionId);
  if (!graph) {
    return res.status(404).json({ error: "Session graph not found in active memory." });
  }
  
  try {
    SessionMemory.save({
      id: sessionId,
      name,
      createdAt: Date.now(),
      graph
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/sessions', (req, res) => {
  res.json(SessionMemory.list());
});

app.get('/api/sessions/:id', (req, res) => {
  const session = SessionMemory.load(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found." });
  }
  
  // Re-hydrate into server RAM so it can be continued later
  sessionGraphs.set(session.graph.metadata.sessionId, session.graph);
  
  // Flatten steps for the frontend
  const steps = GraphUtils.getAncestorChain(session.graph, session.graph.activeHeadId);
  
  res.json({ session, steps });
});

// ── OVAN EXECUTION SYSTEM ENDPOINTS ──────────────────────────────────────

const activeExecutionJobs = new Map<string, DagExecutor>();

/**
 * POST /api/execute
 * Ingests a completed thinking session's Final Report, runs the 5-agent planning step,
 * and streams execution events (workers, managers, file locks) via SSE.
 */
app.post('/api/execute', async (req, res) => {
  const { thinkingSessionId, finalReport: reportPayload } = req.body;
  if (!thinkingSessionId && !reportPayload) {
    return res.status(400).json({ error: "thinkingSessionId or finalReport is required." });
  }

  let finalReport = reportPayload;
  if (!finalReport && thinkingSessionId) {
    const graph = sessionGraphs.get(thinkingSessionId) || SessionMemory.load(thinkingSessionId)?.graph;
    finalReport = graph?.metadata.finalReport || graph?.metadata.finalIntent;
  }

  if (!finalReport) {
    return res.status(404).json({ error: "Final report not found for this thinking session." });
  }

  const jobId = randomUUID();
  const executionJob: ExecutionJob = {
    id: jobId,
    thinkingSessionId: thinkingSessionId || "direct",
    finalReport,
    status: "INITIALIZING",
    createdAt: Date.now(),
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendEvent = (event: ExecutionEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const fileLockManager = FileLockManager.getInstance(30000, sendEvent);
  const executor = new DagExecutor(executionJob, fileLockManager, process.cwd(), sendEvent);
  activeExecutionJobs.set(jobId, executor);

  try {
    await executor.execute();
  } catch (err: any) {
    console.error(`[Execution API] Job ${jobId} error:`, err);
    sendEvent({
      type: "job_failed",
      payload: { jobId, error: err.message },
      timestamp: Date.now(),
    });
  } finally {
    activeExecutionJobs.delete(jobId);
    res.end();
  }
});

/**
 * GET /api/execute/:jobId
 * Fetch current state of an execution job from disk memory.
 */
app.get('/api/execute/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const filePath = path.join(process.cwd(), 'memory', 'execution', `${jobId}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Execution job not found." });
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/download/:jobId
 * Serves the downloadable project zip for a completed execution job.
 */
app.get('/api/download/:jobId', (req, res) => {
  const rawId = req.params.jobId || '';
  const jobId = rawId.replace(/^project-/, '').replace(/\.zip$/, '');
  const zipPath = path.join(process.cwd(), 'public', 'downloads', `project-${jobId}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: `Project zip archive for job ${jobId} not found.` });
  }

  res.download(zipPath, `project-${jobId}.zip`, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: `Failed to send download: ${err.message}` });
    }
  });
});

/**
 * GET /api/execute/:jobId/logs/:agentId
 * Fetch full console logs for a specific worker or manager agent.
 */
app.get('/api/execute/:jobId/logs/:agentId', (req, res) => {
  const agentId = req.params.agentId;
  const logPath = path.join(process.cwd(), 'logs', 'agents', `${agentId}.log`);
  if (!fs.existsSync(logPath)) {
    return res.status(404).json({ error: "Log file not found for this agent." });
  }
  const content = fs.readFileSync(logPath, 'utf-8');
  res.type('text/plain').send(content);
});

/**
 * POST /api/execute/:jobId/abort
 * Abort a running execution job and release all file locks.
 */
app.post('/api/execute/:jobId/abort', (req, res) => {
  const jobId = req.params.jobId;
  const executor = activeExecutionJobs.get(jobId);
  if (!executor) {
    return res.status(404).json({ error: "No running execution job found with this ID." });
  }
  activeExecutionJobs.delete(jobId);
  FileLockManager.getInstance().stopDeadlockDetector();
  res.json({ ok: true, jobId, message: "Execution job aborted." });
});

/**
 * Cache Warmup — fires a minimal API call on server startup so that DeepSeek's
 * distributed disk cache is seeded with the STATIC_SYSTEM_PROMPT prefix.
 * After this call, all subsequent requests that share the same system prompt
 * prefix will be served from cache at ~1/10th the token cost.
 *
 * Only runs when the DeepSeek provider is active and keys are configured.
 */
async function warmupCache(): Promise<void> {
  if (currentProvider !== 'deepseek' || !deepseekKeysExist) return;
  try {
    console.log('[CacheWarmup] Pre-warming DeepSeek prefix cache...');
    const warmupEngine = new DeepSeekEngine();
    // Fire a minimal no-op call. The system prompt is identical to production calls,
    // so DeepSeek will cache it. We use generateSuggestions() as it's the
    // lightest method that exercises completeMessages().
    await warmupEngine.generateSuggestions();
    console.log('[CacheWarmup] ✅ DeepSeek prefix cache warmed up successfully. All subsequent calls will benefit from prefix cache hits.');
  } catch (err) {
    // Warmup failure is non-fatal — the server still starts and caching still works
    // automatically; it just means the very first real request will be a cold call.
    console.warn('[CacheWarmup] ⚠ Warmup failed (non-fatal):', (err as Error).message);
  }
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running at http://127.0.0.1:${port}`);
  // Seed the DeepSeek prefix cache in the background after the server is up.
  warmupCache();
});
