import { useState, useEffect, useRef, useMemo, memo } from "react";
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
  Check,
  BookOpen,
  Command,
  Layers,
  ChevronDown,
  SendHorizontal,
  Save,
  FolderOpen,
  Play
} from "lucide-react";
import { Dimension, ThoughtStep, DIMENSIONS_INFO, ThoughtPart } from "./lib/types";
import { ExecutionDashboard } from "./components/executor/ExecutionDashboard";
import {
  ExecutionUIState,
  createInitialExecutionUIState,
  reduceExecutionEvent,
} from "./components/executor/dag_types_ui";
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

function createSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const API_BASE = '';
const apiUrl = (path: string) => `${API_BASE}${path}`;

interface FileData {
  name: string;
  type: string;
  base64: string;
}

interface InteractivePrompt {
  sessionId: string;
  question: string;
  rationale: string;
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
  const [showModeModal, setShowModeModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'fast' | 'deep'>('deep');
  const [provider, setProvider] = useState<'deepseek' | 'gemini'>('deepseek');
  const [interactivePrompt, setInteractivePrompt] = useState<InteractivePrompt | null>(null);
  const [interactiveAnswer, setInteractiveAnswer] = useState("");
  const [isSubmittingInteractiveAnswer, setIsSubmittingInteractiveAnswer] = useState(false);

  // Context panel
  const [context, setContext] = useState("");
  const [showContext, setShowContext] = useState(false);

  // Prompt Memory
  const [showPromptMemory, setShowPromptMemory] = useState(false);
  const [promptMutations, setPromptMutations] = useState<any[]>([]);

  // Macro Plan
  const [macroPlan, setMacroPlan] = useState<any | null>(null);

  // Instruct Machine
  const [showInstructPanel, setShowInstructPanel] = useState(false);
  const [instructionInput, setInstructionInput] = useState("");
  const [pendingInstruction, setPendingInstruction] = useState<string | null>(null);
  const [isQueueingInstruction, setIsQueueingInstruction] = useState(false);
  const [instructionQueued, setInstructionQueued] = useState(false);

  const [followUpInput, setFollowUpInput] = useState("");
  const currentSessionIdRef = useRef<string | null>(null);

  // Session DB
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [savedSessions, setSavedSessions] = useState<any[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [isSavingSession, setIsSavingSession] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  // ── Execution System UI State & Event Reader ──────────────────────────────────
  const [showExecutionDashboard, setShowExecutionDashboard] = useState(false);
  const [executionState, setExecutionState] = useState<ExecutionUIState>(createInitialExecutionUIState);

  const handleStartExecution = async (reportText?: string, sessionId?: string) => {
    const reportToUse = reportText || finalReport || finalIntent || input;
    const sessionToUse = sessionId || currentSessionIdRef.current || activeSessionIdRef.current || 'direct';
    if (!reportToUse) {
      setError("No report content available for execution. Please run a thinking session first.");
      return;
    }

    setShowExecutionDashboard(true);
    setExecutionState(createInitialExecutionUIState());

    try {
      const response = await fetch(apiUrl('/api/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thinkingSessionId: sessionToUse,
          finalReport: reportToUse,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to start execution job (HTTP ${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6).trim();
              if (jsonStr) {
                const event = JSON.parse(jsonStr);
                setExecutionState((prev) => reduceExecutionEvent(prev, event));
              }
            } catch (e) {
              console.error('Failed to parse execution event:', e);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Execution stream error:', err);
      setExecutionState((prev) => ({
        ...prev,
        status: 'FAILED',
        error: err.message || 'Execution stream error',
      }));
    }
  };

  const handleAbortExecution = async (jobId: string) => {
    try {
      await fetch(apiUrl(`/api/execute/${jobId}/abort`), { method: 'POST' });
      setExecutionState((prev) => ({
        ...prev,
        status: 'FAILED',
        error: 'Job aborted by user',
      }));
    } catch (err: any) {
      console.error('Failed to abort execution job:', err);
    }
  };

  useEffect(() => {
    const fetchProvider = async () => {
      try {
        const res = await fetch(apiUrl('/api/provider'));
        const data = await res.json();
        if (data.provider) {
          setProvider(data.provider);
        }
      } catch (err) {
        console.error("Failed to fetch provider:", err);
      }
    };

    fetchProvider();
  }, []);

  useEffect(() => {
    if (showPromptMemory) {
      fetchPromptMutations();
    }
  }, [showPromptMemory]);

  const fetchPromptMutations = async () => {
    try {
      const res = await fetch(apiUrl('/api/prompt-memory'));
      const data = await res.json();
      setPromptMutations(data);
    } catch (err) {
      console.error("Failed to fetch prompt mutations:", err);
    }
  };

  const handlePromptVote = async (id: string, type: 'upvote' | 'downvote') => {
    try {
      await fetch(apiUrl(`/api/prompt-memory/${id}/${type}`), { method: 'POST' });
      fetchPromptMutations();
    } catch (err) {
      console.error(`Failed to ${type} mutation:`, err);
    }
  };

  const handleProviderSwitch = async (newProvider: 'deepseek' | 'gemini') => {
    try {
      const res = await fetch(apiUrl('/api/set-provider'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: newProvider }),
      });
      const data = await res.json();
      if (data.provider) {
        setProvider(data.provider);
      }
    } catch (err) {
      console.error("Failed to switch provider:", err);
    }
  };

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

  const handleQueueInstruction = async () => {
    if (!instructionInput.trim()) return;
    const currentSession = activeSessionIdRef.current;
    if (!currentSession) {
      setError("No active cognitive session to instruct. Start the loop first.");
      return;
    }
    
    setIsQueueingInstruction(true);
    try {
      const res = await fetch(apiUrl('/api/instruct'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, instruction: instructionInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed to queue mid-session instruction");
      setPendingInstruction(instructionInput.trim());
      setInstructionQueued(true);
      setInstructionInput("");
      setShowInstructPanel(false);
      // Indicator will be cleared automatically when the server sends 'instruction_active'
    } catch (err) {
      console.error("Failed to queue instruction:", err);
      setError("Failed to transmit instruction to the controller.");
    } finally {
      setIsQueueingInstruction(false);
    }
  };

  const handleThink = async (mode: 'fast' | 'deep', branchFromIndex?: number) => {
    if (!input.trim() && files.length === 0) return;
    
    const newSessionId = createSessionId();
    activeSessionIdRef.current = newSessionId;
    currentSessionIdRef.current = newSessionId;
    setSelectedMode(mode);
    setIsThinking(true);
    setFinalIntent(null);
    setFinalReport(null);
    setSummary(null);
    setError(null);
    setAudioBase64(null);
    setInteractivePrompt(null);
    setInteractiveAnswer("");
    setPendingInstruction(null);
    setInstructionQueued(false);
    setMacroPlan(null);

    try {
      const response = await fetch(apiUrl('/api/think'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, files, mode, sessionId: newSessionId, context: context.trim() || undefined })
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
                case 'macro_plan':
                  setMacroPlan(payload);
                  break;
                case 'step':
                  localSteps = [...localSteps, payload];
                  setSteps([...localSteps]);
                  break;
                case 'step_update':
                  localSteps[payload.index] = payload.step;
                  setSteps([...localSteps]);
                  break;
                case 'interactive_request':
                  setInteractivePrompt(payload);
                  setRetryStatus("Awaiting user response...");
                  break;
                case 'instruction_active':
                  // Server has consumed the queued mid-session instruction
                  setPendingInstruction(null);
                  setInstructionQueued(false);
                  setRetryStatus(`Instruction acknowledged: "${payload.instruction}"`);
                  break;
                case 'final_intent':
                  setFinalIntent(payload);
                  break;
                case 'final_report':
                  setFinalReport(payload);
                  setShowReportOverlay(true);
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
      if (activeSessionIdRef.current === newSessionId) {
        activeSessionIdRef.current = null;
      }
    }
  };

  const handleFollowUpSubmit = async () => {
    if (!followUpInput.trim() || !currentSessionIdRef.current) return;
    
    setIsThinking(true);
    setFinalIntent(null);
    setFinalReport(null);
    setSummary(null);
    setError(null);
    setAudioBase64(null);
    setInteractivePrompt(null);
    setInteractiveAnswer("");
    setPendingInstruction(null);
    setInstructionQueued(false);
    
    activeSessionIdRef.current = currentSessionIdRef.current;
    const promptToSend = followUpInput;
    setFollowUpInput("");

    try {
      const response = await fetch(apiUrl('/api/think'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          input: promptToSend, 
          mode: selectedMode, 
          sessionId: currentSessionIdRef.current, 
          isContinuation: true 
        })
      });

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let localSteps: ThoughtStep[] = [...steps];
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
                case 'macro_plan':
                  setMacroPlan(payload);
                  break;
                case 'step':
                  localSteps = [...localSteps, payload];
                  setSteps([...localSteps]);
                  break;
                case 'step_update':
                  localSteps[payload.index] = payload.step;
                  setSteps([...localSteps]);
                  break;
                case 'interactive_request':
                  setInteractivePrompt(payload);
                  setRetryStatus("Awaiting user response...");
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
      setError(`Continuation Fault: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsThinking(false);
      setCurrentDimension(null);
      setRetryStatus(null);
      if (activeSessionIdRef.current === currentSessionIdRef.current) {
        activeSessionIdRef.current = null;
      }
    }
  };

  const handleSubmitInteractiveAnswer = async () => {
    if (!interactivePrompt || !interactiveAnswer.trim()) return;

    setIsSubmittingInteractiveAnswer(true);
    try {
      const res = await fetch(apiUrl('/api/interactive-response'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: interactivePrompt.sessionId,
          response: interactiveAnswer,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Interactive response failed");
      }

      setInteractivePrompt(null);
      setInteractiveAnswer("");
      setRetryStatus("Integrating user response...");
    } catch (err) {
      setError(`Interactive Response Fault: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingInteractiveAnswer(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (steps.length === 0) return;
    setIsGeneratingSummary(true);
    setShowSummaryOverlay(true);
    try {
      const res = await fetch(apiUrl('/api/summary'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionIdRef.current, steps })
      });
      const data = await res.json();
      if (res.ok && data.summary) {
        setSummary(data.summary);
      } else {
        setSummary(`### Summary Unavailable\n\n${data.error || "Unable to synthesize thoughts summary."}`);
      }
    } catch (err) {
      console.error(err);
      setError("Summary Generation Failed");
    } finally {
      setIsGeneratingSummary(false);
    }
  };



  const downloadReport = () => {
    if (!finalReport) return;
    const blob = new Blob([finalReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ovan_Report_${new Date().toISOString().split('T')[0]}.md`;
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

  const fetchSavedSessions = async () => {
    try {
      const res = await fetch(apiUrl('/api/sessions'));
      const data = await res.json();
      setSavedSessions(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSession = async () => {
    if (!sessionName.trim() || !currentSessionIdRef.current) return;
    setIsSavingSession(true);
    try {
      const res = await fetch(apiUrl('/api/sessions/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionIdRef.current, name: sessionName })
      });
      if (!res.ok) throw new Error("Failed to save session");
      setShowSaveModal(false);
      setSessionName("");
    } catch (err) {
      setError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleLoadSession = async (id: string, autoExecute: boolean = false) => {
    setIsLoadingSession(true);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${id}`));
      if (!res.ok) throw new Error("Failed to load session");
      const data = await res.json();
      
      const { session, steps: loadedSteps } = data;
      
      // Clear current state and load new session
      setIsThinking(false);
      setSteps(loadedSteps);
      const report = session.graph?.metadata?.finalReport || session.graph?.metadata?.finalIntent || null;
      setFinalIntent(session.graph?.metadata?.finalIntent || null);
      setFinalReport(report);
      setAudioBase64(session.graph?.metadata?.audioBase64 || null);
      setMacroPlan(session.graph?.metadata?.macroPlan || null);
      currentSessionIdRef.current = session.id;
      activeSessionIdRef.current = session.id;
      
      setShowSessionsModal(false);

      if (autoExecute) {
        handleStartExecution(report || undefined, session.id);
      } else if (report) {
        setShowReportOverlay(true);
      }
      
      // Scroll to bottom slowly
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
      }, 500);

    } catch (err) {
      setError(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoadingSession(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian text-gray-200 font-sans relative overflow-hidden selection:bg-indigo-500/30 selection:text-white">
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
            <h1 className="text-xs font-medium tracking-[0.2em] uppercase text-white">Ovan</h1>
          </div>
        </div>

        {/* Model Switcher Pill */}
        <div className="flex items-center glass-panel p-1 gap-1 border border-white/5 relative z-10">
          <button
            onClick={() => handleProviderSwitch('deepseek')}
            className={cn(
              "px-3 py-1 text-[10px] font-mono tracking-wider rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer",
              provider === 'deepseek'
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                : "text-gray-400 hover:text-white border border-transparent"
            )}
          >
            <Cpu size={11} className={cn("transition-transform duration-500", provider === 'deepseek' && "rotate-90 text-cyan-400")} />
            DEEPSEEK
          </button>
          <button
            onClick={() => handleProviderSwitch('gemini')}
            className={cn(
              "px-3 py-1 text-[10px] font-mono tracking-wider rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer",
              provider === 'gemini'
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold shadow-[0_0_12px_rgba(99,102,241,0.15)]"
                : "text-gray-400 hover:text-white border border-transparent"
            )}
          >
            <Sparkles size={11} className={cn("transition-transform duration-500", provider === 'gemini' && "scale-110 text-indigo-400")} />
            GEMINI
          </button>
          
          <button
            onClick={() => setShowExecutionDashboard(true)}
            className="px-3 py-1 text-[10px] font-mono tracking-wider rounded-lg transition-all duration-300 flex items-center gap-1.5 cursor-pointer bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)] ml-2"
          >
            <Play size={11} className="text-cyan-400 fill-cyan-400 animate-pulse" />
            SWARM EXECUTION
          </button>
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

                <label className="cursor-pointer hover:text-indigo-400 transition-colors text-gray-400">
                  <Upload size={12} />
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={isThinking} />
                </label>
                <button
                  onClick={() => setShowContext(v => !v)}
                  title="Toggle Context"
                  className={cn(
                    "hover:text-indigo-400 transition-colors",
                    showContext ? "text-indigo-400" : "text-gray-400",
                    context.trim() ? "text-indigo-400" : ""
                  )}
                >
                  <BookOpen size={12} />
                </button>
                <button
                  onClick={() => setShowPromptMemory(true)}
                  title="Prompt Memory Registry"
                  className="hover:text-indigo-400 transition-colors text-gray-400"
                >
                  <Database size={12} />
                </button>
                <button
                  onClick={() => {
                    fetchSavedSessions();
                    setShowSessionsModal(true);
                  }}
                  title="Session Library"
                  className="hover:text-indigo-400 transition-colors text-gray-400"
                >
                  <FolderOpen size={12} />
                </button>
                <Zap size={12} className={cn("transition-colors", isThinking ? "text-indigo-400" : "text-gray-400")} />
              </div>
            </div>
            
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded border border-white/10 text-[10px]">
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
              className="w-full bg-transparent border-none p-0 text-sm font-normal focus:ring-0 outline-none transition-colors resize-none h-32 text-white placeholder:text-gray-400 leading-relaxed"
              disabled={isThinking}
            />

            {/* Context Panel */}
            {showContext && (
              <div className="border-t border-white/5 pt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen size={10} className="text-indigo-400" />
                    <span className="micro-label !text-indigo-300">Reference Context</span>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">{context.length} chars</span>
                </div>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Paste background docs, specs, logs, codebase snippets..."
                  className="w-full min-h-[100px] max-h-[200px] bg-indigo-500/5 border border-indigo-500/15 rounded-lg p-3 text-[11px] font-normal text-gray-100 placeholder:text-gray-400 leading-relaxed outline-none focus:border-indigo-500/30 focus:ring-1 focus:ring-indigo-500/10 transition-all resize-y"
                  disabled={isThinking}
                />
                {context.trim() && (
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-indigo-400/70">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    Context active — agents will reference this material
                  </div>
                )}
              </div>
            )}

            {/* Pending Instruction Badge */}
            {pendingInstruction && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <Command size={10} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="micro-label !text-amber-400 !text-[10px]">Instruction queued for next turn</span>
                  <span className="text-[10px] text-amber-300/70 truncate leading-snug">"{ pendingInstruction }"</span>
                </div>
              </div>
            )}

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

            {provider === 'deepseek' && (
              <div className="flex items-center gap-2 text-[10px] text-cyan-400/70 font-mono mt-1 border-t border-white/5 pt-3">
                <ShieldAlert size={10} className="text-cyan-400/80 animate-pulse" />
                <span>DeepSeek mode: TTS and live search are unavailable.</span>
              </div>
            )}
          </div>



          {/* Dimension Registry */}
          <div className="glass-panel flex-1 p-6 overflow-hidden flex flex-col min-h-[250px]">
            <div className="flex items-center justify-between mb-6">
              <span className="micro-label">Cognitive Dimensions</span>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Active Registry</span>
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
                        : "bg-white/[0.03] border-white/10 text-gray-400",
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
                          isCurrent ? "text-white" : "text-gray-300",
                          isVisited && !isCurrent ? "text-gray-100" : ""
                        )}>
                          {dim}
                        </span>
                        {visitCount > 0 && !isCurrent && (
                          <span className="text-[10px] font-mono text-indigo-400/60">x{visitCount}</span>
                        )}
                      </div>
                      
                      <p className={cn(
                        "text-[10px] font-normal leading-tight transition-all",
                        isCurrent ? "text-gray-200 h-auto opacity-100 mt-1" : "text-gray-400 h-0 opacity-0 overflow-hidden"
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
                  className="text-[10px] uppercase font-bold tracking-widest text-red-400 hover:text-red-300 transition-colors text-left"
                >
                  Reset Neural Substrate
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Thought Trace */}
        <div className="lg:col-span-8 glass-panel overflow-hidden flex flex-col shadow-2xl">
          {/* Pure Dimension Breadcrumbs Bar (Above Chronicle Header) */}
          {(steps.length > 0 || isThinking || macroPlan) && (
            <div className="border-b border-white/10 bg-white/[0.03] px-6 py-2.5 flex items-center gap-2 overflow-x-auto custom-scrollbar scroll-smooth">
              {macroPlan && (
                <div className="mr-2 shrink-0">
                  <MacroPlanViewer macroPlan={macroPlan} />
                </div>
              )}

              {steps.map((step, i) => {
                const isCurrent = currentDimension === step.dimension && steps.length - 1 === i;

                return (
                  <div key={i} className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => scrollToStep(i)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer border",
                        isCurrent
                          ? "bg-indigo-500/20 text-white border-indigo-400 font-semibold shadow-[0_0_12px_rgba(99,102,241,0.3)]"
                          : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:border-indigo-400/40 hover:text-white"
                      )}
                      title={`Jump to Iteration ${i + 1}: ${step.dimension}`}
                    >
                      <span className="text-[10px] text-indigo-400 font-bold">#{i + 1}</span>
                      <span>{step.dimension}</span>
                    </button>

                    {i < steps.length - 1 && (
                      <ChevronRight size={12} className="text-indigo-400/60 shrink-0" />
                    )}
                  </div>
                );
              })}

              {isThinking && currentDimension && (
                <div className="flex items-center gap-2 shrink-0">
                  {steps.length > 0 && <ChevronRight size={12} className="text-indigo-400 shrink-0 animate-pulse" />}
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 whitespace-nowrap animate-pulse">
                    <Loader2 className="animate-spin" size={11} />
                    <span>{currentDimension}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cognitive Chronicle Header */}
          <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-white/[0.01]">
            <div className="flex items-center gap-3">
              <Activity size={14} className="text-indigo-400" />
              <span className="micro-label">Cognitive Chronicle</span>
            </div>
            <div className="flex items-center gap-4">
              {steps.length > 0 && (
                <button 
                  onClick={copyAllContent}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1 rounded-full border transition-all text-[10px] uppercase font-bold tracking-widest",
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
                  className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] uppercase font-bold tracking-widest text-indigo-400 hover:bg-indigo-500/20 transition-all"
                >
                  <ListChecks size={12} />
                  Thoughts Summary
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="micro-label !text-[10px]">Iterations</span>
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

                    {/* Initial Perspectives from the 3 Agents (Collapsible) */}
                    <InitialPerspectivesViewer answers={step.answers} />

                    {/* Meta Reasoning Audit */}
                    {step.metaReasoningAudit && (
                      <MetaReasoningAuditViewer audit={step.metaReasoningAudit} />
                    )}

                    {/* Thinking Agent Internal Monologue */}
                    {step.thinkingMonologue && (
                      <ThinkingMonologueViewer monologue={step.thinkingMonologue} />
                    )}

                    {/* Thinking Agent Final Consolidated Insight */}
                    {step.consolidatedInsight && (
                      <div className="mb-10 bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-6 shadow-[0_0_25px_rgba(99,102,241,0.15)]">
                        <div className="flex items-center gap-2 mb-4">
                          <Brain size={16} className="text-indigo-400" />
                          <span className="micro-label !text-indigo-300">Thinking Agent — Final Consolidated Insight</span>
                        </div>
                        <div className="markdown-body !text-sm text-gray-100 leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                            {step.consolidatedInsight}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Pending code execution indicator */}
                    {step.codeRequest && (step.codeRequest.status === 'pending' || step.codeRequest.status === 'launched') && (
                      <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                        <Loader2 size={13} className="animate-spin text-amber-400 shrink-0" />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="micro-label !text-amber-400 !text-[10px]">Code Execution Queued</span>
                          <span className="text-[10px] text-amber-300/60 font-mono truncate">{step.codeRequest.language} · {step.codeRequest.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    )}

                    {/* CodeObservation terminal block */}
                    {step.codeResult && (
                      <div className="mb-10 bg-black/40 border border-cyan-500/25 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-cyan-500/5 border-b border-cyan-500/15">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                          <span className="micro-label !text-cyan-400 !text-[10px] flex-1">Code Observation — Ground Truth</span>
                          <span className="text-[10px] font-mono text-gray-500">
                            Exit: {step.codeResult.exitCode} · {step.codeResult.elapsedMs}ms
                          </span>
                        </div>
                        {step.codeResult.stdout && (
                          <pre className="p-4 text-green-300 text-[11px] font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                            {step.codeResult.stdout}
                          </pre>
                        )}
                        {!step.codeResult.stdout && (
                          <p className="px-4 py-3 text-[10px] text-gray-600 font-mono italic">(no stdout)</p>
                        )}
                        {step.codeResult.stderr && (
                          <pre className="px-4 pb-4 text-red-400 text-[11px] font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto border-t border-red-500/10 pt-3">
                            {step.codeResult.stderr}
                          </pre>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-4 mb-10">
                      <button 
                        onClick={() => handleThink(selectedMode, sIdx)}
                        disabled={isThinking}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase font-bold tracking-widest hover:bg-white/10 transition-colors"
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
                            "text-[10px] px-3 py-1 rounded-full border uppercase font-bold tracking-widest",
                            step.controllerDecision.nextDimension === "TERMINATE" 
                              ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5" 
                              : "border-indigo-500/30 text-indigo-400 bg-indigo-500/5"
                          )}>
                            {step.controllerDecision.nextDimension === "TERMINATE" ? "Finalized" : `Route: ${step.controllerDecision.nextDimension}`}
                          </div>
                        </div>
                        <p className="text-xs text-gray-200 leading-relaxed italic font-normal">
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
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] uppercase font-bold tracking-widest text-indigo-400 hover:bg-indigo-500/20 transition-all"
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

            {!isThinking && steps.length > 0 && finalIntent && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-12 pt-8 border-t border-white/5 relative"
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 bg-obsidian text-[10px] uppercase tracking-widest text-indigo-400 font-mono">
                  Session Concluded
                </div>
                
                <div className="max-w-2xl mx-auto glass-panel p-6 border-indigo-500/20">
                  <div className="flex items-center gap-3 mb-4">
                    <MessageSquare size={14} className="text-indigo-400" />
                    <h3 className="text-sm font-medium text-white tracking-wide">Continue Thinking</h3>
                  </div>
                  <div className="flex flex-col gap-3">
                    <textarea
                      value={followUpInput}
                      onChange={(e) => setFollowUpInput(e.target.value)}
                      placeholder="Ask a follow-up question or provide a new directive..."
                      className="w-full h-24 bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-4 text-sm font-light text-white placeholder:text-gray-500 focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500/30 outline-none resize-none transition-all"
                    />
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setShowSaveModal(true)}
                        className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-2"
                      >
                        <Save size={12} />
                        Save
                      </button>
                      <button
                        onClick={handleFollowUpSubmit}
                        disabled={!followUpInput.trim()}
                        className="px-6 py-2 bg-white hover:bg-gray-200 disabled:opacity-50 text-black text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-2"
                      >
                        <Zap size={12} />
                        Follow Up
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="h-32" />
          </div>
        </div>
      </main>

      {/* Interactive Prompt Modal */}
      <AnimatePresence>
        {interactivePrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-8 bg-black/75 backdrop-blur-xl overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 24 }}
              className="glass-panel w-full max-w-2xl max-h-[85vh] flex flex-col p-6 md:p-8 border-indigo-500/20 shadow-[0_0_90px_-30px_rgba(99,102,241,0.55)] my-auto overflow-hidden"
            >
              {/* Scrollable Content Container for Question & Controller Rationale */}
              <div className="overflow-y-auto custom-scrollbar pr-2 mb-4 flex-1">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center shrink-0">
                    <MessageSquare size={18} className="text-indigo-300" />
                  </div>
                  <div className="min-w-0">
                    <span className="micro-label !text-indigo-300">Interactive Dimension</span>
                    <h2 className="serif-heading text-xl md:text-2xl text-white mt-2 leading-tight">
                      {interactivePrompt.question}
                    </h2>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain size={13} className="text-indigo-300" />
                    <span className="micro-label !text-[10px]">Controller Rationale</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed font-light whitespace-pre-wrap">
                    {interactivePrompt.rationale}
                  </p>
                </div>
              </div>

              {/* Answer Input Section */}
              <div className="flex flex-col gap-3 shrink-0 pt-2 border-t border-white/5">
                <textarea
                  value={interactiveAnswer}
                  onChange={(e) => setInteractiveAnswer(e.target.value)}
                  placeholder="Type your clarification, preference, constraint, or decision..."
                  className="w-full min-h-28 max-h-48 bg-black/20 border border-white/10 rounded-xl p-4 text-sm text-white placeholder:text-gray-600 outline-none focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/10 transition-all resize-y overflow-y-auto"
                  autoFocus
                  disabled={isSubmittingInteractiveAnswer}
                />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <span className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">
                    {interactiveAnswer.length} characters
                  </span>
                  <button
                    onClick={handleSubmitInteractiveAnswer}
                    disabled={!interactiveAnswer.trim() || isSubmittingInteractiveAnswer}
                    className={cn(
                      "px-5 py-3 rounded-lg border text-[10px] font-bold uppercase tracking-[0.25em] flex items-center justify-center gap-3 transition-all",
                      interactiveAnswer.trim() && !isSubmittingInteractiveAnswer
                        ? "bg-indigo-500 text-white border-indigo-400 shadow-[0_0_22px_rgba(99,102,241,0.25)] hover:bg-indigo-400"
                        : "bg-white/5 text-gray-600 border-white/5 cursor-not-allowed"
                    )}
                  >
                    {isSubmittingInteractiveAnswer ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
                    Transmit Response
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                    onClick={() => {
                      setShowReportOverlay(false);
                      handleStartExecution(finalReport!);
                    }}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 border border-cyan-400/40 text-[10px] uppercase font-bold tracking-widest hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all cursor-pointer text-white"
                  >
                    <Play size={12} className="fill-white text-white" />
                    Execute Plan
                  </button>
                  <button 
                    onClick={downloadReport}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase font-bold tracking-widest hover:bg-white/10 transition-all cursor-pointer"
                  >
                    <Upload size={12} className="rotate-180" />
                    Download .md
                  </button>
                  <button 
                    onClick={() => setShowReportOverlay(false)}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors cursor-pointer"
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
      <footer className="fixed bottom-0 left-0 right-0 h-10 bg-obsidian/80 backdrop-blur-md border-t border-white/5 flex items-center px-8 justify-end z-50">
        <div className="flex gap-8">
          <span className="micro-label !text-[10px]">Ovan v2.0.4</span>
          <span className="micro-label !text-[10px] opacity-40">© 2026 Neural Layer</span>
        </div>
      </footer>

      {/* ── Instruct Machine FAB + Panel ─────────────────────────────────── */}
      <div className="fixed bottom-14 right-6 z-[90] flex flex-col items-end gap-3">

        {/* Success toast */}
        <AnimatePresence>
          {instructionQueued && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/25 rounded-full text-[10px] font-mono text-amber-300 shadow-lg"
            >
              <Check size={10} className="text-amber-400" />
              Instruction queued for next turn
            </motion.div>
          )}
        </AnimatePresence>

        {/* Slide-up panel */}
        <AnimatePresence>
          {showInstructPanel && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="w-80 glass-panel p-5 border border-amber-500/20 shadow-[0_0_60px_-15px_rgba(245,158,11,0.3)] flex flex-col gap-4"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <Command size={13} className="text-amber-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white">Instruct Machine</span>
                    <span className="text-[10px] text-gray-500 font-mono">Priority directive for next turn</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowInstructPanel(false)}
                  className="p-1 hover:bg-white/5 rounded-full transition-colors text-gray-500 hover:text-white"
                >
                  <X size={12} />
                </button>
              </div>

              {/* Instruction input */}
              <div className="flex flex-col gap-2">
                <textarea
                  value={instructionInput}
                  onChange={(e) => setInstructionInput(e.target.value)}
                  placeholder="e.g. Focus only on hardware solutions... / Avoid discussing costs... / Be more concise..."
                  className="w-full min-h-[90px] bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-gray-600 outline-none focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/10 transition-all resize-none leading-relaxed"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleQueueInstruction();
                  }}
                />
                <span className="text-[10px] font-mono text-gray-600">
                  {instructionInput.length} chars · Ctrl+Enter to send
                </span>
              </div>

              {/* Description */}
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  This instruction will be injected as a <span className="text-amber-400/80 font-medium">top-priority directive</span> to the controller at the start of the next reasoning turn. The machine will prioritize it above all other reasoning.
                </p>
              </div>

              {/* Submit button */}
              <button
                onClick={handleQueueInstruction}
                disabled={!instructionInput.trim() || isQueueingInstruction}
                className={cn(
                  "w-full py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.25em] flex items-center justify-center gap-2 transition-all border",
                  instructionInput.trim() && !isQueueingInstruction
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/25 hover:bg-amber-500/25 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
                    : "bg-white/5 text-gray-600 border-white/5 cursor-not-allowed"
                )}
              >
                {isQueueingInstruction ? <Loader2 className="animate-spin" size={12} /> : <SendHorizontal size={12} />}
                {isQueueingInstruction ? "Queuing..." : "Queue Instruction"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAB button */}
        <motion.button
          id="instruct-machine-fab"
          onClick={() => setShowInstructPanel(v => !v)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "flex items-center gap-2.5 px-4 py-2.5 rounded-full border transition-all shadow-lg",
            showInstructPanel
              ? "bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_24px_rgba(245,158,11,0.25)]"
              : pendingInstruction
              ? "bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.15)] animate-pulse"
              : "bg-obsidian/80 border-white/10 text-gray-400 hover:border-amber-500/30 hover:text-amber-400 hover:bg-amber-500/5 backdrop-blur-md"
          )}
        >
          <Command size={13} />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            {pendingInstruction ? "Instruction Active" : "Instruct Machine"}
          </span>
          {pendingInstruction && (
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
          )}
        </motion.button>
      </div>
      {/* Prompt Memory Overlay */}
      <AnimatePresence>
        {showPromptMemory && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian/90 backdrop-blur-md p-4 lg:p-8"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="glass-panel w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
                <Database size={240} />
              </div>
              
              <div className="p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-obsidian/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Database className="text-indigo-400" size={16} />
                  </div>
                  <div>
                    <h3 className="serif-heading text-xl">Self-Modifying Prompt Memory</h3>
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">Learned cognitive mutations from past reflections</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPromptMemory(false)}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <X size={14} className="text-gray-400" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 relative z-1">
                {promptMutations.length === 0 ? (
                  <div className="text-center py-20 text-gray-500">
                    <Database size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="micro-label">No memory mutations yet.</p>
                    <p className="text-[10px] mt-2">The system will generate these automatically after concluding cognitive sessions.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {promptMutations.filter((m: any) => m.status === 'ACTIVE').map((mut: any) => (
                      <div key={mut.id} className="p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-colors group flex gap-4">
                        <div className="flex flex-col items-center gap-2 pt-1 shrink-0">
                          <button onClick={() => handlePromptVote(mut.id, 'downvote')} className="text-gray-500 hover:text-red-400 transition-colors" title="Retire Mutation">
                            <X size={16} />
                          </button>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono uppercase text-indigo-300">
                              {mut.agentRole}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              Added {new Date(mut.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm font-light leading-relaxed text-emerald-300 whitespace-pre-wrap mb-2">
                            + "{mut.proposedAddition}"
                          </p>
                          <p className="text-xs text-gray-400">
                            <span className="font-bold text-gray-500">Rationale: </span>
                            {mut.rationale}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Session Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-panel w-full max-w-sm p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="serif-heading text-lg">Save Session</h2>
                <button onClick={() => setShowSaveModal(false)} className="text-gray-500 hover:text-indigo-400 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Enter a memorable name..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-indigo-500/50 transition-colors mb-6"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSession(); }}
              />
              <button
                onClick={handleSaveSession}
                disabled={!sessionName.trim() || isSavingSession}
                className="w-full py-3 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSavingSession ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                {isSavingSession ? "Saving..." : "Save to Library"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Saved Sessions Modal */}
      <AnimatePresence>
        {showSessionsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-panel w-full max-w-3xl flex flex-col max-h-[80vh] overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 md:p-8 border-b border-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <FolderOpen size={16} className="text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="serif-heading text-xl md:text-2xl">Session Library</h2>
                    <span className="micro-label">Restore Historical State</span>
                  </div>
                </div>
                <button onClick={() => setShowSessionsModal(false)} className="text-gray-500 hover:text-indigo-400 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8">
                {savedSessions.length === 0 ? (
                  <div className="text-center text-gray-500 py-10">
                    <Database size={40} className="mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-medium">No saved sessions found in the library.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedSessions.map((s, idx) => (
                      <div 
                        key={idx} 
                        className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/[0.04] hover:border-indigo-500/30 transition-colors group"
                      >
                        <div 
                          className="flex-1 min-w-0 pr-4 cursor-pointer"
                          onClick={() => handleLoadSession(s.id, false)}
                        >
                          <h3 className="text-white font-medium mb-1 group-hover:text-indigo-400 transition-colors truncate">{s.name}</h3>
                          <span className="text-[10px] text-gray-500 font-mono">
                            {new Date(s.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLoadSession(s.id, true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 border border-cyan-400/40 text-[10px] uppercase font-bold tracking-wider text-white hover:shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-all cursor-pointer"
                            title="Load session and launch execution swarm"
                          >
                            <Play size={10} className="fill-white" />
                            Execute Plan
                          </button>
                          <button
                            onClick={() => handleLoadSession(s.id, false)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] uppercase font-bold tracking-wider text-gray-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                            title="Load session into view"
                          >
                            {isLoadingSession && currentSessionIdRef.current === s.id ? (
                              <Loader2 size={12} className="animate-spin text-white" />
                            ) : (
                              "Load & View"
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Execution System Dashboard Overlay */}
      {showExecutionDashboard && (
        <ExecutionDashboard
          executionState={executionState}
          onClose={() => setShowExecutionDashboard(false)}
          onAbortJob={handleAbortExecution}
          onStartExecution={() => handleStartExecution()}
        />
      )}
    </div>
  );
}

const AnswerPill = memo(function AnswerPill({ label, content }: { label: string, content: string }) {
  return (
    <div className="flex flex-col gap-3 group min-w-0 overflow-hidden">
      <div className="flex items-center gap-3 min-w-0">
        <span className="micro-label !text-[10px] opacity-40 group-hover:opacity-100 transition-opacity truncate">{label}</span>
        <div className="h-px flex-1 bg-white/[0.03]" />
      </div>
      <div className="markdown-body !text-[13px] !space-y-2 group-hover:text-white transition-colors overflow-x-auto max-w-full">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm, remarkMath]} 
          rehypePlugins={[rehypeRaw, rehypeKatex]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
});

function InitialPerspectivesViewer({ answers }: { answers: { internal: string; archival: string; external: string } }) {
  const [expanded, setExpanded] = useState(false);

  if (!answers || (!answers.internal && !answers.archival && !answers.external)) return null;

  return (
    <div className="mb-8 bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden min-w-0">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <Layers size={14} className="text-gray-400" />
          <span className="micro-label !text-gray-300 !text-[10px]">Initial Dimensional Perspectives (3 Answerers)</span>
        </div>
        <ChevronDown size={14} className={cn("text-gray-400 transition-transform", expanded && "rotate-180")} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-6 min-w-0">
              <AnswerPill label="Internal Perspective" content={answers.internal} />
              <AnswerPill label="Archival Perspective" content={answers.archival} />
              <AnswerPill label="External Perspective" content={answers.external} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetaReasoningAuditViewer({ audit }: { audit: string }) {
  const [expanded, setExpanded] = useState(true);

  if (!audit) return null;

  return (
    <div className="mb-8 bg-amber-950/20 border border-amber-500/30 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.08)]">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <ShieldAlert size={14} className="text-amber-400 animate-pulse" />
          <span className="micro-label !text-amber-300 !text-[10px]">Meta Reasoning Agent — Factual & Logical Audit Report</span>
        </div>
        <ChevronDown size={14} className={cn("text-amber-400 transition-transform", expanded && "rotate-180")} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 border-t border-amber-500/20 bg-black/40">
              <div className="markdown-body !text-xs text-amber-100/90 leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                  {audit}
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThinkingMonologueViewer({ monologue }: { monologue: string }) {
  const [expanded, setExpanded] = useState(true);

  if (!monologue) return null;

  return (
    <div className="mb-8 bg-cyan-950/20 border border-cyan-500/30 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.08)]">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <Brain size={14} className="text-cyan-400 animate-pulse" />
          <span className="micro-label !text-cyan-300 !text-[10px]">Thinking Agent — Internal Monologue</span>
        </div>
        <ChevronDown size={14} className={cn("text-cyan-400 transition-transform", expanded && "rotate-180")} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 border-t border-cyan-500/20 bg-black/40">
              <pre className="text-[11px] font-mono text-cyan-200/90 whitespace-pre-wrap leading-relaxed space-y-2 overflow-x-auto">
                {monologue}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DebateViewer({ rounds }: { rounds: any[] }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!rounds || rounds.length === 0) return null;

  return (
    <div className="mb-10 bg-indigo-500/5 border border-indigo-500/20 rounded-xl overflow-hidden">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Brain size={14} className="text-indigo-400" />
          <span className="micro-label !text-indigo-400 !text-[10px]">Meta Reasoning Audit Executed ({rounds.length} Phases)</span>
        </div>
        <ChevronDown size={14} className={cn("text-indigo-400 transition-transform", expanded && "rotate-180")} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-8 border-t border-indigo-500/10">
              {rounds.map((round, rIdx) => (
                <div key={rIdx} className="space-y-4">
                  <h4 className="text-[10px] font-mono font-bold tracking-widest uppercase text-indigo-300 border-b border-indigo-500/20 pb-2">
                    Phase {rIdx + 1}: {rIdx === 0 ? "Initial Responses" : "Finalized Post-Audit Answers"}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white/[0.02] p-3 rounded-lg border border-white/5">
                      <span className="text-[10px] uppercase tracking-widest text-gray-300 block mb-2 font-bold">Internal</span>
                      <p className="text-[10px] text-gray-200 whitespace-pre-wrap leading-relaxed">{round.internal}</p>
                    </div>
                    <div className="bg-white/[0.02] p-3 rounded-lg border border-white/5">
                      <span className="text-[10px] uppercase tracking-widest text-gray-300 block mb-2 font-bold">Archival</span>
                      <p className="text-[10px] text-gray-200 whitespace-pre-wrap leading-relaxed">{round.archival}</p>
                    </div>
                    <div className="bg-white/[0.02] p-3 rounded-lg border border-white/5">
                      <span className="text-[10px] uppercase tracking-widest text-gray-300 block mb-2 font-bold">External</span>
                      <p className="text-[10px] text-gray-200 whitespace-pre-wrap leading-relaxed">{round.external}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MacroPlanViewer({ macroPlan }: { macroPlan: any }) {
  if (!macroPlan || !macroPlan.clusters) return null;

  return (
    <div className="relative z-10 mb-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <ListChecks size={14} className="text-indigo-400" />
        <span className="micro-label !text-indigo-400">Macro Reasoning Schedule</span>
      </div>
      <p className="text-[10px] text-gray-300 mb-4 italic">Goal: {macroPlan.sessionGoal}</p>
      <div className="space-y-3">
        {macroPlan.clusters.map((cluster: any, idx: number) => (
          <div key={idx} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <div className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold",
                cluster.status === "COMPLETED" ? "bg-emerald-500 text-white" : cluster.status === "ACTIVE" ? "bg-indigo-500 text-white animate-pulse" : "bg-white/10 text-gray-400"
              )}>
                {cluster.status === "COMPLETED" ? <Check size={8} /> : idx + 1}
              </div>
              {idx < macroPlan.clusters.length - 1 && <div className="w-px h-full bg-white/10 mt-1" />}
            </div>
            <div className="flex flex-col gap-1 pb-3 w-full min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={cn(
                  "text-[11px] font-bold uppercase tracking-wider",
                  cluster.status === "COMPLETED" ? "text-emerald-400" : cluster.status === "ACTIVE" ? "text-indigo-400" : "text-gray-500"
                )}>
                  {cluster.label}
                </span>
              </div>
              <p className="text-[10px] text-gray-400">{cluster.goal}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {cluster.dimensions.map((d: string) => (
                  <span key={d} className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] font-mono text-gray-300">
                    {d}
                  </span>
                ))}
              </div>
              {cluster.deviation && (
                <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-start gap-2">
                  <ShieldAlert size={10} className="text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Deviation Detected</span>
                    <span className="text-[10px] text-amber-300/80">{cluster.deviation}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NeuralPulse({ active, dimension }: { active: boolean, dimension: Dimension | null }) {
  return (
    <div className="relative w-9 h-9 flex items-center justify-center">
      <motion.div 
        animate={active ? {
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3],
          rotate: [0, 180, 360]
        } : {}}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        className={cn(
          "absolute inset-0 rounded-xl border border-white/10",
          active && "border-indigo-500/40"
        )}
      />
      <motion.div 
        animate={active ? {
          scale: [1, 1.3, 1],
          opacity: [0.15, 0.4, 0.15],
        } : {}}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        className={cn(
          "absolute inset-0 rounded-xl bg-indigo-500/10 blur-sm",
          active && "bg-indigo-500/25"
        )}
      />
      <img src="/favicon.svg" alt="Ovan Favicon Icon" className="relative w-7 h-7 rounded-lg object-contain shadow-md" />
    </div>
  );
}
