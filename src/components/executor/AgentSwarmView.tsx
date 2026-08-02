import React from "react";
import { motion } from "motion/react";
import {
  Bot,
  UserCheck,
  Globe,
  Terminal,
  FileCode,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  Eye,
  FileText,
  AlertCircle,
} from "lucide-react";
import { AgentUIInfo } from "./dag_types_ui.ts";

interface AgentSwarmViewProps {
  agents: Record<string, AgentUIInfo>;
  onSelectAgentLog: (agentId: string) => void;
}

export const AgentSwarmView: React.FC<AgentSwarmViewProps> = ({
  agents,
  onSelectAgentLog,
}) => {
  const agentList = Object.values(agents);

  if (agentList.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-xl text-slate-400">
        <Bot className="w-8 h-8 animate-pulse mx-auto mb-2 text-cyan-400 opacity-60" />
        <p className="text-sm">No swarm agents active yet.</p>
        <p className="text-xs text-slate-500 mt-1">
          Agents will be spawned automatically during DAG batch execution.
        </p>
      </div>
    );
  }

  const managerAgents = agentList.filter((a) => a.role === "MANAGER");
  const workerAgents = agentList.filter((a) => a.role === "WORKER");

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-400" />
          Active Swarm Agent Monitor ({agentList.length} Agents)
        </h3>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-indigo-400">Managers: {managerAgents.length}</span>
          <span className="text-cyan-400">Workers: {workerAgents.length}</span>
        </div>
      </div>

      {/* Managers Section */}
      {managerAgents.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wide flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
            Batch Manager Agents (Verification & Browser Swarm Controllers)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {managerAgents.map((agent) => (
              <motion.div
                key={agent.agentId}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-xl bg-gradient-to-b from-indigo-950/40 to-slate-900/90 border border-indigo-500/30 text-xs backdrop-blur-md shadow-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono font-bold text-[11px]">
                      {agent.agentId}
                    </span>
                    <span className="text-slate-400 font-mono text-[10px]">
                      Batch: {agent.batchId || "N/A"}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold flex items-center gap-1 ${
                      agent.status === "DONE"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : agent.status === "VERIFYING"
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 animate-pulse"
                        : agent.status === "FAILED"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                        : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse"
                    }`}
                  >
                    {agent.status === "VERIFYING" && <Loader2 className="w-3 h-3 animate-spin" />}
                    {agent.status}
                  </span>
                </div>

                {/* Outcome Model Preview */}
                {agent.outcomeModel && (
                  <div className="p-2.5 rounded bg-slate-950/80 border border-indigo-500/20 mb-3 space-y-1">
                    <span className="text-[10px] font-bold text-indigo-300 flex items-center gap-1 uppercase">
                      <Eye className="w-3 h-3 text-indigo-400" />
                      Manager Outcome Model Document:
                    </span>
                    <p className="text-[11px] text-slate-300 font-mono line-clamp-3">
                      {agent.outcomeModel}
                    </p>
                  </div>
                )}

                {/* Status & Fixes applied */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-indigo-500/20">
                  <span className="flex items-center gap-1.5 text-indigo-300">
                    <Wrench className="w-3.5 h-3.5 text-indigo-400" />
                    Manager Fixes Applied: <strong className="text-white">{agent.fixesApplied || 0}</strong>
                  </span>

                  <button
                    onClick={() => onSelectAgentLog(agent.agentId)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-mono text-[10px] border border-indigo-500/30 cursor-pointer transition-colors"
                  >
                    <Terminal className="w-3 h-3" /> Agent Log
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Workers Section */}
      {workerAgents.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-cyan-300 uppercase tracking-wide flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            Granular Worker Agents (Parallel Code & Terminal ReAct Swarms)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workerAgents.map((agent) => (
              <motion.div
                key={agent.agentId}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/20 text-xs backdrop-blur-md flex flex-col justify-between shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-cyan-300 text-[11px]">
                      {agent.agentId}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold flex items-center gap-1 ${
                        agent.status === "DONE"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : agent.status === "RUNNING"
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      }`}
                    >
                      {agent.status === "RUNNING" && <Loader2 className="w-3 h-3 animate-spin" />}
                      {agent.status}
                    </span>
                  </div>

                  {agent.taskTitle && (
                    <p className="font-semibold text-slate-200 text-xs mb-2 line-clamp-1">
                      {agent.taskTitle}
                    </p>
                  )}

                  {/* Active Tool Feed */}
                  {agent.lastToolCall ? (
                    <div className="p-2 rounded bg-slate-950 border border-slate-800 mb-2 font-mono text-[10px] space-y-1">
                      <span className="text-cyan-400 flex items-center gap-1 font-semibold">
                        <Terminal className="w-3 h-3" /> Tool Call:
                      </span>
                      <p className="text-slate-300 truncate">{agent.lastToolCall}</p>
                      {agent.lastToolResult && (
                        <p className="text-slate-500 truncate">Result: {agent.lastToolResult}</p>
                      )}
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60 mb-2 font-mono text-[10px] text-slate-500 italic">
                      Reconnaissance / Initializing ReAct loop...
                    </div>
                  )}

                  {/* Modified Files list */}
                  {agent.filesModified && agent.filesModified.length > 0 && (
                    <div className="mb-2">
                      <span className="text-[10px] text-slate-400 block mb-1">
                        Files Modified ({agent.filesModified.length}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {agent.filesModified.map((f, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-300 font-mono text-[9px] border border-emerald-800/40 truncate max-w-[150px]"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer action */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">
                    ID: {agent.taskId || "N/A"}
                  </span>
                  <button
                    onClick={() => onSelectAgentLog(agent.agentId)}
                    className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-mono text-[10px] cursor-pointer"
                  >
                    <Terminal className="w-3 h-3" /> Console Log
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
