import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ChevronDown,
  FileText,
  FileCode,
  RotateCcw,
  User,
  Shield,
  Loader2,
} from "lucide-react";
import { TaskDAG, TaskNode } from "../../executor/dag_types.ts";

interface TaskDagViewProps {
  topLevelDag: TaskDAG | null;
  groundLevelDags: Record<string, TaskDAG>;
  onSelectAgentLog?: (agentId: string) => void;
}

export const TaskDagView: React.FC<TaskDagViewProps> = ({
  topLevelDag,
  groundLevelDags,
  onSelectAgentLog,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  if (!topLevelDag) {
    return (
      <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-xl text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
        <p className="text-sm">Awaiting Top-Level Task DAG generation...</p>
      </div>
    );
  }

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Group top-level tasks by batchId
  const batchMap = new Map<string, TaskNode[]>();
  topLevelDag.tasks.forEach((task) => {
    if (!batchMap.has(task.batchId)) batchMap.set(task.batchId, []);
    batchMap.get(task.batchId)!.push(task);
  });

  const batches = Array.from(batchMap.entries());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          Top-Level Task DAG Execution Graph ({topLevelDag.tasks.length} Nodes)
        </h3>
        <span className="text-xs text-slate-400 font-mono">
          {batches.length} Parallel Batch Lanes
        </span>
      </div>

      <div className="space-y-4">
        {batches.map(([batchId, tasks], batchIdx) => (
          <div
            key={batchId}
            className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md"
          >
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <span className="text-xs font-mono font-bold text-cyan-400 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                  BATCH {batchIdx + 1}: {batchId}
                </span>
                <span className="text-slate-400 font-normal">
                  ({tasks.length} {tasks.length === 1 ? "section" : "sections"} running in parallel)
                </span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tasks.map((taskNode) => {
                const isExpanded = !!expandedNodes[taskNode.id];
                const groundDag = groundLevelDags[taskNode.id];

                return (
                  <div
                    key={taskNode.id}
                    className={`rounded-lg border p-3.5 transition-all text-xs ${
                      taskNode.status === "DONE"
                        ? "bg-slate-900/90 border-emerald-500/40 text-slate-200"
                        : taskNode.status === "RUNNING" || taskNode.status === "PLANNING"
                        ? "bg-slate-900/90 border-cyan-500/50 ring-1 ring-cyan-500/30 text-slate-100"
                        : taskNode.status === "FAILED"
                        ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                        : "bg-slate-950/40 border-slate-800 text-slate-400"
                    }`}
                  >
                    {/* Node Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 font-semibold text-slate-100 text-sm">
                        <button
                          onClick={() => toggleExpand(taskNode.id)}
                          className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                        <span>{taskNode.title}</span>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold flex items-center gap-1 ${
                          taskNode.status === "DONE"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : taskNode.status === "RUNNING"
                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse"
                            : taskNode.status === "PLANNING"
                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                            : taskNode.status === "FAILED"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        {taskNode.status === "RUNNING" && <Loader2 className="w-3 h-3 animate-spin" />}
                        {taskNode.status === "DONE" && <CheckCircle2 className="w-3 h-3" />}
                        {taskNode.status === "FAILED" && <XCircle className="w-3 h-3" />}
                        {taskNode.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 mb-2.5">
                      {taskNode.description}
                    </p>

                    {/* Metadata indicators */}
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
                      <span className="flex items-center gap-1 font-mono text-slate-300">
                        <User className="w-3 h-3 text-cyan-400" />
                        Role: {taskNode.agentRole}
                      </span>

                      {taskNode.assignedAgentId && (
                        <button
                          onClick={() => onSelectAgentLog && onSelectAgentLog(taskNode.assignedAgentId!)}
                          className="font-mono text-cyan-400 underline hover:text-cyan-300 cursor-pointer"
                        >
                          {taskNode.assignedAgentId}
                        </button>
                      )}

                      {taskNode.filesToWrite && taskNode.filesToWrite.length > 0 && (
                        <span className="flex items-center gap-1 text-emerald-400/90 font-mono">
                          <FileCode className="w-3 h-3" />
                          {taskNode.filesToWrite.length} file targets
                        </span>
                      )}

                      {taskNode.rollbackOnFailure && (
                        <span className="flex items-center gap-0.5 text-amber-400/90 font-mono">
                          <RotateCcw className="w-3 h-3" /> Rollback ON
                        </span>
                      )}
                    </div>

                    {/* Expanded details & Ground-level sub-DAG */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 pt-3 border-t border-slate-800 space-y-2 text-[11px]"
                        >
                          {taskNode.filesToRead && taskNode.filesToRead.length > 0 && (
                            <div>
                              <span className="text-slate-400 font-semibold block mb-1">
                                Reconnaissance (Files to read first):
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {taskNode.filesToRead.map((f, i) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 rounded bg-slate-950 text-cyan-300 font-mono text-[10px] border border-slate-800"
                                  >
                                    {f}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {groundDag ? (
                            <div className="mt-2 p-2.5 rounded bg-slate-950 border border-cyan-500/20">
                              <span className="text-xs font-bold text-cyan-300 block mb-1.5">
                                Level 2 Ground-Level DAG ({groundDag.tasks.length} Tasks):
                              </span>
                              <div className="space-y-1.5">
                                {groundDag.tasks.map((gt) => (
                                  <div
                                    key={gt.id}
                                    className="p-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-[10px]"
                                  >
                                    <span className="font-semibold text-slate-200">{gt.title}</span>
                                    <span
                                      className={`px-1.5 py-0.2 rounded font-mono ${
                                        gt.status === "DONE"
                                          ? "text-emerald-400 bg-emerald-500/10"
                                          : gt.status === "RUNNING"
                                          ? "text-cyan-400 bg-cyan-500/10"
                                          : "text-slate-400"
                                      }`}
                                    >
                                      {gt.status}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500 italic">
                              Ground-level DAG planning will initiate when this task is processed.
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
