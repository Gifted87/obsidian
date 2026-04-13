import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles,
  ListChecks,
  ChevronRight,
  Cpu, 
  MessageSquare, 
  Database, 
  Globe, 
  Brain, 
  Zap, 
  Activity, 
  ShieldAlert,
  Terminal,
  Loader2,
  Upload,
  Volume2,
  VolumeX,
  GitFork,
  Eye,
  FileText,
  X,
  Copy,
  Check
} from "lucide-react";
import { ThinkingEngine, Dimension, ThoughtStep, DIMENSIONS_INFO, ThoughtPart } from "./lib/engine";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as d3 from "d3";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FileData {
  name: string;
  type: string;
  base64: string;
}

export default function App() {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileData[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [currentDimension, setCurrentDimension] = useState<Dimension | null>(null);
  const [steps, setSteps] = useState<ThoughtStep[]>([]);
  const [finalIntent, setFinalIntent] = useState<string | null>(null);
  const [finalReport, setFinalReport] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showSummaryOverlay, setShowSummaryOverlay] = useState(false);
  const [showReportOverlay, setShowReportOverlay] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'fast' | 'deep'>('deep');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      setIsGeneratingSuggestions(true);
      try {
        const res = await fetch('/api/suggestions');
        const data = await res.json();
        setSuggestions(data);
      } catch (err) {
        console.error("Failed to fetch suggestions:", err);
      } finally {
        setIsGeneratingSuggestions(false);
      }
    };
    fetchSuggestions();
  }, []);

  // Disable autoscroll as requested
  // useEffect(() => {
  //   if (scrollRef.current) {
  //     scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  //   }
  // }, [currentDimension]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setFiles(prev => [...prev, { name: file.name, type: file.type, base64 }]);
    };
    reader.readAsDataURL(file);
  };

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const scrollToStep = (index: number) => {
    const element = document.getElementById(`step-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleThink = async (mode: 'fast' | 'deep', branchFromIndex?: number) => {
    if (!input.trim() && files.length === 0) return;
    
    setSelectedMode(mode);
    setIsThinking(true);
    setFinalIntent(null);
    setFinalReport(null);
    setSummary(null);
    setError(null);
    setAudioBase64(null);

    try {
      const response = await fetch('/api/think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, files, mode })
      });

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let localSteps: ThoughtStep[] = branchFromIndex !== undefined ? steps.slice(0, branchFromIndex + 1) : [];
      setSteps([...localSteps]);

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const { type, payload } = JSON.parse(line.slice(6));
              switch (type) {
                case 'current_dimension':
                  setCurrentDimension(payload);
                  break;
                case 'step':
                  localSteps = [...localSteps, payload];
                  setSteps([...localSteps]);
                  break;
                case 'final_intent':
                  setFinalIntent(payload);
                  break;
                case 'final_report':
                  setFinalReport(payload);
                  break;
                case 'audio_base64':
                  setAudioBase64(payload);
                  break;
                case 'retry':
                case 'status':
                  setRetryStatus(payload);
                  if (type === 'retry') {
                    setTimeout(() => setRetryStatus(prev => prev === payload ? null : prev), 5000);
                  }
                  break;
                case 'error':
                  setError(payload);
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE chunk:", e);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError(`Cognitive Loop Fault: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsThinking(false);
      setCurrentDimension(null);
      setRetryStatus(null);
    }
  };

  const handleGenerateSummary = async () => {
    if (steps.length === 0) return;
    setIsGeneratingSummary(true);
    setShowSummaryOverlay(true);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps })
      });
      const data = await res.json();
      setSummary(data.summary);
    } catch (err) {
      console.error(err);
      setError("Summary Generation Failed");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleInspireMe = () => {
    if (suggestions.length > 0) {
      const random = suggestions[Math.floor(Math.random() * suggestions.length)];
      setInput(random);
    }
  };

  const downloadReport = () => {
    if (!finalReport) return;
    const blob = new Blob([finalReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Obsidian_Report_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyAllContent = async () => {
    let content = "# COGNITIVE CHRONICLE\n\n";
    
    steps.forEach((step, index) => {
      content += `## STEP ${index + 1}: ${step.dimension}\n`;
      content += `### QUESTION\n${step.question}\n\n`;
      content += `### INTERNAL SYNTHESIS\n${step.answers.internal}\n\n`;
      content += `### ARCHIVAL MEMORY\n${step.answers.archival}\n\n`;
      content += `### EXTERNAL CONTEXT\n${step.answers.external}\n\n`;
      content += "---\n\n";
    });

    if (finalIntent) {
      content += "# FINAL SYNTHESIZED INTENT\n\n";
      content += finalIntent + "\n\n";
      content += "---\n\n";
    }

    if (finalReport) {
      content += "# PRINCIPAL ARCHITECT'S REPORT\n\n";
      content += finalReport + "\n\n";
    }

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(content);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy using navigator.clipboard:", err);
      // Fallback method
      try {
        const textArea = document.createElement("textarea");
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        }
      } catch (fallbackErr) {
        console.error("Fallback copy failed:", fallbackErr);
      }
    }
  };

  return (
    <div className="min-h-screen bg-obsidian text-gray-200 font-sans relative overflow-hidden">
      {/* Neural Void Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-500/5 blur-[150px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,transparent_70%)]" />
      </div>

      {/* Header */}
      <header className="h-16 border-b border-glass-border flex items-center justify-between px-8 bg-obsidian/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <NeuralPulse active={isThinking} dimension={currentDimension} />
          <div className="flex flex-col">
            <h1 className="text-xs font-medium tracking-[0.2em] uppercase text-white">Obsidian Thinking Machine</h1>
            <span className="micro-label !text-[7px]">Prestige Cognitive Layer v2.0</span>
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end">
            <span className="micro-label">System Integrity</span>
            <span className="text-[10px] font-medium text-emerald-400">Optimal</span>
          </div>
          <div className="h-8 w-px bg-glass-border" />
          <div className="flex flex-col items-end">
            <span className="micro-label">Neural Load</span>
            <span className="text-[10px] font-medium text-indigo-400">Stable</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-64px)] relative z-10">
        
        {/* Left Column: Controls & Registry */}
        <div className="lg:col-span-4 flex flex-col gap-6 h-full overflow-y-auto pr-2 custom-scrollbar pb-10">
          
          {/* Input Area */}
          <div className="glass-panel p-6 flex flex-col gap-4 shrink-0">
            <div className="flex items-center justify-between">
              <span className="micro-label">Stimulus Input</span>
              <div className="flex gap-3">
                <button 
                  onClick={handleInspireMe}
                  className="hover:text-indigo-400 transition-colors text-gray-500"
                  title="Inspire Me"
                >
                  <Sparkles size={12} />
                </button>
                <label className="cursor-pointer hover:text-white transition-colors text-gray-500">
                  <Upload size={12} />
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={isThinking} />
                </label>
                <Zap size={12} className={cn("transition-colors", isThinking ? "text-indigo-400" : "text-gray-600")} />
              </div>
            </div>
            
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded border border-white/10 text-[9px]">
                    <FileText size={10} />
                    <span className="truncate max-w-[80px]">{f.name}</span>
                    <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-400">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Inject query for multi-dimensional contemplation..."
              className="w-full bg-transparent border-none p-0 text-sm font-light focus:ring-0 outline-none transition-colors resize-none h-32 text-white placeholder:text-gray-600 leading-relaxed"
              disabled={isThinking}
            />

            <button
              onClick={() => setShowModeModal(true)}
              disabled={isThinking || (!input.trim() && files.length === 0)}
              className={cn(
                "w-full py-4 text-[10px] font-bold uppercase tracking-[0.3em] flex items-center justify-center gap-3 transition-all rounded-lg border",
                isThinking 
                  ? "bg-white/5 text-gray-500 border-white/5 cursor-not-allowed" 
                  : "bg-white text-black border-white hover:bg-transparent hover:text-white"
              )}
            >
              {isThinking ? <Loader2 className="animate-spin" size={14} /> : <Brain size={14} />}
              {isThinking ? "Contemplating..." : "Initiate Loop"}
            </button>
          </div>

          {/* Cognitive Evolution Monitor */}
          <div className="glass-panel p-6 flex flex-col gap-4 overflow-hidden flex-1 min-h-[250px]">
            <div className="flex items-center justify-between">
              <span className="micro-label">Cognitive Evolution Monitor</span>
              <Activity size={12} className="text-indigo-500/50" />
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-0 relative custom-scrollbar">
              {steps.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-[10px] text-gray-600 uppercase tracking-widest gap-4 opacity-50">
                  <div className="w-px h-12 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                  Awaiting Evolution
                  <div className="w-px h-12 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                </div>
              )}
              
              {/* Continuous Vertical Line */}
              {steps.length > 0 && (
                <div className="absolute left-[23px] top-4 bottom-4 w-px bg-white/10 z-0" />
              )}

              {steps.map((step, i) => (
                <button
                  key={i}
                  onClick={() => scrollToStep(i)}
                  className={cn(
                    "w-full group flex items-center gap-4 p-3 rounded-lg transition-all text-left relative z-10 mb-1",
                    currentDimension === step.dimension && steps.length - 1 === i 
                      ? "bg-indigo-500/5 border border-indigo-500/20" 
                      : "hover:bg-white/[0.03] border border-transparent"
                  )}
                >
                  <div className="w-6 flex justify-center shrink-0">
                    <div className={cn(
                      "w-2 h-2 rounded-full border transition-all z-10",
                      currentDimension === step.dimension && steps.length - 1 === i
                        ? "bg-indigo-500 border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                        : "bg-obsidian border-white/20 group-hover:border-indigo-500/50"
                    )} />
                  </div>
                  
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className={cn(
                      "text-[8px] font-mono text-gray-600 uppercase tracking-tighter",
                      currentDimension === step.dimension && steps.length - 1 === i ? "text-indigo-400/70" : ""
                    )}>
                      Iteration {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={cn(
                      "text-[10px] uppercase tracking-widest transition-colors truncate",
                      currentDimension === step.dimension && steps.length - 1 === i ? "text-white font-medium" : "text-gray-500 group-hover:text-gray-300"
                    )}>
                      {step.dimension}
                    </span>
                  </div>
                  
                  <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight size={10} className="text-indigo-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Dimension Registry */}
          <div className="glass-panel flex-1 p-6 overflow-hidden flex flex-col min-h-[250px]">
            <div className="flex items-center justify-between mb-6">
              <span className="micro-label">Cognitive Dimensions</span>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">Active Registry</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {Object.values(Dimension).map((dim) => {
                const isCurrent = currentDimension === dim;
                const visitCount = steps.filter(s => s.dimension === dim).length;
                const isVisited = visitCount > 0 || (dim === Dimension.INTENT_SYNTHESIS && !!finalIntent);
                
                return (
                  <div 
                    key={dim}
                    className={cn(
                      "group flex items-center gap-4 p-3 rounded-xl transition-all border relative overflow-hidden",
                      isCurrent 
                        ? "bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.1)]" 
                        : "bg-transparent border-transparent hover:bg-white/[0.02]"
                    )}
                  >
                    {/* Active Indicator Glow */}
                    {isCurrent && (
                      <motion.div 
                        layoutId="active-glow"
                        className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      />
                    )}

                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-mono transition-all border shrink-0",
                      isCurrent 
                        ? "bg-indigo-500 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]" 
                        : "bg-white/[0.03] border-white/10 text-gray-600",
                      isVisited && !isCurrent ? "bg-indigo-500/5 border-indigo-500/20 text-indigo-400" : ""
                    )}>
                      {isCurrent ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        visitCount > 0 ? visitCount : (isVisited ? "✓" : "0")
                      )}
                    </div>

                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-widest transition-colors truncate",
                          isCurrent ? "text-white" : "text-gray-500",
                          isVisited && !isCurrent ? "text-gray-300" : ""
                        )}>
                          {dim}
                        </span>
                        {visitCount > 0 && !isCurrent && (
                          <span className="text-[8px] font-mono text-indigo-400/60">x{visitCount}</span>
                        )}
                      </div>
                      
                      <p className={cn(
                        "text-[9px] font-light leading-tight transition-all",
                        isCurrent ? "text-gray-300 h-auto opacity-100 mt-1" : "text-gray-600 h-0 opacity-0 overflow-hidden"
                      )}>
                        {DIMENSIONS_INFO[dim]}
                      </p>
                    </div>

                    {/* Progress bar for active dimension */}
                    {isCurrent && (
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
                        <motion.div 
                          className="h-full bg-indigo-500"
                          initial={{ width: "0%" }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error Display */}
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex flex-col gap-3"
              >
                <div className="flex items-center gap-2 text-red-400">
                  <ShieldAlert size={14} />
                  <span className="micro-label !text-red-400">Neural Fault</span>
                </div>
                <p className="text-[11px] text-red-200/70 leading-relaxed">{error}</p>
                <button 
                  onClick={() => {
                    setSteps([]);
                    setFinalIntent(null);
                    setError(null);
                    setIsThinking(false);
                  }}
                  className="text-[9px] uppercase font-bold tracking-widest text-red-400 hover:text-red-300 transition-colors text-left"
                >
                  Reset Neural Substrate
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Thought Trace */}
        <div className="lg:col-span-8 glass-panel overflow-hidden flex flex-col shadow-2xl">
          <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <Activity size={14} className="text-indigo-400" />
              <span className="micro-label">Cognitive Chronicle</span>
            </div>
            <div className="flex items-center gap-4">
              {steps.length > 0 && (
                <button 
                  onClick={copyAllContent}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1 rounded-full border transition-all text-[9px] uppercase font-bold tracking-widest",
                    copySuccess 
                      ? "bg-green-500/10 border-green-500/20 text-green-400" 
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {copySuccess ? <Check size={12} /> : <Copy size={12} />}
                  {copySuccess ? "Copied" : "Copy All"}
                </button>
              )}
              {steps.length > 0 && (
                <button 
                  onClick={handleGenerateSummary}
                  className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[9px] uppercase font-bold tracking-widest text-indigo-400 hover:bg-indigo-500/20 transition-all"
                >
                  <ListChecks size={12} />
                  Thoughts Summary
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="micro-label !text-[8px]">Iterations</span>
                <span className="text-[10px] font-mono text-white">{steps.length}</span>
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-16 scroll-smooth">
            {steps.length === 0 && !isThinking && (
              <div className="h-full flex flex-col items-center justify-center gap-8 opacity-20">
                <Brain size={80} strokeWidth={0.5} className="text-white" />
                <div className="text-center space-y-2">
                  <span className="micro-label">Neural Void</span>
                  <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400">Awaiting Stimulus</p>
                </div>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {steps.map((step, sIdx) => (
                <motion.div 
                  key={`${step.dimension}-${sIdx}`}
                  id={`step-${sIdx}`}
                  initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="relative pl-12"
                >
                  {/* Timeline Line */}
                  <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-white/20 via-white/5 to-transparent" />
                  <div className="absolute left-[-4px] top-0 w-2 h-2 rounded-full bg-white border border-obsidian" />
                  
                  <div className="max-w-3xl">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="micro-label !text-indigo-400">Iteration {sIdx + 1}</span>
                      <div className="h-px w-8 bg-white/10" />
                      <span className="micro-label">{step.dimension}</span>
                    </div>
                    
                    <h2 className="serif-heading text-2xl mb-8 leading-tight">
                      {step.question}
                    </h2>

                    <div className="grid grid-cols-1 gap-6 mb-10">
                      <AnswerPill label="Internal Synthesis" content={step.answers.internal} />
                      <AnswerPill label="Archival Memory" content={step.answers.archival} />
                      <AnswerPill label="External Context" content={step.answers.external} />
                    </div>

                    <div className="flex items-center gap-4 mb-10">
                      <button 
                        onClick={() => handleThink(selectedMode, sIdx)}
                        disabled={isThinking}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] uppercase font-bold tracking-widest hover:bg-white/10 transition-colors"
                      >
                        <GitFork size={10} />
                        Branch Process
                      </button>
                    </div>

                    {step.controllerDecision && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        className="bg-white/[0.03] border border-white/5 p-6 rounded-xl"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <span className="micro-label">Controller Directive</span>
                          <div className={cn(
                            "text-[9px] px-3 py-1 rounded-full border uppercase font-bold tracking-widest",
                            step.controllerDecision.nextDimension === "TERMINATE" 
                              ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5" 
                              : "border-indigo-500/30 text-indigo-400 bg-indigo-500/5"
                          )}>
                            {step.controllerDecision.nextDimension === "TERMINATE" ? "Finalized" : `Route: ${step.controllerDecision.nextDimension}`}
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed font-light italic">
                          "{step.controllerDecision.reasoning}"
                        </p>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ))}

              {finalIntent && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-20 p-12 glass-panel border-indigo-500/30 shadow-[0_0_100px_-20px_rgba(99,102,241,0.15)] relative"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
                    <Brain size={240} />
                  </div>
                  <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                        <Zap className="text-indigo-400" size={20} />
                      </div>
                      <div className="flex flex-col">
                        <span className="micro-label !text-indigo-400">Final Synthesis</span>
                        <h3 className="serif-heading text-3xl">Intent Realized</h3>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {finalReport && (
                        <button 
                          onClick={() => setShowReportOverlay(true)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[9px] uppercase font-bold tracking-widest text-indigo-400 hover:bg-indigo-500/20 transition-all"
                        >
                          <Eye size={12} />
                          Full Report
                        </button>
                      )}
                      {audioBase64 && (
                        <button 
                          onClick={toggleAudio}
                          className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group"
                        >
                          {isPlaying ? <VolumeX size={20} className="text-indigo-400" /> : <Volume2 size={20} className="text-white group-hover:text-indigo-400" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {isGeneratingReport && (
                    <div className="mb-8 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex items-center gap-4">
                      <Loader2 className="animate-spin text-indigo-500" size={16} />
                      <span className="micro-label animate-pulse">Architecting Final Report...</span>
                    </div>
                  )}
                  
                  {audioBase64 && (
                    <audio 
                      ref={audioRef} 
                      src={`data:audio/wav;base64,${audioBase64}`} 
                      onEnded={() => setIsPlaying(false)}
                      className="hidden"
                    />
                  )}

                  <div className="markdown-body">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath]} 
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
                    >
                      {finalIntent}
                    </ReactMarkdown>
                  </div>
                </motion.div>
              )}

              {isThinking && currentDimension && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-6 p-8 border border-dashed border-white/10 rounded-xl bg-white/[0.01]"
                >
                  <div className="relative">
                    <Loader2 className="animate-spin text-indigo-500" size={24} />
                    <div className="absolute inset-0 blur-md bg-indigo-500/20 animate-pulse" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="micro-label !text-white">Neural Processing</span>
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest">
                      Dimension: <span className="text-indigo-400">{currentDimension}</span>
                    </span>
                  </div>
                  
                  {retryStatus && (
                    <div className="ml-auto flex items-center gap-3 px-4 py-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                      <Zap size={12} className="text-amber-500 animate-pulse" />
                      <span className="micro-label !text-amber-500">{retryStatus}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="h-32" />
          </div>
        </div>
      </main>

      {/* Mode Selection Modal */}
      <AnimatePresence>
        {showModeModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel w-full max-w-md p-8 flex flex-col gap-8 border-white/10 shadow-2xl"
            >
              <div className="flex flex-col gap-2">
                <span className="micro-label text-indigo-400">Cognitive Configuration</span>
                <h2 className="serif-heading text-2xl text-white">Select Reasoning Mode</h2>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Choose the depth of the neural substrate for this contemplation.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button 
                  onClick={() => {
                    setShowModeModal(false);
                    handleThink('fast');
                  }}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 group-hover:scale-110 transition-transform">
                    <Zap size={18} className="text-amber-400" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold uppercase tracking-widest text-white">Fast Mode</span>
                    <span className="text-[10px] text-gray-500">Agile reasoning, immediate synthesis, no minimum quotas.</span>
                  </div>
                </button>

                <button 
                  onClick={() => {
                    setShowModeModal(false);
                    handleThink('deep');
                  }}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 group-hover:scale-110 transition-transform">
                    <Brain size={18} className="text-indigo-400" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold uppercase tracking-widest text-white">Deep Mode</span>
                    <span className="text-[10px] text-gray-500">Exhaustive analysis, 3x dimension quotas, high technical rigor.</span>
                  </div>
                </button>
              </div>

              <button 
                onClick={() => setShowModeModal(false)}
                className="text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:text-white transition-colors text-center"
              >
                Cancel Initiation
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary Overlay */}
      <AnimatePresence>
        {showSummaryOverlay && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/60 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl border-white/10"
            >
              <div className="h-16 border-b border-white/5 flex items-center justify-between px-8">
                <div className="flex items-center gap-3">
                  <ListChecks size={16} className="text-indigo-400" />
                  <span className="micro-label">Cognitive State Summary</span>
                </div>
                <button 
                  onClick={() => setShowSummaryOverlay(false)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-10">
                {isGeneratingSummary ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
                    <Loader2 className="animate-spin text-indigo-500" size={32} />
                    <span className="micro-label animate-pulse">Synthesizing State...</span>
                  </div>
                ) : (
                  <div className="markdown-body">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath]} 
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
                    >
                      {summary || "No summary available."}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
              
              <div className="h-14 border-t border-white/5 flex items-center justify-end px-8 bg-white/[0.02]">
                <button 
                  onClick={() => setShowSummaryOverlay(false)}
                  className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Overlay */}
      <AnimatePresence>
        {showReportOverlay && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/60 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel w-full max-w-6xl h-full flex flex-col shadow-2xl border-white/10"
            >
              <div className="h-16 border-b border-white/5 flex items-center justify-between px-8">
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-indigo-400" />
                  <span className="micro-label">Principal Architect's Report</span>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={downloadReport}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] uppercase font-bold tracking-widest hover:bg-white/10 transition-all"
                  >
                    <Upload size={12} className="rotate-180" />
                    Download .md
                  </button>
                  <button 
                    onClick={() => setShowReportOverlay(false)}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-12">
                <div className="markdown-body max-w-4xl mx-auto">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]} 
                    rehypePlugins={[rehypeRaw, rehypeKatex]}
                  >
                    {finalReport || "No report available."}
                  </ReactMarkdown>
                </div>
              </div>
              
              <div className="h-14 border-t border-white/5 flex items-center justify-end px-8 bg-white/[0.02]">
                <button 
                  onClick={() => setShowReportOverlay(false)}
                  className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 h-10 bg-obsidian/80 backdrop-blur-md border-t border-white/5 flex items-center px-8 justify-between z-50">
        <div className="flex gap-12">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="micro-label !text-[8px]">Neural Link: Stable</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="micro-label !text-[8px]">Latency</span>
            <span className="text-[9px] font-mono text-gray-400">14ms</span>
          </div>
        </div>
        <div className="flex gap-8">
          <span className="micro-label !text-[8px]">Obsidian Thinking Machine v2.0.4</span>
          <span className="micro-label !text-[8px] opacity-40">© 2026 Neural Layer</span>
        </div>
      </footer>
    </div>
  );
}

function AnswerPill({ label, content }: { label: string, content: string }) {
  return (
    <div className="flex flex-col gap-3 group">
      <div className="flex items-center gap-3">
        <span className="micro-label !text-[8px] opacity-40 group-hover:opacity-100 transition-opacity">{label}</span>
        <div className="h-px flex-1 bg-white/[0.03]" />
      </div>
      <div className="markdown-body !text-[13px] !space-y-2 group-hover:text-white transition-colors">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm, remarkMath]} 
          rehypePlugins={[rehypeRaw, rehypeKatex]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function NeuralPulse({ active, dimension }: { active: boolean, dimension: Dimension | null }) {
  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      <motion.div 
        animate={active ? {
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3],
          rotate: [0, 180, 360]
        } : {}}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        className={cn(
          "absolute inset-0 rounded-full border border-white/10",
          active && "border-indigo-500/30"
        )}
      />
      <motion.div 
        animate={active ? {
          scale: [1, 1.5, 1],
          opacity: [0.1, 0.3, 0.1],
        } : {}}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        className={cn(
          "absolute inset-0 rounded-full bg-white/5 blur-md",
          active && "bg-indigo-500/10"
        )}
      />
      <Brain size={18} className={cn("relative transition-colors", active ? "text-indigo-400" : "text-gray-600")} />
    </div>
  );
}
