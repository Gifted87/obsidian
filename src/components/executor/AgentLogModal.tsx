import React, { useState, useEffect } from "react";
import { X, Terminal, Copy, Check, RefreshCw, Download } from "lucide-react";

interface AgentLogModalProps {
  jobId: string | null;
  agentId: string | null;
  onClose: () => void;
}

export const AgentLogModal: React.FC<AgentLogModalProps> = ({
  jobId,
  agentId,
  onClose,
}) => {
  const [logText, setLogText] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const fetchLog = async () => {
    if (!agentId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/execute/${jobId || "current"}/logs/${agentId}`);
      if (!res.ok) {
        throw new Error(`Failed to load log (status ${res.status})`);
      }
      const text = await res.text();
      setLogText(text);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load log");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLog();

    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchLog();
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [agentId, jobId, autoRefresh]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!agentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 font-bold text-slate-100">
            <Terminal className="w-4 h-4 text-cyan-400" />
            Agent Console Log: <span className="text-cyan-300">{agentId}</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-cyan-500 rounded"
              />
              <span>Live Tail (3s)</span>
            </label>

            <button
              onClick={fetchLog}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors"
              title="Refresh Log"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content / Terminal View */}
        <div className="flex-1 p-4 overflow-y-auto bg-slate-950 text-slate-300 font-mono text-xs leading-relaxed">
          {error ? (
            <div className="p-4 rounded bg-rose-950/40 border border-rose-500/40 text-rose-300">
              Error fetching log: {error}
            </div>
          ) : logText ? (
            <pre className="whitespace-pre-wrap break-all">{logText}</pre>
          ) : (
            <div className="text-slate-500 italic">Log file is currently empty or initializing...</div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 text-[10px] font-mono text-slate-500 flex justify-between">
          <span>Log Path: logs/agents/{agentId}.log</span>
          <span>{logText.length} characters loaded</span>
        </div>
      </div>
    </div>
  );
};
