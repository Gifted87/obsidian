import {
  AgentOutput,
  Batch,
  ExecutionEvent,
  ExecutionJob,
  FileLockEntry,
  PlanLevel,
  PlanningAudit,
  TaskDAG,
  TaskNode,
} from "../../executor/dag_types.ts";

export interface AgentUIInfo {
  agentId: string;
  role: "MANAGER" | "WORKER";
  taskId?: string;
  taskTitle?: string;
  batchId?: string;
  status: "SPAWNED" | "RUNNING" | "VERIFYING" | "DONE" | "FAILED";
  lastToolCall?: string;
  lastToolResult?: string;
  filesModified: string[];
  outcomeModel?: string;
  fixesApplied?: number;
  summary?: string;
}

export interface PlanningUIState {
  level: PlanLevel | null;
  proposals: Record<string, number>; // plannerRole -> taskCount
  audit: PlanningAudit | null;
  consolidatedDag: TaskDAG | null;
}

export interface ExecutionUIState {
  jobId: string | null;
  status: "IDLE" | "INITIALIZING" | "PLANNING" | "EXECUTING" | "COMPLETE" | "FAILED";
  thinkingSessionId: string | null;
  startedAt: number | null;
  completedAt: number | null;
  planning: PlanningUIState;
  topLevelDag: TaskDAG | null;
  groundLevelDags: Record<string, TaskDAG>; // parentTaskId -> TaskDAG
  agents: Record<string, AgentUIInfo>; // agentId -> AgentUIInfo
  activeBatches: Record<string, { batchId: string; level: PlanLevel; status: string; taskCount: number }>;
  fileLocks: FileLockEntry[];
  deadlocks: Array<{ filePath: string; agentId: string; heldForMs: number }>;
  selectedAgentLogId: string | null;
  error: string | null;
}

export function createInitialExecutionUIState(): ExecutionUIState {
  return {
    jobId: null,
    status: "IDLE",
    thinkingSessionId: null,
    startedAt: null,
    completedAt: null,
    planning: {
      level: null,
      proposals: {},
      audit: null,
      consolidatedDag: null,
    },
    topLevelDag: null,
    groundLevelDags: {},
    agents: {},
    activeBatches: {},
    fileLocks: [],
    deadlocks: [],
    selectedAgentLogId: null,
    error: null,
  };
}

export function reduceExecutionEvent(
  state: ExecutionUIState,
  event: ExecutionEvent
): ExecutionUIState {
  const next = { ...state };
  const { type, payload } = event;

  switch (type) {
    case "job_started":
      return {
        ...createInitialExecutionUIState(),
        jobId: payload.jobId,
        thinkingSessionId: payload.thinkingSessionId,
        status: "PLANNING",
        startedAt: Date.now(),
      };

    case "planning_started":
      return {
        ...next,
        status: "PLANNING",
        planning: {
          level: payload.level,
          proposals: {},
          audit: null,
          consolidatedDag: null,
        },
      };

    case "planning_proposal":
      return {
        ...next,
        planning: {
          ...next.planning,
          proposals: {
            ...next.planning.proposals,
            [payload.plannerRole]: payload.taskCount,
          },
        },
      };

    case "planning_audit":
      return {
        ...next,
        planning: {
          ...next.planning,
          audit: {
            issues: payload.issues || [],
            overallVerdict: payload.verdict,
            auditReport: payload.auditReport || "",
          },
        },
      };

    case "planning_complete":
      return {
        ...next,
        planning: {
          ...next.planning,
          consolidatedDag: payload.dag,
        },
      };

    case "dag_ready":
      if (payload.level === "TOP_LEVEL") {
        return {
          ...next,
          status: "EXECUTING",
          topLevelDag: payload.dag,
        };
      } else if (payload.level === "GROUND_LEVEL" && payload.parentTaskId) {
        return {
          ...next,
          groundLevelDags: {
            ...next.groundLevelDags,
            [payload.parentTaskId]: payload.dag,
          },
        };
      }
      return next;

    case "batch_started":
      return {
        ...next,
        activeBatches: {
          ...next.activeBatches,
          [payload.batchId]: {
            batchId: payload.batchId,
            level: payload.level,
            status: "RUNNING",
            taskCount: payload.taskCount,
          },
        },
      };

    case "batch_done":
      return {
        ...next,
        activeBatches: {
          ...next.activeBatches,
          [payload.batchId]: {
            ...next.activeBatches[payload.batchId],
            status: payload.status,
          },
        },
      };

    case "manager_started":
      return {
        ...next,
        agents: {
          ...next.agents,
          [payload.agentId]: {
            agentId: payload.agentId,
            role: "MANAGER",
            batchId: payload.batchId,
            status: "RUNNING",
            filesModified: [],
            fixesApplied: 0,
          },
        },
      };

    case "manager_outcome_model":
      return {
        ...next,
        agents: {
          ...next.agents,
          [payload.agentId]: {
            ...next.agents[payload.agentId],
            outcomeModel: payload.fullModel || payload.preview,
          },
        },
      };

    case "worker_started":
      return {
        ...next,
        agents: {
          ...next.agents,
          [payload.agentId]: {
            agentId: payload.agentId,
            role: "WORKER",
            taskId: payload.taskId,
            taskTitle: payload.taskTitle,
            batchId: payload.batchId,
            status: "RUNNING",
            filesModified: [],
          },
        },
      };

    case "worker_tool_call":
      if (next.agents[payload.agentId]) {
        return {
          ...next,
          agents: {
            ...next.agents,
            [payload.agentId]: {
              ...next.agents[payload.agentId],
              lastToolCall: `${payload.tool}: ${payload.argsSummary}`,
            },
          },
        };
      }
      return next;

    case "worker_tool_result":
      if (next.agents[payload.agentId]) {
        return {
          ...next,
          agents: {
            ...next.agents,
            [payload.agentId]: {
              ...next.agents[payload.agentId],
              lastToolResult: payload.resultSummary,
            },
          },
        };
      }
      return next;

    case "worker_done":
      if (next.agents[payload.agentId]) {
        return {
          ...next,
          agents: {
            ...next.agents,
            [payload.agentId]: {
              ...next.agents[payload.agentId],
              status: payload.status === "SUCCESS" ? "DONE" : "FAILED",
              filesModified: payload.filesModified || [],
              summary: payload.summary,
            },
          },
        };
      }
      return next;

    case "manager_verifying":
      if (next.agents[payload.agentId]) {
        return {
          ...next,
          agents: {
            ...next.agents,
            [payload.agentId]: {
              ...next.agents[payload.agentId],
              status: "VERIFYING",
            },
          },
        };
      }
      return next;

    case "manager_fix_applied":
      if (next.agents[payload.agentId]) {
        return {
          ...next,
          agents: {
            ...next.agents,
            [payload.agentId]: {
              ...next.agents[payload.agentId],
              fixesApplied: payload.fixNumber,
              lastToolCall: `Manager Fix: ${payload.description}`,
            },
          },
        };
      }
      return next;

    case "manager_verdict":
      if (next.agents[payload.agentId]) {
        return {
          ...next,
          agents: {
            ...next.agents,
            [payload.agentId]: {
              ...next.agents[payload.agentId],
              status: payload.status === "PASS" ? "DONE" : "FAILED",
              summary: payload.report,
              fixesApplied: payload.fixesApplied,
            },
          },
        };
      }
      return next;

    case "file_locked": {
      const lockList = [...next.fileLocks];
      const idx = lockList.findIndex((l) => l.filePath === payload.filePath);
      if (idx !== -1) {
        lockList[idx] = { ...lockList[idx], heldByAgentId: payload.agentId, queueLength: payload.queueLength };
      } else {
        lockList.push({
          filePath: payload.filePath,
          heldByAgentId: payload.agentId,
          acquiredAt: Date.now(),
          queueLength: payload.queueLength,
        });
      }
      return { ...next, fileLocks: lockList };
    }

    case "file_released": {
      const lockList = next.fileLocks.filter((l) => l.filePath !== payload.filePath);
      if (payload.nextAgentId) {
        lockList.push({
          filePath: payload.filePath,
          heldByAgentId: payload.nextAgentId,
          acquiredAt: Date.now(),
          queueLength: payload.remainingQueueLength || 0,
        });
      }
      return { ...next, fileLocks: lockList };
    }

    case "lock_deadlock":
      return {
        ...next,
        deadlocks: [
          ...next.deadlocks,
          { filePath: payload.filePath, agentId: payload.agentId, heldForMs: payload.heldForMs },
        ],
      };

    case "job_complete":
      return {
        ...next,
        status: "COMPLETE",
        completedAt: Date.now(),
      };

    case "job_failed":
      return {
        ...next,
        status: "FAILED",
        completedAt: Date.now(),
        error: payload.error || "Execution job failed",
      };

    default:
      return next;
  }
}
