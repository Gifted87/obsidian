import fs from "fs";
import path from "path";
import {
  AgentOutput,
  Batch,
  ExecutionEvent,
  ExecutionJob,
  TaskDAG,
  TaskNode,
} from "./dag_types.ts";
import { FileLockManager } from "./file_lock_manager.ts";
import { runPlanningStep } from "../planning/planning_step.ts";
import { WorkerAgent } from "./worker_agent.ts";
import { ManagerAgent } from "./manager_agent.ts";
import { runDocumentationStep } from "./documentation_agent.ts";
import { runCommand } from "../tools/terminal_tools.ts";

export class DagExecutor {
  private job: ExecutionJob;
  private fileLockManager: FileLockManager;
  private cwd: string;
  private onEvent?: (event: ExecutionEvent) => void;

  constructor(
    job: ExecutionJob,
    fileLockManager?: FileLockManager,
    cwd: string = process.cwd(),
    onEvent?: (event: ExecutionEvent) => void
  ) {
    this.job = job;
    this.cwd = cwd;
    this.onEvent = onEvent;
    this.fileLockManager =
      fileLockManager || FileLockManager.getInstance(30000, onEvent);
  }

  /**
   * Persists the current job state to memory/execution/{jobId}.json
   */
  private saveJobState(): void {
    try {
      const dir = path.join(this.cwd, "memory", "execution");
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filePath = path.join(dir, `${this.job.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(this.job, null, 2), "utf-8");
    } catch (err) {
      console.error(`[DagExecutor] Failed to save job state for ${this.job.id}:`, err);
    }
  }

  private emitEvent(type: ExecutionEvent["type"], payload: any): void {
    if (this.onEvent) {
      this.onEvent({
        type,
        payload,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Creates and returns the single unified workspace folder for the job inside `sandbox_workspace/job-{jobId}`
   */
  private getJobCwd(): string {
    const sandboxDir = path.join(this.cwd, "sandbox_workspace", `job-${this.job.id}`);
    if (!fs.existsSync(sandboxDir)) {
      fs.mkdirSync(sandboxDir, { recursive: true });
    }
    return sandboxDir;
  }

  /**
   * Helper to group tasks strictly by their exact agent-produced batchId in structured JSON,
   * preserving the agent's sequential batch ordering ("batch-1", "batch-2", ...).
   */
  private groupBatches(tasks: TaskNode[]): Batch[] {
    const batchMap = new Map<string, TaskNode[]>();
    const batchOrder: string[] = [];

    for (const t of tasks) {
      const bId = t.batchId || "batch-1";
      if (!batchMap.has(bId)) {
        batchMap.set(bId, []);
        batchOrder.push(bId);
      }
      batchMap.get(bId)!.push(t);
    }

    // Sort batch IDs naturally so "batch-1" runs before "batch-2", "batch-3", etc.
    batchOrder.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10);
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });

    const batches: Batch[] = [];
    for (const batchId of batchOrder) {
      batches.push({
        batchId,
        tasks: batchMap.get(batchId)!,
        managerAgentId: "",
        status: "PENDING",
      });
    }

    return batches;
  }

  /**
   * Main entry point to run the execution job
   */
  public async execute(): Promise<ExecutionJob> {
    const startTime = Date.now();
    this.job.status = "PLANNING";
    this.saveJobState();

    this.emitEvent("job_started", {
      jobId: this.job.id,
      thinkingSessionId: this.job.thinkingSessionId,
    });

    try {
      // ═════════════════════════════════════════════════════════════════════════
      // STEP 1: TOP-LEVEL DAG PLANNING (5-Agent Planning Step)
      // ═════════════════════════════════════════════════════════════════════════
      console.log(`[DagExecutor] Starting Level 1 Planning Step for Job ${this.job.id}...`);

      const planningResult = await runPlanningStep(
        this.job.finalReport,
        this.job.finalReport, // Full spec summary
        "TOP_LEVEL",
        this.job.id,
        undefined,
        this.onEvent
      );

      this.job.topLevelDag = planningResult.finalDag;
      this.job.status = "EXECUTING";
      this.saveJobState();

      this.emitEvent("dag_ready", {
        level: "TOP_LEVEL",
        taskCount: this.job.topLevelDag.tasks.length,
        dag: this.job.topLevelDag,
      });

      // ═════════════════════════════════════════════════════════════════════════
      // STEP 2: EXECUTE BATCHES (Single Level Execution Lanes)
      // Each batch runs parallel Worker Agents, followed by 1 Manager Agent.
      // ═════════════════════════════════════════════════════════════════════════
      const batches = this.groupBatches(this.job.topLevelDag.tasks);
      const jobCwd = this.getJobCwd();

      for (const batch of batches) {
        console.log(
          `[DagExecutor] Executing Batch "${batch.batchId}" containing ${batch.tasks.length} tasks in parallel...`
        );

        this.emitEvent("batch_started", {
          batchId: batch.batchId,
          level: "TOP_LEVEL",
          taskCount: batch.tasks.length,
        });

        // 1. Instantiate Manager for this batch in single job workspace directory
        const manager = new ManagerAgent(
          batch,
          this.job.finalReport,
          this.fileLockManager,
          jobCwd,
          5,
          this.onEvent
        );
        batch.managerAgentId = manager.agentId;

        // 2. Manager formulates Outcome Model Document
        await manager.buildOutcomeModel();

        // 3. Spawn parallel Worker Agents for all tasks in this batch
        console.log(
          `[DagExecutor] Spawning ${batch.tasks.length} parallel worker agents for ${batch.batchId}...`
        );

        const workerPromises = batch.tasks.map(async (taskNode) => {
          taskNode.status = "RUNNING";
          taskNode.startedAt = Date.now();
          this.saveJobState();

          const worker = new WorkerAgent(
            taskNode,
            this.job.finalReport,
            this.fileLockManager,
            jobCwd,
            100,
            this.onEvent
          );

          taskNode.assignedAgentId = worker.agentId;

          try {
            const output = await worker.execute();
            taskNode.output = output;
            taskNode.status = output.status === "SUCCESS" ? "DONE" : "FAILED";
            taskNode.completedAt = Date.now();
            return output;
          } catch (workerErr: any) {
            console.error(`[DagExecutor] Worker ${worker.agentId} error:`, workerErr);
            taskNode.status = "FAILED";
            taskNode.error = workerErr.message;
            taskNode.completedAt = Date.now();

            const fallbackOutput: AgentOutput = {
              agentId: worker.agentId,
              taskId: taskNode.id,
              status: "FAILED",
              filesModified: [],
              summary: `Worker failed: ${workerErr.message}`,
              consoleLogPath: `logs/agents/${worker.agentId}.log`,
              openQuestions: [workerErr.message],
              completedAt: Date.now(),
            };
            taskNode.output = fallbackOutput;
            return fallbackOutput;
          } finally {
            this.saveJobState();
          }
        });

        // Wait for all parallel workers in this batch to finish
        const workerResults = await Promise.all(workerPromises);

        // 4. Manager Verification Audit & Fix Phase
        console.log(
          `[DagExecutor] Running Manager verification audit for Batch "${batch.batchId}"...`
        );
        const verdict = await manager.verifyAndFix(workerResults);
        batch.status = verdict.status === "PASS" ? "VERIFIED" : "FAILED";

        if (verdict.status === "PASS") {
          console.log(
            `[DagExecutor] Batch ${batch.batchId} successfully VERIFIED by Manager ${manager.agentId}.`
          );
          this.emitEvent("batch_done", {
            batchId: batch.batchId,
            status: "VERIFIED",
            report: verdict.report,
          });
        } else {
          console.warn(
            `[DagExecutor] Batch ${batch.batchId} completed with manager verdict: ${verdict.status}`
          );

          this.emitEvent("batch_done", {
            batchId: batch.batchId,
            status: verdict.status,
            report: verdict.report,
          });

          if (batch.tasks.some((t) => t.rollbackOnFailure)) {
            console.warn(`[DagExecutor] Rollback triggered for Batch ${batch.batchId}`);
            await runCommand("git stash pop", jobCwd, "executor", 10000);
          }
        }
        this.saveJobState();
      }

      // ═════════════════════════════════════════════════════════════════════════
      // STEP 3: DOCUMENTATION & PACKAGING PHASE (Documentation Agent)
      // ═════════════════════════════════════════════════════════════════════════
      console.log(`[DagExecutor] Launching Documentation Agent and Packaging Zip for Job ${this.job.id}...`);
      const docResult = await runDocumentationStep(
        this.job.id,
        jobCwd,
        this.job.finalReport,
        this.onEvent
      );

      this.job.documentationReport = docResult.documentationReport;
      this.job.zipPath = docResult.zipPath;
      this.job.downloadUrl = docResult.downloadUrl;

      this.job.status = "COMPLETE";
      this.job.completedAt = Date.now();
      this.saveJobState();

      const elapsedMs = Date.now() - startTime;
      console.log(`[DagExecutor] Job ${this.job.id} completed successfully in ${elapsedMs}ms.`);

      this.emitEvent("job_complete", {
        jobId: this.job.id,
        elapsedMs,
        downloadUrl: docResult.downloadUrl,
        documentationReport: docResult.documentationReport,
      });

      return this.job;
    } catch (err: any) {
      console.error(`[DagExecutor] Job ${this.job.id} failed:`, err);
      this.job.status = "FAILED";
      this.saveJobState();

      this.emitEvent("job_failed", {
        jobId: this.job.id,
        error: err.message,
      });

      throw err;
    }
  }
}
