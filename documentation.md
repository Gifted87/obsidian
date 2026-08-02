# OVAN System Architecture & Technical Specification

> **OVAN: A Unified Architecture for Multidimensional Machine Contemplation and Autonomous Agent Execution**  
> *Version 2.0 | Engine Core & Harness Specification*

---

## 1. Executive Overview & System Philosophy

The **OVAN System** is a next-generation AI platform that unifies two fundamental pillars of machine intelligence:
1. **Multidimensional Cognitive Contemplation** (The Thinking Engine)
2. **Autonomous Graph-Based Task Execution** (The Agent Harness)

Traditional Large Language Model (LLM) interfaces operate on linear prompt-response paradigms. When presented with a task, a standard model attempts to predict the next sequence of tokens in a single, un-reflected pass. This leads to shallow reasoning, early commitment to flawed architectural choices, hallucination by momentum, and an inability to self-correct during complex multi-step problems.

OVAN addresses this fundamental limitation by decomposing intelligence into two decoupled, asynchronous phases:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PHASE 1: THE THINKING ENGINE                       │
│  Multidimensional Contemplation → 6-Agent Step Swarm → Final Spec      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PHASE 2: THE AGENT HARNESS                         │
│  5-Agent Planning Swarm → DAG Generation → Parallel Worker/Manager Execution │
└─────────────────────────────────────────────────────────────────────────┘
```

In **Phase 1**, OVAN traps the problem in a **Multidimensional Cognitive Loop**. Instead of immediately answering or acting, it forces the AI to traverse nine distinct dimensions of cognition—asking probing questions, gathering internal first-principles logic, searching collective historical memory, evaluating external world data, auditing claims with a dedicated meta-reasoning agent, engaging in stream-of-consciousness monologues, and enforcing strict anti-overreach boundaries.

In **Phase 2**, the synthesized insight produced by Phase 1 becomes the authoritative specification for the **Autonomous Execution Engine**. A 5-agent planning swarm parses the specification into a Directed Acyclic Graph (DAG) of parallel batches. Autonomous Worker agents execute tasks using AST-aware code transformers, terminal runners, and headless browser controllers, while Manager agents pre-model outcomes, verify results using live sandboxes, and apply active fixes before signing off.

---

## 2. Part 1: The Cognitive Engine (Multidimensional Reasoning Layer)

The cognitive layer of OVAN is governed by `ThinkingEngine` (Google GenAI) and `DeepSeekEngine` (DeepSeek OpenAI-compatible provider). It transforms linear LLM calls into a structured, self-auditing graph of reasoning steps (`ReasoningGraph`).

```
                    ┌──────────────────────────────┐
                    │       Controller Agent       │
                    │  (Selects Dimension & Goal)  │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │       Questioner Agent       │
                    │   (Single Probing Question)  │
                    └──────────────┬───────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Internal Bot    │       │ Archival Bot    │       │ External Bot    │
│ First-Principles│       │ Historical/Mem  │       │ Live World/Data │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │    Meta Reasoning Agent      │
                    │  (Audits Logic & Truth)      │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │        Thinking Agent        │
                    │   (Monologue & Final Insight)│
                    └──────────────────────────────┘
```

### 2.1. Dual-Provider Routing & Multi-Key Sticky Affinity Rotator

OVAN provides native multi-provider support with hot-swapping between **Google Gemini** (`gemini-flash-lite-latest`, `gemini-2.5-flash-preview-tts`) and **DeepSeek** (`deepseek-v4-flash`, `deepseek-reasoner`).

To sustain continuous multi-agent sessions without encountering rate limits or quota exhaustion, OVAN implements a session-aware API key rotator:
- **`KeyRotator` (`src/lib/key_rotator.ts`)**: Rotates Gemini API keys across requests using round-robin distribution with automated fallback logic on transient HTTP `429` (Rate Limit) and `503` (Service Unavailable) errors.
- **`DeepSeekKeyRotator` (`src/lib/deepseek_engine.ts`)**: Implements **Sticky Session Key Affinity**. To maximize API provider prompt caching, all calls originating from the same `sessionId` are bound to the same API key. This ensures the prompt cache prefix remains valid on the remote provider across all steps of a reasoning loop.

### 2.2. The 9 Cognitive Dimensions & Strict Anti-Overreach Rules

Reasoning in OVAN is partitioned across nine explicit dimensions (`Dimension` enum in `src/lib/types.ts`). Every dimension enforces strict **Anti-Overreach Boundaries** to prevent agents from jumping to premature conclusions or blurring responsibilities:

1. **`Understanding`**: Focuses strictly on clarifying what the subject means, mapping intent, and defining scope and boundaries.
   * *Anti-Overreach Rule*: Forbidden from proposing solutions, explaining mechanics, or providing execution steps.
2. **`Inquiry`**: Investigates the underlying "why" and "how" of phenomena, referencing core principles and academic theory.
   * *Anti-Overreach Rule*: Forbidden from generating practical implementation steps or speculative what-if scenarios.
3. **`Procedural`**: Formulates operational methodologies, ordered execution steps, and task decompositions.
   * *Anti-Overreach Rule*: Forbidden from analyzing theoretical mechanics or debating counterfactual scenarios.
4. **`Wonder`**: Explores speculative counterfactuals and hypotheticals ("What if core assumptions were removed or inverted?").
   * *Anti-Overreach Rule*: Forbidden from providing realistic plans, actual mechanics, or real consequence analysis.
5. **`Consequence`**: Evaluates downstream risks, trade-offs, security vulnerabilities, and failure modes.
   * *Anti-Overreach Rule*: Forbidden from proposing new directions, explaining root causes, or listing steps.
6. **`Meta-Cognition`**: Audits the quality and integrity of the reasoning trace itself, flagging drift, fixation, or bias.
   * *Anti-Overreach Rule*: Forbidden from introducing new domain ideas or external factual data.
7. **`Creative`**: Executes lateral thinking, reframing problem boundaries, and generating unconventional synthesis when blocked.
   * *Anti-Overreach Rule*: Forbidden from following conventional paths or evaluating standard risks.
8. **`Causal`**: Traces root causes, parameter dependencies, and feedback loops driving observed state behaviors.
   * *Anti-Overreach Rule*: Forbidden from describing actions to take or speculating on alternative models.
9. **`Grounding`**: Fact-checks claims made in the reasoning trace against empirical evidence, formal proofs, or code execution.
   * *Anti-Overreach Rule*: Forbidden from speculating or expanding plans beyond verifiable evidence.

*Special Operational Modes*: `INTERACTIVE` (direct human user prompt input), `INTENT_SYNTHESIS` (final technical directive distillation), and `CODE_OBSERVATION` (ground-truth Docker/local sandbox execution feedback).

### 2.3. The 6-Agent Sequential/Parallel Workflow per Step

Each cognitive step in OVAN executes a structured sequence across six specialized AI agent roles:

1. **The Questioner Agent**: Analyzes the current step's assigned dimension, controller intent, and history. Formulates a single, highly focused, technical question tailored to force the Answerers to fulfill that exact dimension's goal. It is strictly forbidden from answering the question itself.
2. **The Triad of Answerer Agents (Parallel Dispatch)**:
   - **Internal Answerer**: Reasons from first principles, intrinsic anatomy, system mechanics, and theoretical models.
   - **Archival Answerer**: Searches historical precedent, collective human memory, analogies, and past post-mortems.
   - **External Answerer**: Analyzes live real-world context, modern research, market reality, and external domain facts.
3. **The Meta Reasoning Agent**: Consumes the outputs of all three Answerers. Audits them for logical consistency, factual accuracy, overreach, and hallucinations, producing an objective critique.
4. **The Thinking Agent (Main Thinker)**: The primary cognitive consolidator. It enters an unvarnished, stream-of-consciousness internal monologue (`<thinking> ... </thinking>`). In this monologue, it speaks to itself in first person, questions premises, reconciles contradictions between Archival and External perspectives, performs mathematical verifications, and then outputs a consolidated insight (`consolidatedInsight`).
5. **The Controller Agent**: Evaluates the step's consolidated insight alongside the full graph history. Using structured JSON schema output, it decides whether to transition to a new dimension (`SINGLE` mode) or issue a `TERMINATE` directive when reasoning saturation is reached.

### 2.4. DeepSeek Unified Shared History Prefix & Cache Telemetry

To optimize multi-agent LLM latency and cost, `DeepSeekEngine` implements a **Unified Shared History Prefix** (`makeCacheableMessages`):

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [System Prompt]       STATIC_SYSTEM_PROMPT (Immutable across session)          │ ──► ALWAYS HIT
├───────────────────────────────────────────────────────────────────────────────┤
│ [User Prompt]         Core User Query (Immutable across session)              │ ──► ALWAYS HIT
├───────────────────────────────────────────────────────────────────────────────┤
│ [...History]          Immutable Step Trace 1..N (Shared across ALL agents)     │ ──► ALWAYS HIT
├───────────────────────────────────────────────────────────────────────────────┤
│ [Agent Instructions]  Agent Persona Rules (Questioner / Answerer / Meta / etc)│ ──► Branch Point
├───────────────────────────────────────────────────────────────────────────────┤
│ [Task Directive]      Turn-Specific Directive (Dynamic tail)                  │ ──► Dynamic Miss
└───────────────────────────────────────────────────────────────────────────────┘
```

Because all six agents in a reasoning turn receive the exact same `[System] + [User Query] + [History]` prefix, the initial agent (Questioner) warms the remote provider cache. All subsequent agents (Internal, Archival, External, Meta, Main Thinker, Controller) achieve **85%+ prompt cache hit rates**, cutting API token costs by ~90% and accelerating turn completion.

The global telemetry tracker (`CacheTracker`) monitors token hit/miss metrics continuously and exposes live telemetry via `/api/cache-stats`.

### 2.5. Prompt Memory Evolution & Self-Correction

OVAN features a self-evolving prompt system (`PromptMemory` in `src/lib/prompt_memory.ts`). During `Meta-Cognition` steps:
1. The engine extracts prompt mutation proposals (`agentRole`, `proposedAddition`, `rationale`).
2. Mutations are saved to `memory/prompt_mutations.json`.
3. Active mutations are appended dynamically to the tail of targeted agent prompts on subsequent steps, allowing the engine to learn from past reasoning failures within and across sessions.

### 2.6. Async Sandboxed Code Execution Side-Channel

When an Answerer or Thinking Agent requires mathematical verification, data processing, or algorithmic simulation:
1. The agent invokes the `execute_code` function tool (`python3` or `javascript`).
2. `sandbox.ts` dispatches the snippet into a isolated local process or container (`runCodeInSandbox`).
3. The raw `stdout`, `stderr`, `exitCode`, and `elapsedMs` are returned as ground truth.
4. The engine injects a `CODE_OBSERVATION` step into the `ReasoningGraph`, preventing the model from speculating on computational outputs.

---

## 3. Part 2: The Autonomous Execution Engine (Agent Harness Layer)

Once the Thinking Engine synthesizes a final report, OVAN transitions into an **Autonomous Execution Harness** (`DagExecutor` in `src/executor/dag_executor.ts`).

```
                    ┌──────────────────────────────┐
                    │    Final Thinking Report     │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │    5-Agent Planning Swarm    │
                    │ (Architect, Risk, Sequencer, │
                    │    Auditor, Consolidator)    │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │         Task DAG             │
                    │   (Batches 1..N in parallel) │
                    └──────────────┬───────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Worker Agent 1  │       │ Worker Agent 2  │       │ Worker Agent 3  │
│ (ReAct Loop)    │       │ (ReAct Loop)    │       │ (ReAct Loop)    │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │ (All Tasks in Batch Complete)
                                   ▼
                    ┌──────────────────────────────┐
                    │        Manager Agent         │
                    │  (Outcome Model & Sandbox    │
                    │        Verification)         │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │     Documentation Agent      │
                    │ (Markdown Summary & Archival)│
                    └──────────────────────────────┘
```

### 3.1. Execution Job & Top-Level DAG Specification

An execution run is encapsulated by an `ExecutionJob` (`src/executor/dag_types.ts`):
- **`TaskNode`**: The fundamental unit of work containing `id`, `batchId`, `title`, `description`, `agentRole` (`WORKER` vs `MANAGER`), `dependsOn` (IDs of prerequisite tasks), `filesToRead` (reconnaissance scope), `filesToWrite` (write lock scope), `estimatedComplexity` (`LOW` | `MEDIUM` | `HIGH`), and `rollbackOnFailure`.
- **`TaskDAG`**: A complete, validated directed acyclic graph containing an array of `TaskNode` objects organized into sequential `Batch` structures.

### 3.2. The 5-Agent Consensus Planning Swarm

Before any code is edited or command executed, the execution specification is submitted to a **5-Agent Planning Swarm** (`src/planning/planning_step.ts`):

1. **Planner A (Technical Architect)**: Focuses on architectural cohesion, structural pattern consistency, and modular code isolation.
2. **Planner B (Dependency & Risk Analyst)**: Identifies file conflict risks, potential circular dependencies, external library requirements, and failure blast radiuses.
3. **Planner C (Execution Sequencer)**: Maximizes parallelism by grouping non-interfering tasks into optimal concurrent batches (`batchId`).
4. **Meta-Reasoning Auditor**: Evaluates all three proposed DAG plans against strict criteria (no missing prerequisite dependencies, no unassigned write locks, complete file coverage). Returns an `APPROVED` or `NEEDS_REVISION` verdict.
5. **Consolidator Agent**: Reconciles the three proposals and audit report into a single canonical `TaskDAG`.

### 3.3. Execution Engine & Concurrent Batch Dispatcher

The `DagExecutor` processes the finalized `TaskDAG` batch by batch:
1. **Dependency Resolution**: A batch `B_k` is eligible for execution only when all tasks in `dependsOn` for all nodes in `B_k` have achieved `TaskStatus = "DONE"`.
2. **Parallel Task Spawning**: All `WORKER` tasks in batch `B_k` are launched concurrently using `Promise.all()`.
3. **Batch Verification Barrier**: The batch executor waits until every worker in `B_k` completes before invoking the batch's `MANAGER` agent.

### 3.4. FileLockManager: Concurrency Control & Deadlock Prevention

When multiple Worker agents run in parallel within the same batch, race conditions and file corruption can occur if two workers attempt to modify the same file simultaneously.

OVAN resolves this using **`FileLockManager`** (`src/executor/file_lock_manager.ts`):
- **Lock Acquisition (`acquireLock`)**: Before a Worker agent writes to or AST-transforms any file listed in its `filesToWrite` manifest, it must request an exclusive lock.
- **FIFO Lock Queuing**: If a file is currently locked by another agent, the requesting agent's lock call returns a Promise that is queued until the lock is released.
- **Deadlock Detection Algorithm**: `FileLockManager` maintains an in-memory wait-for graph (`heldLocks` and `lockQueues`). If Agent $A$ holds File $X$ and waits for File $Y$, while Agent $B$ holds File $Y$ and waits for File $X$, `FileLockManager` detects the cycle, rejects the latest acquisition with a `DeadlockError`, emits a `lock_deadlock` event over SSE, and triggers an automated batch rollback.

### 3.5. Worker Agents: Autonomous ReAct Loops & Tool Suite

Each `WorkerAgent` (`src/executor/worker_agent.ts`) executes an autonomous ReAct loop (Reasoning + Acting) with access to specialized tools:

#### 1. AST-Aware Code Tools (`src/tools/ast_tools.ts`)
Instead of performing fragile regular-expression or string-replacement edits on source files, OVAN uses AST (Abstract Syntax Tree) transformation tools powered by TypeScript AST parsing:
- `ast_replace_function`: Replaces or updates specific function definitions by AST identifier.
- `ast_insert_import`: Safely inserts ES6/CommonJS import statements at the correct AST module header position without duplicating existing imports.
- `ast_add_property`: Modifies class structures, interfaces, and object literals safely.

#### 2. Safe File Operation Tools (`src/tools/file_tools.ts`)
- `read_file_content`: Reads raw file contents with line range support.
- `write_file_content`: Writes new files or overwrites existing ones (automatically acquiring `FileLockManager` locks).
- `list_directory`: Recursively inspects file tree structures.

#### 3. Terminal Execution Tools (`src/tools/terminal_tools.ts`)
- `execute_terminal_command`: Runs shell commands (`npm test`, `tsc`, `python`, etc.) in the workspace directory with streaming stdout/stderr buffers, timeout guards, and exit status reporting.

#### 4. Browser Automation Tools (`src/tools/browser_tools.ts`)
- `browser_navigate`: Launches a Playwright headless browser instance to navigate to local web applications (`http://localhost:3000`).
- `browser_click` / `browser_type`: Interacts with live DOM elements.
- `browser_screenshot`: Captures rendered visual states for multi-modal DOM verification.

### 3.6. Manager Agents: Outcome Modeling & Sandbox Verification

`ManagerAgent` (`src/executor/manager_agent.ts`) acts as the quality assurance supervisor for a completed batch:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: PRE-BATCH OUTCOME MODELING                                     │
│ Manager inspects batch tasks & formulates a strict success model.       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ (Workers Execute Batch)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: MULTI-MODAL VERIFICATION & ACTIVE FIX APPLICATION              │
│ Manager runs terminal tests, inspects AST syntax, checks browser DOM.  │
│ If flaws are found → Manager directly edits files to fix them.           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: FINAL VERDICT                                                  │
│ Outputs PASS (proceed to next batch) or FAIL (trigger batch rollback). │
└─────────────────────────────────────────────────────────────────────────┘
```

1. **Pre-Batch Outcome Modeling**: Before workers launch, the Manager reviews the batch manifest and formulates an explicit expectation model ("*Files X and Y must export interface Z; terminal command `npm test` must exit with 0*").
2. **Multi-Modal Verification**: Once all workers finish, the Manager executes ground-truth verification: running terminal build/test suites, inspecting code ASTs, and loading browser pages.
3. **Active Fix Application**: If a worker's output contains a minor bug or syntax error, the Manager does not merely report failure. It actively invokes AST tools and file writers to repair the code inline.
4. **Final Verdict**: Outputs a `ManagerVerdict` (`PASS` or `FAIL`). On `PASS`, the executor advances to the next batch. On `FAIL`, tasks marked `rollbackOnFailure` trigger a batch state reset.

### 3.7. Documentation Agent & Archival Packaging

When all DAG batches reach `DONE` status, `DocumentationAgent` (`src/executor/documentation_agent.ts`) executes:
1. Inspects all modified files, worker console logs, and manager verdicts.
2. Generates an exhaustive, production-grade `walkthrough.md` report.
3. Packages the workspace modifications into a downloadable `.zip` archive via `/api/download/:jobId`.

---

## 4. Part 3: Backend REST API & Real-Time SSE Telemetry

The backend server (`server.ts`) is built on Express and Node.js (>=20.0.0). It exposes REST endpoints and real-time Server-Sent Events (SSE) channels.

### 4.1. Key API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/think` | `POST` | Initiates a multidimensional thinking session. Streams `ThoughtStep` events via SSE. |
| `/api/provider` | `GET` | Returns current active AI provider (`gemini` or `deepseek`). |
| `/api/set-provider` | `POST` | Dynamically switches runtime AI provider between `gemini` and `deepseek`. |
| `/api/cache-stats` | `GET` | Returns real-time DeepSeek prompt cache performance, hit/miss tokens, and cost savings. |
| `/api/instruct` | `POST` | Queues a mid-session priority instruction into an active reasoning loop. |
| `/api/interactive-response` | `POST` | Submits human user input when a step transitions to `Dimension.INTERACTIVE`. |
| `/api/execute-report` | `POST` | Accepts a final thinking report and triggers the 5-Agent Planning Swarm & DAG Executor. |
| `/api/execute-events/:jobId` | `GET` | SSE endpoint streaming real-time execution DAG events (`batch_started`, `worker_tool_call`, `file_locked`, `manager_verdict`, etc.). |
| `/api/download/:jobId` | `GET` | Downloads the generated workspace archive (.zip) for a completed job. |

### 4.2. Dual SSE Protocol Architecture

OVAN utilizes two independent Server-Sent Event streaming protocols:

#### 1. Thinking Stream Protocol (`/api/think`)
Streams cognitive progress markers to the frontend as thinking unfolds:
- `event: status`: Status updates ("*Questioner generating prompt...*", "*Triad answering in parallel...*").
- `event: step`: Complete serialized `ThoughtStep` object.
- `event: retry`: Neural congestion warning backoff notifications (`429`/`503`).
- `event: cache_stats`: Real-time prompt cache telemetry updates.
- `event: complete`: Final synthesized report and neural voice audio stream.

#### 2. Execution Stream Protocol (`/api/execute-events/:jobId`)
Streams fine-grained DAG execution metrics:
- `job_started` / `planning_started` / `planning_proposal` / `planning_audit` / `dag_ready`
- `batch_started` / `worker_started` / `worker_tool_call` / `worker_tool_result` / `worker_done`
- `file_locked` / `file_released` / `lock_deadlock`
- `manager_started` / `manager_outcome_model` / `manager_verifying` / `manager_fix_applied` / `manager_verdict`
- `batch_done` / `job_complete` / `job_failed`

---

## 5. Part 4: Frontend Architecture & Cyberpunk UI

The frontend (`src/App.tsx`, `src/main.tsx`) is built with React 19, Vite 6, TailwindCSS 4, and Framer Motion. Styled as a cyberpunk **"Neural Void"**, it provides live visualization of both cognitive reasoning and DAG execution.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OVAN NEURAL VOID DASHBOARD                         │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ MULTIDIMENSIONAL GRAPH VIEW   │ COGNITIVE CHRONICLE / EXECUTION MONITOR     │
│ - Interactive 3D Node Map     │ - Live Step Stream (Question/Triad/Monologue)│
│ - Dimensional Quota Counters  │ - Real-time Execution DAG Progress Bar       │
│ - Active Provider Indicator   │ - Worker ReAct Tool Calls & Terminal Logs   │
│ - Live Cache Savings Gauge    │ - Manager Verification Verdict Cards        │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

### 5.1. Core UI Components

- **Multidimensional Graph View**: An interactive graph node visualizer mapping cognitive steps across dimensions, showing parent-child step relationships and cluster transitions.
- **Cognitive Chronicle**: Displays real-time thought steps, rendered with Markdown and LaTeX math formulas (`katex`). Includes collapsible views for the Thinking Agent's raw internal monologue (`<thinking>`).
- **Execution DAG Dashboard**: Renders live execution job status, showing batch progress bars, active worker ReAct tool calls, real-time file locking indicators, and Manager verification verdicts.
- **Mid-Session Instruction Panel**: Allows users to inject priority guidance (`/api/instruct`) directly into the controller loop while reasoning is active.
- **Provider & Cache Gauge**: Displays runtime provider status (`Gemini` vs `DeepSeek`), sticky key status, total hit/miss prompt tokens, and estimated cost savings.

---

## 6. Verification & System Test Suite

OVAN includes an automated test suite verifying both key components and end-to-end integration:

- `test_sandbox.ts`: Validates isolated Python and JavaScript code sandbox execution (`runCodeInSandbox`).
- `test_diag.ts`: Diagnostic verification of API provider network connectivity and key rotator status.
- `test_all_keys.ts` / `test_final_keys.ts`: Validates rate limits and authorization for all configured API keys.
- `test_e2e.ts`: Full end-to-end test verifying the multi-step cognitive loop, intent synthesis, 5-agent DAG planning swarm, worker ReAct execution, file lock manager concurrency, and manager verification.

To run the verification suite:
```bash
npx tsx test_sandbox.ts
npx tsx test_e2e.ts
```

---

## 7. Technical Specifications Summary Table

| Subsystem | Component | Implementation | Key Interfaces & Files |
| :--- | :--- | :--- | :--- |
| **Cognitive Layer** | Providers | Gemini API SDK & DeepSeek OpenAI API | `src/lib/engine.ts`, `src/lib/deepseek_engine.ts` |
| | Dimensions | 9 Cognitive Dimensions with Anti-Overreach Rules | `src/lib/types.ts` (`Dimension` enum) |
| | Reasoning Swarm | 6-Agent Sequential/Parallel Topology per Step | `Questioner`, `Internal`, `Archival`, `External`, `Meta`, `ThinkingAgent` |
| | Cache Optimization | Unified Shared History Prefix & Sticky Key Affinity | `DeepSeekKeyRotator`, `globalCacheTracker` |
| | Self-Evolution | Prompt Mutation Memory Extraction | `src/lib/prompt_memory.ts` |
| **Harness Layer** | Planning Swarm | 5-Agent Consensus DAG Generator | `src/planning/planning_step.ts`, `planning_prompts.ts` |
| | Execution Engine | Parallel Batch Dispatcher & Task DAG | `src/executor/dag_executor.ts`, `dag_types.ts` |
| | Concurrency Control| `FileLockManager` (Exclusive Locks & Deadlock Detection)| `src/executor/file_lock_manager.ts` |
| | Worker Agents | ReAct Loop with AST, File, Terminal & Browser Tools | `src/executor/worker_agent.ts`, `src/tools/*` |
| | Manager Agents | Outcome Modeling, Sandbox Verification & Inline Fixes | `src/executor/manager_agent.ts` |
| **Server & UI** | Backend Server | Express REST & Dual SSE Telemetry Engine | `server.ts` |
| | Client Dashboard | React 19 + Vite 6 + TailwindCSS 4 + Framer Motion | `src/App.tsx` |

---

*“In the silence of the neural void, the most profound structures are built.”*