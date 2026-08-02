// ── Task Status & Roles ──────────────────────────────────────────────────────
export type TaskStatus = "PENDING" | "PLANNING" | "RUNNING" | "DONE" | "FAILED" | "BLOCKED" | "SKIPPED";
export type AgentRole = "MANAGER" | "WORKER";
export type PlanLevel = "TOP_LEVEL" | "GROUND_LEVEL";
export type TaskComplexity = "LOW" | "MEDIUM" | "HIGH";

// ── Core Task Node ──────────────────────────────────────────────────────────
export interface TaskNode {
  id: string;                        // UUID
  batchId: string;                   // Groups nodes that run in parallel
  title: string;
  description: string;               // Elaborate description for the assigned agent
  agentRole: AgentRole;
  dependsOn: string[];               // IDs of TaskNodes that must be DONE first
  filesToRead: string[];             // Reconnaissance: agent reads these before touching anything
  filesToWrite: string[];            // Files this task will create or modify
  estimatedComplexity: TaskComplexity;
  managerInstructions?: string;      // Extra instructions only for MANAGER role
  rollbackOnFailure: boolean;        // If this task fails, roll back the whole batch

  // Runtime fields (set by executor, not by planner)
  status: TaskStatus;
  assignedAgentId?: string;
  startedAt?: number;
  completedAt?: number;
  output?: AgentOutput;
  error?: string;
}

// ── Task DAG ────────────────────────────────────────────────────────────────
export interface TaskDAG {
  id: string;                        // UUID
  level: PlanLevel;
  parentTaskId?: string;             // Set on GROUND_LEVEL DAGs only
  executionJobId: string;            // Top-level execution session ID
  fullSpecSummary: string;           // Full spec injected into every agent's context
  tasks: TaskNode[];
  createdAt: number;
  status: "ACTIVE" | "COMPLETE" | "FAILED";
}

// ── Batch ────────────────────────────────────────────────────────────────────
// A batch is a set of TaskNodes sharing the same batchId. They run in parallel.
// The batch is complete when ALL of its tasks are DONE or FAILED.
export interface Batch {
  batchId: string;
  tasks: TaskNode[];
  managerAgentId: string;            // The manager responsible for this batch
  status: "PENDING" | "RUNNING" | "VERIFYING" | "DONE" | "FAILED";
}

// ── Planning Step Types ──────────────────────────────────────────────────────
export type PlannerRole = "ARCHITECTURE" | "DEPENDENCY_RISK" | "EXECUTION_SEQUENCER";

export interface PlannerProposal {
  plannerRole: PlannerRole;
  tasks: Array<Omit<TaskNode, "status" | "assignedAgentId" | "startedAt" | "completedAt" | "output" | "error">>;
  rationale: string;
}

export interface PlanningAuditIssue {
  severity: "CRITICAL" | "WARNING";
  taskIds: string[];
  description: string;
  recommendation: string;
}

export interface PlanningAudit {
  issues: PlanningAuditIssue[];
  overallVerdict: "APPROVED" | "NEEDS_REVISION";
  auditReport: string;
}

export interface PlanningStepResult {
  proposalA: PlannerProposal;
  proposalB: PlannerProposal;
  proposalC: PlannerProposal;
  audit: PlanningAudit;
  finalDag: TaskDAG;
}

// ── Agent Output ─────────────────────────────────────────────────────────────
export interface AgentOutput {
  agentId: string;
  taskId: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  filesModified: string[];
  summary: string;
  consoleLogPath: string;
  openQuestions: string[];
  completedAt: number;
}

// ── Manager Verdict ──────────────────────────────────────────────────────────
export interface ManagerVerdict {
  batchId: string;
  status: "PASS" | "FAIL";
  fixesApplied: number;
  report: string;
  remainingIssues?: string[];
}

// ── Execution Job ─────────────────────────────────────────────────────────────
// Top-level container for an entire execution run
export interface ExecutionJob {
  id: string;                        // UUID — the execution session ID
  thinkingSessionId: string;         // The Ovan thinking session that produced the spec
  finalReport: string;               // Raw final report from the thinking loop
  topLevelDag?: TaskDAG;
  status: "INITIALIZING" | "PLANNING" | "EXECUTING" | "COMPLETE" | "FAILED";
  createdAt: number;
  completedAt?: number;
  documentationReport?: string;
  zipPath?: string;
  downloadUrl?: string;
}

// ── File Lock Entry ──────────────────────────────────────────────────────────
export interface FileLockEntry {
  filePath: string;                  // Absolute path
  heldByAgentId: string;
  acquiredAt: number;
  queueLength: number;
}

// ── Execution Event Types for SSE ─────────────────────────────────────────────
export type ExecutionEventType =
  | "job_started"
  | "planning_started"
  | "planning_proposal"
  | "planning_audit"
  | "planning_complete"
  | "dag_ready"
  | "batch_started"
  | "manager_started"
  | "manager_outcome_model"
  | "worker_started"
  | "worker_tool_call"
  | "worker_tool_result"
  | "worker_done"
  | "manager_verifying"
  | "manager_fix_applied"
  | "manager_verdict"
  | "batch_done"
  | "file_locked"
  | "file_released"
  | "lock_deadlock"
  | "job_complete"
  | "job_failed";

export interface ExecutionEvent {
  type: ExecutionEventType;
  payload: any;
  timestamp: number;
}
