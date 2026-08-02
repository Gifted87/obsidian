import React from "react";
import { Lock, ShieldAlert, CheckCircle, Clock } from "lucide-react";
import { FileLockEntry } from "../../executor/dag_types.ts";

interface FileLockMonitorProps {
  fileLocks: FileLockEntry[];
  deadlocks: Array<{ filePath: string; agentId: string; heldForMs: number }>;
}

export const FileLockMonitor: React.FC<FileLockMonitorProps> = ({
  fileLocks,
  deadlocks,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-400" />
          File Lock & Thread Safety Monitor ({fileLocks.length} Locks Active)
        </h3>
        <span className="text-xs text-slate-400 font-mono">
          Singleton Lock Manager Active
        </span>
      </div>

      {/* Deadlock Warning Banner if present */}
      {deadlocks.length > 0 && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs space-y-1">
          <div className="font-bold flex items-center gap-2 text-rose-300">
            <ShieldAlert className="w-4 h-4 text-rose-400 animate-bounce" />
            DEADLOCK RESOLUTION TRIGGERED
          </div>
          <p className="text-[11px] opacity-90">
            The background deadlock detector forcibly released stale locks held for &gt;30s:
          </p>
          <div className="space-y-1 font-mono text-[10px] pt-1">
            {deadlocks.map((d, i) => (
              <div key={i} className="p-1.5 rounded bg-black/40 border border-rose-500/30">
                File: <span className="text-white">{d.filePath}</span> | Agent:{" "}
                <span className="text-cyan-300">{d.agentId}</span> | Held: {Math.round(d.heldForMs / 1000)}s
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locks Table */}
      {fileLocks.length === 0 ? (
        <div className="p-6 text-center bg-slate-900/40 border border-slate-800 rounded-xl text-slate-400 text-xs">
          <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-1.5 opacity-80" />
          No files currently write-locked. All resources available.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="p-3">File Path Target</th>
                <th className="p-3">Lock Owner (Agent ID)</th>
                <th className="p-3">Queue Length</th>
                <th className="p-3">Acquired At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {fileLocks.map((lock, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="p-3 text-cyan-300 font-semibold">{lock.filePath}</td>
                  <td className="p-3 text-indigo-300 font-bold">{lock.heldByAgentId}</td>
                  <td className="p-3">
                    {lock.queueLength > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {lock.queueLength} waiting
                      </span>
                    ) : (
                      <span className="text-slate-500">0</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-400 text-[10px]">
                    {new Date(lock.acquiredAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
