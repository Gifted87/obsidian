import { Dimension, ThoughtPart, ThoughtStep, SynthesisResult, GroundingResult, CodeRequest, CodeResult, ReasoningGraph, ControllerDecision } from "./types.ts";

/**
 * Common interface for all AI thinking engines.
 * Both GeminiEngine and DeepSeekEngine implement this contract.
 */
export interface IThinkingEngine {
  runStep(
    dimension: Dimension,
    userInput: string | ThoughtPart[],
    reasoningGraph: ReasoningGraph,
    mode?: "fast" | "deep",
    debateEnabled?: boolean
  ): Promise<ThoughtStep>;

  getNextDecision(
    userInput: string | ThoughtPart[],
    lastStep: ThoughtStep,
    reasoningGraph: ReasoningGraph,
    mode: "fast" | "deep",
    turnCount: number
  ): Promise<ControllerDecision>;

  synthesizeIntent(
    userInput: string | ThoughtPart[],
    reasoningGraph: ReasoningGraph,
    mode?: "fast" | "deep"
  ): Promise<SynthesisResult>;

  generateFinalReport(
    userInput: string | ThoughtPart[],
    reasoningGraph: ReasoningGraph,
    synthesis: string
  ): Promise<string>;

  generateSummary(reasoningGraph: ReasoningGraph): Promise<string>;

  generateSuggestions(): Promise<string[]>;

  /**
   * Generate TTS audio. Returns base64 WAV string, or null if unsupported.
   */
  generateTTS(text: string): Promise<string | null>;

  /**
   * Get the initial dimension the controller recommends to start with.
   * Advises UNDERSTANDING or INTERACTIVE, but allows controller choice.
   */
  getInitialDimension(
    userInput: string | ThoughtPart[],
    mode?: "fast" | "deep",
    sessionId?: string
  ): Promise<{ dimension: Dimension; reasoning: string }>;

  /**
   * Run the Grounding dimension to verify truthfulness and identify hallucinations.
   * Called every 3 loops to break overconfidence and ensure reasoning is grounded in fact.
   */
  runGrounding(
    userInput: string | ThoughtPart[],
    reasoningGraph: ReasoningGraph
  ): Promise<GroundingResult>;

  // ── Async Code Side-Channel ─────────────────────────────────────────────

  /**
   * Launch sandboxed execution of a CodeRequest asynchronously.
   * The promise is stored internally; the server loop polls via checkForCompletedCode().
   */
  dispatchCodeRequest(request: CodeRequest): void;

  /**
   * Poll for a settled code execution. Returns the first completed result found,
   * or null if none have finished yet.
   */
  checkForCompletedCode(): Promise<{ requestId: string; result: CodeResult } | null>;

  /**
   * Build a CODE_OBSERVATION ThoughtStep from a completed execution.
   * The step is pushed into the reasoning trace by the server loop.
   */
  createObservationStep(
    requestId: string,
    request: CodeRequest,
    result: CodeResult
  ): ThoughtStep;
}
