import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Play,
  Square,
  Cpu,
  Layers,
  Bot,
  Lock,
  Terminal,
  Clock,
  CheckCircle2,
  AlertOctagon,
  Loader2,
  RefreshCw,
  Download,
} from "lucide-react";
import { ExecutionUIState } from "./dag_types_ui.ts";
import { PlanningStepView } from "./PlanningStepView.tsx";
import { TaskDagView } from "./TaskDagView.tsx";
import { AgentSwarmView } from "./AgentSwarmView.tsx";
import { FileLockMonitor } from "./FileLockMonitor.tsx";
import { AgentLogModal } from "./AgentLogModal.tsx";

interface ExecutionDashboardProps {
  executionState: ExecutionUIState;
  onClose: () => void;
  onAbortJob: (jobId: string) => void;
  onStartExecution?: () => void;
}

export const ExecutionDashboard: React.FC<ExecutionDashboardProps> = ({
  executionState,
  onClose,
  onAbortJob,
  onStartExecution,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "dag" | "agents" | "locks">("overview");
  const [selectedLogAgentId, setSelectedLogAgentId] = useState<string | null>(null);

  const {
    jobId,
    status,
    startedAt,
    completedAt,
    planning,
    topLevelDag,
    groundLevelDags,
    agents,
    fileLocks,
    deadlocks,
    error,
  } = executionState;

  // Calculate elapsed duration
  const elapsedSeconds = startedAt
    ? Math.round(((completedAt || Date.now()) - startedAt) / 1000)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-xl text-slate-100 overflow-hidden">
      {/* Top Header Bar */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 shadow-lg text-white">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Ovan
              {jobId && (
                <span className="font-mono text-xs text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  {jobId.substring(0, 8)}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              5-Agent Planning → Hierarchical Task DAG → Parallel Worker/Manager ReAct Swarms
            </p>
          </div>
        </div>

        {/* Right Status Badge & Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-mono text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{elapsedSeconds}s elapsed</span>
          </div>

          {/* Status Badge */}
          <span
            className={`px-3 py-1 rounded-full font-mono text-xs font-bold flex items-center gap-1.5 ${
              status === "COMPLETE"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : status === "EXECUTING" || status === "PLANNING"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse"
                : status === "FAILED"
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {(status === "EXECUTING" || status === "PLANNING") && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            {status === "COMPLETE" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            {status === "FAILED" && <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />}
            STATUS: {status}
          </span>

          {/* Execute Plan Button when IDLE */}
          {status === "IDLE" && onStartExecution && (
            <button
              onClick={onStartExecution}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 border border-cyan-400/40 text-xs font-bold text-white hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> Execute Plan Now
            </button>
          )}

          {/* Download Zip Button when COMPLETE */}
          {status === "COMPLETE" && jobId && (
            <a
              href={`/api/download/${jobId}`}
              download={`project-${jobId}.zip`}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/40 text-xs font-bold text-white hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Download Project (.zip)
            </a>
          )}

          {/* Abort Button */}
          {(status === "EXECUTING" || status === "PLANNING") && jobId && (
            <button
              onClick={() => onAbortJob(jobId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border border-rose-500/40 font-mono text-xs cursor-pointer transition-colors"
            >
              <Square className="w-3 h-3 fill-rose-400" /> Abort
            </button>
          )}

          {/* Close Modal */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="px-6 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "overview"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" /> 5-Agent Planning Overview
          </button>

          <button
            onClick={() => setActiveTab("dag")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "dag"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Task DAG Graph ({topLevelDag?.tasks.length || 0})
          </button>

          <button
            onClick={() => setActiveTab("agents")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "agents"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Bot className="w-3.5 h-3.5" /> Swarm Agents ({Object.keys(agents).length})
          </button>

          <button
            onClick={() => setActiveTab("locks")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "locks"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Lock className="w-3.5 h-3.5" /> File Lock Safety ({fileLocks.length})
          </button>
        </div>

        {error && (
          <div className="text-rose-400 font-mono text-xs font-semibold truncate max-w-md">
            Error: {error}
          </div>
        )}
      </div>

      {/* Body / Main View */}
      <main className="flex-1 p-6 overflow-y-auto max-w-7xl w-full mx-auto space-y-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <PlanningStepView planning={planning} status={status} onStartExecution={onStartExecution} />
            <TaskDagView
              topLevelDag={topLevelDag}
              groundLevelDags={groundLevelDags}
              onSelectAgentLog={(id) => setSelectedLogAgentId(id)}
            />
          </div>
        )}

        {activeTab === "dag" && (
          <TaskDagView
            topLevelDag={topLevelDag}
            groundLevelDags={groundLevelDags}
            onSelectAgentLog={(id) => setSelectedLogAgentId(id)}
          />
        )}

        {activeTab === "agents" && (
          <AgentSwarmView
            agents={agents}
            onSelectAgentLog={(id) => setSelectedLogAgentId(id)}
          />
        )}

        {activeTab === "locks" && (
          <FileLockMonitor fileLocks={fileLocks} deadlocks={deadlocks} />
        )}
      </main>

      {/* Log Modal */}
      {selectedLogAgentId && (
        <AgentLogModal
          jobId={jobId}
          agentId={selectedLogAgentId}
          onClose={() => setSelectedLogAgentId(null)}
        />
      )}
    </div>
  );
};
