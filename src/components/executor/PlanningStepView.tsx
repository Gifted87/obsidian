import React from "react";
import { motion } from "motion/react";
import { Cpu, ShieldAlert, CheckCircle2, AlertTriangle, Layers, Loader2, Sparkles, Play, Clock, Bot } from "lucide-react";
import { PlanningUIState, ExecutionUIState } from "./dag_types_ui.ts";

interface PlanningStepViewProps {
  planning: PlanningUIState;
  status?: ExecutionUIState["status"];
  onStartExecution?: () => void;
}

export const PlanningStepView: React.FC<PlanningStepViewProps> = ({ planning, status = "IDLE", onStartExecution }) => {
  const { level, proposals, audit, consolidatedDag } = planning;

  const isGroundLevel = level === "GROUND_LEVEL";

  const isSingleGroundPlannerDone = proposals["SINGLE_GROUND_PLANNER"] !== undefined;
  const isPlannerADone = proposals["ARCHITECTURE"] !== undefined;
  const isPlannerBDone = proposals["DEPENDENCY_RISK"] !== undefined;
  const isPlannerCDone = proposals["EXECUTION_SEQUENCER"] !== undefined;
  const isAuditDone = audit !== null;
  const isConsolidatorDone = consolidatedDag !== null;
  const isIdle = status === "IDLE";
  const isPlanningActive = status === "PLANNING" || status === "INITIALIZING";

  return (
    <div className="bg-slate-900/60 border border-cyan-500/20 backdrop-blur-md rounded-xl p-5 mb-6 shadow-xl">
      <div className="flex items-center justify-between mb-4 border-b border-cyan-500/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              {isGroundLevel ? "Single-Agent Ground-Level Planning" : "5-Agent Deliberative Planning Step"}
              {level && (
                <span className="px-2 py-0.5 text-xs font-mono rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Level: {level}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              {isGroundLevel
                ? "Decomposing top-level task mandate into ground-level ReAct tasks via Single Ground Planner Agent"
                : "Decomposing spec via 3 parallel planners → 1 audit agent → 1 consolidator"}
            </p>
          </div>
        </div>

        {isConsolidatorDone ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5" /> DAG Consolidated
          </span>
        ) : isPlanningActive ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Planning Active
          </span>
        ) : isIdle ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Awaiting Execution
            </span>
            {onStartExecution && (
              <button
                onClick={onStartExecution}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 border border-cyan-400/40 text-[11px] font-bold tracking-wider text-white hover:shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-all cursor-pointer"
              >
                <Play className="w-3 h-3 fill-white" /> Execute Plan Now
              </button>
            )}
          </div>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            Status: {status}
          </span>
        )}
      </div>

      {/* Idle State Banner */}
      {isIdle && (
        <div className="p-3.5 mb-4 rounded-lg bg-cyan-950/20 border border-cyan-500/30 flex items-center justify-between text-xs">
          <div className="text-slate-300">
            <span className="font-semibold text-cyan-300">Execution Job Idle: </span>
            Click <strong className="text-white">Execute Plan Now</strong> to launch 5-Agent Deliberative Planning and decompose your specification into a parallel ReAct Task DAG.
          </div>
          {onStartExecution && (
            <button
              onClick={onStartExecution}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors shrink-0 cursor-pointer shadow-lg"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> Start Execution
            </button>
          )}
        </div>
      )}

      {/* Planners Display */}
      {isGroundLevel ? (
        /* Ground Level: Single Agent Card */
        <div className="mb-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-lg border text-xs transition-all ${
              isSingleGroundPlannerDone || isConsolidatorDone
                ? "bg-slate-800/80 border-emerald-500/40 text-slate-200"
                : "bg-slate-950/40 border-cyan-500/20 text-slate-400"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-cyan-300 flex items-center gap-2 text-sm">
                <Bot className="w-4 h-4 text-cyan-400" /> Single Ground-Level Planner Agent
              </span>
              {isSingleGroundPlannerDone || isConsolidatorDone ? (
                <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  READY
                </span>
              ) : isPlanningActive ? (
                <span className="flex items-center gap-1.5 text-xs text-cyan-400 font-mono">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Decomposing Sub-tasks...
                </span>
              ) : (
                <span className="text-xs font-mono text-slate-500">IDLE</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Directly generates ground-level sub-tasks, file lock prerequisites, and execution batch lanes for worker agents.
            </p>
            {isSingleGroundPlannerDone || isConsolidatorDone ? (
              <div className="text-emerald-300 font-mono text-xs bg-emerald-950/30 p-2.5 rounded border border-emerald-500/20">
                ✓ Generated {proposals["SINGLE_GROUND_PLANNER"] || consolidatedDag?.tasks.length || 0} ground-level tasks
              </div>
            ) : isPlanningActive ? (
              <div className="text-cyan-300 italic text-xs">Analyzing mandate and building sub-task DAG...</div>
            ) : (
              <div className="text-slate-600 italic text-xs">Awaiting ground-level planning mandate...</div>
            )}
          </motion.div>
        </div>
      ) : (
        /* Top Level: 3 Parallel Planners */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* Planner A */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3.5 rounded-lg border text-xs transition-all ${
              isPlannerADone
                ? "bg-slate-800/80 border-emerald-500/40 text-slate-200"
                : "bg-slate-950/40 border-cyan-500/20 text-slate-400"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Planner A: Architecture
              </span>
              {isPlannerADone ? (
                <span className="text-[10px] font-mono text-emerald-400 font-bold">READY</span>
              ) : isPlanningActive ? (
                <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
              ) : (
                <span className="text-[10px] font-mono text-slate-500">IDLE</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Decomposes by file & component boundaries</p>
            {isPlannerADone ? (
              <div className="text-emerald-300 font-mono text-[11px]">
                ✓ Proposed {proposals["ARCHITECTURE"]} architectural tasks
              </div>
            ) : isPlanningActive ? (
              <div className="text-slate-500 italic text-[11px]">Analyzing file architecture...</div>
            ) : (
              <div className="text-slate-600 italic text-[11px]">Awaiting plan submission...</div>
            )}
          </motion.div>

          {/* Planner B */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`p-3.5 rounded-lg border text-xs transition-all ${
              isPlannerBDone
                ? "bg-slate-800/80 border-emerald-500/40 text-slate-200"
                : "bg-slate-950/40 border-cyan-500/20 text-slate-400"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> Planner B: Dependency Risk
              </span>
              {isPlannerBDone ? (
                <span className="text-[10px] font-mono text-emerald-400 font-bold">READY</span>
              ) : isPlanningActive ? (
                <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
              ) : (
                <span className="text-[10px] font-mono text-slate-500">IDLE</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Enforces lock safety & shared file order</p>
            {isPlannerBDone ? (
              <div className="text-emerald-300 font-mono text-[11px]">
                ✓ Proposed {proposals["DEPENDENCY_RISK"]} risk-sequenced tasks
              </div>
            ) : isPlanningActive ? (
              <div className="text-slate-500 italic text-[11px]">Mapping file lock dependencies...</div>
            ) : (
              <div className="text-slate-600 italic text-[11px]">Awaiting plan submission...</div>
            )}
          </motion.div>

          {/* Planner C */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`p-3.5 rounded-lg border text-xs transition-all ${
              isPlannerCDone
                ? "bg-slate-800/80 border-emerald-500/40 text-slate-200"
                : "bg-slate-950/40 border-cyan-500/20 text-slate-400"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Planner C: Sequencer
              </span>
              {isPlannerCDone ? (
                <span className="text-[10px] font-mono text-emerald-400 font-bold">READY</span>
              ) : isPlanningActive ? (
                <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
              ) : (
                <span className="text-[10px] font-mono text-slate-500">IDLE</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Balances parallel worker load batches</p>
            {isPlannerCDone ? (
              <div className="text-emerald-300 font-mono text-[11px]">
                ✓ Proposed {proposals["EXECUTION_SEQUENCER"]} parallel execution tasks
              </div>
            ) : isPlanningActive ? (
              <div className="text-slate-500 italic text-[11px]">Optimizing parallel batch lanes...</div>
            ) : (
              <div className="text-slate-600 italic text-[11px]">Awaiting plan submission...</div>
            )}
          </motion.div>
        </div>
      )}

      {/* Phase 2 & 3: Auditor & Consolidator Results */}
      {isAuditDone && !isGroundLevel && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4" />
              Meta-Reasoning Planning Audit Report
            </div>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ${
                audit.overallVerdict === "APPROVED"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              }`}
            >
              VERDICT: {audit.overallVerdict}
            </span>
          </div>

          {audit.issues && audit.issues.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              {audit.issues.map((issue, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded border text-[11px] ${
                    issue.severity === "CRITICAL"
                      ? "bg-rose-950/30 border-rose-500/30 text-rose-200"
                      : "bg-amber-950/30 border-amber-500/30 text-amber-200"
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <span className="uppercase font-mono text-[9px] px-1 py-0.2 rounded bg-black/40">
                      {issue.severity}
                    </span>
                    {issue.description}
                  </div>
                  <div className="text-[10px] opacity-80 mt-0.5">
                    Rec: {issue.recommendation} (Task IDs: {issue.taskIds.join(", ") || "N/A"})
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-emerald-400/90 text-[11px]">
              ✓ No critical file contention, circular dependencies, or atomicity risks detected.
            </p>
          )}

          {consolidatedDag && (
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-slate-300">
              <span className="font-mono text-[11px] text-cyan-300">
                Synthesized Canonical DAG: {consolidatedDag.tasks.length} total tasks across{" "}
                {new Set(consolidatedDag.tasks.map((t) => t.batchId)).size} sequential batches.
              </span>
              <span className="text-[10px] text-slate-400">
                Created: {new Date(consolidatedDag.createdAt).toLocaleTimeString()}
              </span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};
