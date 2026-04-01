import { GoogleGenAI, Type, FunctionCallingConfigMode, Modality } from "@google/genai";

const MODEL_NAME = "gemini-flash-lite-latest";
const FLASH_MODEL = "gemini-flash-lite-latest";
const CONTROLLER_MODEL = "gemini-flash-lite-latest";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

export enum Dimension {
  UNDERSTANDING = "Understanding",
  INQUIRY = "Inquiry",
  PROCEDURAL = "Procedural",
  WONDER = "Wonder",
  CONSEQUENCE = "Consequence",
  META_COGNITION = "Meta-Cognition",
  CREATIVE = "Creative",
  CAUSAL = "Causal",
  INTENT_SYNTHESIS = "Intent Synthesis",
}

export const DIMENSIONS_INFO: Record<Dimension, string> = {
  [Dimension.UNDERSTANDING]: "Establish semantic ground truth and define the intent of the question or topic.",
  [Dimension.INQUIRY]: "Perform root cause analysis and foundational causal questioning.",
  [Dimension.PROCEDURAL]: "Formulate methodology, strategy, and step-by-step implementation plans.",
  [Dimension.WONDER]: "Model counterfactual possibilities and 'What-if' scenarios.",
  [Dimension.CONSEQUENCE]: "Analyze impact, influence, and downstream effects of potential actions.",
  [Dimension.META_COGNITION]: "Think about the thoughts produced so far. Critically reflect on the reasoning, assumptions, and conclusions generated in previous steps.",
  [Dimension.CREATIVE]: "Think of new, lateral, or unconventional ways to solve issues, especially when encountering contradictions or dead-ends.",
  [Dimension.CAUSAL]: "Explain the fundamental 'why' behind a result, pattern, or phenomenon observed in the reasoning.",
  [Dimension.INTENT_SYNTHESIS]: "Distill all reasoning into a final, actionable technical directive.",
};

export interface ThoughtPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface ThoughtStep {
  dimension: Dimension;
  question: string;
  answers: {
    internal: string;
    archival: string;
    external: string;
  };
  controllerDecision?: {
    nextDimension: Dimension | "TERMINATE";
    reasoning: string;
  };
}

export interface SynthesisResult {
  status: "COMPLETE" | "CONTINUE";
  content: string;
  nextDimension?: Dimension;
  newDirective?: string;
}

export class ThinkingEngine {
  private ai: GoogleGenAI;
  private onRetry?: (message: string) => void;

  constructor(apiKey: string, onRetry?: (message: string) => void) {
    this.ai = new GoogleGenAI({ apiKey });
    this.onRetry = onRetry;
  }

  private getContext(steps: ThoughtStep[]): string {
    if (steps.length === 0) return "No history yet.";

    return steps
      .map(
        (s, i) =>
          `Step ${i + 1} [Dimension: ${s.dimension}]
Question: ${s.question}
Answers: 
- INTERNAL: ${s.answers.internal}
- ARCHIVAL: ${s.answers.archival}
- EXTERNAL: ${s.answers.external}
${s.controllerDecision ? `Controller Decision: ${s.controllerDecision.nextDimension}` : ""}`
      )
      .join("\n\n---\n\n");
  }

  private async retry<T>(fn: () => Promise<T>, retries = 7, delay = 3000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Detect transient errors (503 Service Unavailable, 429 Too Many Requests)
      const errorStr = JSON.stringify(error);
      const isTransient = 
        error?.status === 'UNAVAILABLE' || 
        error?.code === 503 || 
        error?.code === 429 || 
        errorStr.includes('503') || 
        errorStr.includes('429') || 
        errorStr.includes('high demand') ||
        errorStr.includes('UNAVAILABLE');
      
      if (retries <= 0) {
        console.error("Maximum retries exceeded for API call.", error);
        throw error;
      }
      
      // For transient errors, we use a slightly more aggressive backoff or longer initial wait
      const waitTime = isTransient ? delay : delay; 
      const message = `Neural Congestion Detected (${isTransient ? '503/429' : 'Error'}). Retrying in ${Math.round(waitTime / 1000)}s... (${retries} attempts left)`;
      
      console.warn(message, error);
      if (this.onRetry) this.onRetry(message);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // Exponential backoff: increase delay for next attempt
      return this.retry(fn, retries - 1, waitTime * 1.5);
    }
  }

  private extractJson(text: string): string {
    // Attempt to find the first '{' and last '}' to extract the JSON object
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return text.substring(start, end + 1);
    }
    return text.trim();
  }

  async runStep(
    dimension: Dimension,
    userInput: string | ThoughtPart[],
    previousSteps: ThoughtStep[],
    mode: 'fast' | 'deep' = 'deep'
  ): Promise<ThoughtStep> {
    const context = this.getContext(previousSteps);
    const dimensionPurpose = DIMENSIONS_INFO[dimension];

    // 1. Questioner Agent
    const lastStep = previousSteps[previousSteps.length - 1];
    const transitionReasoning = lastStep?.controllerDecision?.reasoning || "Initial phase.";

    const mathInstruction = "MATHEMATICAL RIGOR: Use mathematics, calculations, and formulas ONLY when strictly necessary for technical precision or clarity. Otherwise, use plain English and clear text to explain concepts.";

    const questionPrompt = `SYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system.
    STRICT DIRECTIVE: Your sole purpose in this step is to serve the dimension: ${dimension}.
    DIMENSION GOAL: ${dimensionPurpose}
    
    CONTROLLER'S INTENT FOR THIS TRANSITION: "${transitionReasoning}"
    
    USER INPUT: ${typeof userInput === 'string' ? `"${userInput}"` : "[MULTIMODAL INPUT DETECTED]"}
    
    REASONING HISTORY (CONTEXT):
    ${context || "No history yet."}
    
    TASK: Generate a single, highly specific, probing question that forces the Answerer agents to provide data that fulfills the purpose of the ${dimension} dimension. 
    Your question MUST directly address and build upon the CONTROLLER'S INTENT provided above to ensure the thought process keeps progressing.
    ${dimension === Dimension.META_COGNITION ? 'Since this is Meta-Cognition, your question MUST focus on analyzing the thoughts, logic, or potential gaps in the reasoning produced in the history above.' : ''}
    If the dimension is "Understanding", your question must focus on clarifying the intent, scope, or core meaning of the user's request.
    
    ${mathInstruction}
    
    BE TECHNICAL, CONCISE, AND DIRECT. DO NOT PROVIDE PREAMBLE.`;

    const qResponse = await this.retry(() => this.ai.models.generateContent({
      model: FLASH_MODEL,
      contents: typeof userInput === 'string' ? questionPrompt : [...userInput, { text: questionPrompt }],
    }));
    const question = qResponse.text || "What are the core parameters of this intent?";

    // 2. Answerer Agents
    const [internal, archival, external] = await Promise.all([
      this.getAnswer(dimension, question, "INTERNAL (Anatomy/Physiology/System State)", userInput, context, mode),
      this.getAnswer(dimension, question, "ARCHIVAL (Biographical Memory/Past Patterns)", userInput, context, mode),
      this.getAnswer(dimension, question, "EXTERNAL (General Knowledge/Logic/Web Context)", userInput, context, mode),
    ]);

    const step: ThoughtStep = {
      dimension,
      question,
      answers: { internal, archival, external },
    };

    // 3. Controller Agent Decision
    const turnCount = previousSteps.length + 1;
    const dimensionCounts: Record<string, number> = {};
    Object.values(Dimension).forEach(d => dimensionCounts[d] = 0);
    previousSteps.forEach(s => dimensionCounts[s.dimension]++);
    dimensionCounts[dimension]++; // Count current step

    const countsStr = Object.entries(dimensionCounts)
      .filter(([d]) => d !== Dimension.INTENT_SYNTHESIS)
      .map(([d, count]) => `${d}: ${count}/3`)
      .join(", ");

    const allQuotasMet = Object.entries(dimensionCounts)
      .filter(([d]) => d !== Dimension.INTENT_SYNTHESIS)
      .every(([_, count]) => count >= 3);

    let wrapUpDirective = "";
    if (turnCount > 100) {
      const remainingTurns = Math.max(0, 120 - turnCount);
      wrapUpDirective = `
    CRITICAL: WRAP-UP PHASE INITIATED.
    You have exceeded 100 turns of reasoning. You MUST now begin to converge and finalize your thoughts.
    You have exactly ${remainingTurns} turns remaining before the system forces a termination.
    Use these remaining steps to synthesize all findings, resolve any remaining contradictions, and prepare for a final 'TERMINATE' decision.
    DO NOT start new deep-dives unless absolutely necessary for the final solution.`;
    }

    const quotaDirective = mode === 'deep'
      ? `8. QUOTA: You MUST visit EVERY dimension at least 3 times before you are allowed to call 'TERMINATE'. Current status: ${allQuotasMet ? "QUOTAS MET" : "QUOTAS NOT MET"}. Do not terminate until all dimensions have reached 3/3 progress.`
      : `8. SUFFICIENCY: You may terminate when you feel the reasoning is sufficient to fulfill the user's request.`;

    const controllerPrompt = `SYSTEM: You are the CONTROLLER bot. You are the sovereign governor of this cognitive loop.
    
    USER INPUT: ${typeof userInput === 'string' ? `"${userInput}"` : "[MULTIMODAL INPUT]"}
    CURRENT DIMENSION: ${dimension}
    CURRENT TURN: ${turnCount}
    REASONING MODE: ${mode.toUpperCase()}
    ${wrapUpDirective}
    
    LATEST DATA GATHERED:
    Question Asked: ${question}
    Internal Answer: ${internal}
    Archival Answer: ${archival}
    External Answer: ${external}
    
    DIMENSION VISIT PROGRESS:
    ${countsStr}
    
    REASONING HISTORY SUMMARY:
    ${context}
    
    STRICT OPERATIONAL DIRECTIVES:
    1. EXHAUSTIVE ANALYSIS: Do NOT be lazy. Ensure thorough, deep, and multi-faceted reasoning. 
    2. SKEPTICISM: Assume the first few answers are insufficient. Dig deeper. 
    3. SUFFICIENCY CRITERIA: Transition to "TERMINATE" ONLY when the original goal is fully solved with absolute clarity and technical depth.
    4. DYNAMIC INTERLEAVING: Jump between dimensions to build a holistic understanding. Do NOT "camp" in one dimension.
    5. CREATIVE PIVOT: If you encounter a contradiction, a logical dead-end, or a physical impossibility, you MUST transition to the 'Creative' dimension to find lateral solutions.
    6. CAUSAL EXPLANATION: If a result or pattern is observed but not explained, transition to the 'Causal' dimension to explain the 'why'.
    7. TERMINATION: To end the loop and trigger the final synthesis, you MUST call 'set_next_dimension' with nextDimension="TERMINATE".
    ${quotaDirective}
    9. NO FIXED STOPPING: Do NOT stop just because you reached a certain number of turns. If the reasoning is incomplete, keep thinking.
    
    TASK: Analyze the latest data and use the 'set_next_dimension' tool to decide the next dimension or TERMINATE.`;

    const cResponse = await this.retry(() => this.ai.models.generateContent({
      model: CONTROLLER_MODEL,
      contents: typeof userInput === 'string' ? controllerPrompt : [...userInput, { text: controllerPrompt }],
      config: {
        tools: [{
          functionDeclarations: [{
            name: "set_next_dimension",
            description: "Set the next dimension for the cognitive loop or terminate it.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                nextDimension: {
                  type: Type.STRING,
                  description: "The next dimension to visit or 'TERMINATE' if all quotas are met.",
                  enum: ["Understanding", "Inquiry", "Procedural", "Wonder", "Consequence", "Meta-Cognition", "Creative", "Causal", "TERMINATE"]
                },
                reasoning: {
                  type: Type.STRING,
                  description: "Brief justification for this transition. This will be used by the Questioner to focus the next step."
                }
              },
              required: ["nextDimension", "reasoning"]
            }
          }]
        }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ["set_next_dimension"]
          }
        }
      },
    }));

    const call = cResponse.functionCalls?.[0];
    if (call && call.name === "set_next_dimension") {
      const args = call.args as any;
      step.controllerDecision = {
        nextDimension: args.nextDimension as Dimension | "TERMINATE",
        reasoning: args.reasoning,
      };
    } else {
      // Fallback: Try to parse JSON from text if function call failed
      try {
        const cleanedText = this.extractJson(cResponse.text || "");
        const decision = JSON.parse(cleanedText);
        if (decision.nextDimension && decision.reasoning) {
          step.controllerDecision = {
            nextDimension: decision.nextDimension as Dimension | "TERMINATE",
            reasoning: decision.reasoning,
          };
          return step;
        }
      } catch (e) {
        // Fallback failed
      }

      console.error("Controller failed to call set_next_dimension. Raw text:", cResponse.text);
      step.controllerDecision = {
        nextDimension: Dimension.META_COGNITION,
        reasoning: "Controller failed to use native function calling. Transitioning to Meta-Cognition to recover.",
      };
    }

    return step;
  }

  private async getAnswer(
    dimension: Dimension,
    question: string,
    persona: string,
    userInput: string | ThoughtPart[],
    context: string,
    mode: 'fast' | 'deep' = 'deep'
  ): Promise<string> {
    const isExternal = persona.includes("EXTERNAL");
    const mathInstruction = "QUANTITATIVE ANALYSIS: Incorporate mathematical formulas, calculations, or formal proofs ONLY when necessary to provide a precise answer. Otherwise, prioritize clear, descriptive English.";

    const prompt = `You are the ${persona} Answerer bot.
    STRICT DIRECTIVE: Your sole purpose in this step is to serve the dimension: ${dimension}.
    DIMENSION GOAL: ${DIMENSIONS_INFO[dimension]}
    
    USER INPUT: ${typeof userInput === 'string' ? `"${userInput}"` : "[MULTIMODAL INPUT]"}
    REASONING HISTORY (CONTEXT):
    ${context || "No history yet."}
    
    The Questioner asked: "${question}"
    
    TASK: Provide a concise, expert answer that fulfills the purpose of this dimension from your specific perspective.
    ${dimension === Dimension.META_COGNITION ? 'Since this is Meta-Cognition, you MUST analyze and reflect upon the thoughts, logic, or potential gaps in the reasoning produced in the history above.' : ''}
    ${isExternal ? 'Use Google Search or Maps if necessary to provide real-time or geographical grounding.' : ''}
    
    RICH FORMATTING: Use Markdown (tables, lists, bold) and LaTeX for formulas ($x^2$) to provide a clear, technical response.
    
    ${mathInstruction}
    
    BE TECHNICAL, CONCISE, AND DIRECT. DO NOT PROVIDE PREAMBLE.`;

    const response = await this.retry(() => this.ai.models.generateContent({
      model: FLASH_MODEL,
      contents: typeof userInput === 'string' ? prompt : [...userInput, { text: prompt }],
      config: {
        tools: isExternal ? [{ googleSearch: {} }] : undefined,
      }
    }));
    return response.text || "No data available.";
  }

  async generateTTS(text: string): Promise<string | null> {
    try {
      const response = await this.retry(() => this.ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: `Say with a sophisticated, calm, and authoritative voice: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
        },
      }));

      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (e) {
      console.error("TTS Generation Failed:", e);
      return null;
    }
  }

  async generateSummary(steps: ThoughtStep[]): Promise<string> {
    const fullTrace = this.getContext(steps);
    const prompt = `You are the COGNITIVE ANALYST. 
    
    TASK: Provide a comprehensive "State of Thinking" summary based on the reasoning trace below.
    
    REASONING TRACE:
    ${fullTrace}
    
    REQUIREMENTS:
    1. Summarize the key insights gathered across all dimensions so far.
    2. Identify the current consensus or leading hypothesis.
    3. Highlight any remaining uncertainties or contradictions.
    4. Explain "Where we are now" in the cognitive journey.
    
    STYLE: Sophisticated, technical, and highly detailed. Use a structured, long-form message format with rich Markdown (headings, tables, bold) and LaTeX for any mathematical content.`;

    const response = await this.retry(() => this.ai.models.generateContent({
      model: FLASH_MODEL,
      contents: prompt,
    }));
    return response.text || "Unable to generate summary.";
  }

  async synthesizeIntent(
    userInput: string | ThoughtPart[], 
    steps: ThoughtStep[],
    mode: 'fast' | 'deep' = 'deep'
  ): Promise<SynthesisResult> {
    const fullTrace = this.getContext(steps);
    
    const dimensionCounts: Record<string, number> = {};
    Object.values(Dimension).forEach(d => dimensionCounts[d] = 0);
    steps.forEach(s => dimensionCounts[s.dimension]++);
    
    const countsStr = Object.entries(dimensionCounts)
      .filter(([d]) => d !== Dimension.INTENT_SYNTHESIS)
      .map(([d, count]) => `${d}: ${count}/3`)
      .join(", ");

    const allQuotasMet = Object.entries(dimensionCounts)
      .filter(([d]) => d !== Dimension.INTENT_SYNTHESIS)
      .every(([_, count]) => count >= 3);

    const mathInstruction = "MATHEMATICAL RIGOR: Incorporate quantitative findings, formulas, and logical proofs ONLY when they are essential to the solution's technical accuracy. Otherwise, present the report in plain, authoritative English.";

    const quotaInstruction = mode === 'deep'
      ? `3. QUOTA CHECK: If any dimension has been visited fewer than 3 times (see progress above), you MUST use status="CONTINUE" and direct the system to a dimension that hasn't met its quota. Current status: ${allQuotasMet ? "QUOTAS MET" : "QUOTAS NOT MET"}.`
      : `3. SUFFICIENCY: Determine if the reasoning is sufficient to provide a complete answer.`;

    const prompt = `You are the INTENT SYNTHESIZER. 
    User Input: ${typeof userInput === 'string' ? `"${userInput}"` : "[MULTIMODAL INPUT]"}
    REASONING MODE: ${mode.toUpperCase()}
    Full Reasoning Trace:
    ${fullTrace}
    
    DIMENSION VISIT PROGRESS:
    ${countsStr}
    
    TASK:
    1. Analyze the exhaustive multi-dimensional reasoning trace above.
    2. Determine if the initial goal has been FULLY solved with high technical fidelity and specific, actionable details.
    ${quotaInstruction}
    4. If the reasoning is incomplete, abstract, or lacks the concrete specifications required to fulfill the user's request, you MUST use the 'submit_synthesis' tool with status="CONTINUE".
    5. If the reasoning is complete ${mode === 'deep' ? 'AND all quotas are met' : ''}, you MUST generate a VERY DETAILED TECHNICAL REPORT. This report should be the actual solution, including all specifications, methodologies, and architectural details derived from the reasoning. It must be a comprehensive response to the user's initial prompt.
    
    RICH FORMATTING: You MUST use advanced Markdown features to make the report professional and readable:
    - Use clear headings (h1, h2, h3) for structure.
    - Use tables for data comparison or specifications.
    - Use LaTeX (KaTeX) for any mathematical formulas or formal logic (e.g., $E=mc^2$ or $$\sum_{i=1}^n i$$).
    - Use bold and italics for emphasis.
    - Use blockquotes for key insights or warnings.
    - Use task lists for implementation steps.
    
    ${mathInstruction}
    
    CRITICAL: 
    - Do not settle for abstract directives or high-level summaries. The user wants the actual SOLUTION.
    - If you CONTINUE, provide a 'newDirective' that explicitly points the Controller to the specific missing technical pieces or unexplored areas.
    - Pay special attention to the Meta-Cognition phase, as it represents the system's self-reflection.`;

    const response = await this.retry(() => this.ai.models.generateContent({
      model: CONTROLLER_MODEL,
      contents: typeof userInput === 'string' ? prompt : [...userInput, { text: prompt }],
      config: {
        tools: [{
          functionDeclarations: [{
            name: "submit_synthesis",
            description: "Submit the final synthesized intent or request to continue the loop.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                status: {
                  type: Type.STRING,
                  description: "Whether the synthesis is complete or needs more reasoning.",
                  enum: ["COMPLETE", "CONTINUE"]
                },
                content: {
                  type: Type.STRING,
                  description: "The final technical directive (if COMPLETE) or explanation of gaps (if CONTINUE)."
                },
                nextDimension: {
                  type: Type.STRING,
                  description: "If status is CONTINUE, the dimension to restart with.",
                  enum: ["Understanding", "Inquiry", "Procedural", "Wonder", "Consequence", "Meta-Cognition", "Creative", "Causal"]
                },
                newDirective: {
                  type: Type.STRING,
                  description: "If status is CONTINUE, the specific focus for the next phase."
                }
              },
              required: ["status", "content"]
            }
          }]
        }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ["submit_synthesis"]
          }
        }
      }
    }));

    const call = response.functionCalls?.[0];
    if (call && call.name === "submit_synthesis") {
      const args = call.args as any;
      return {
        status: args.status as "COMPLETE" | "CONTINUE",
        content: args.content,
        nextDimension: args.nextDimension as Dimension,
        newDirective: args.newDirective,
      };
    } else {
      // Fallback: Try to parse JSON from text if function call failed
      try {
        const cleanedText = this.extractJson(response.text || "");
        const result = JSON.parse(cleanedText);
        if (result.status && result.content) {
          return {
            status: result.status as "COMPLETE" | "CONTINUE",
            content: result.content,
            nextDimension: result.nextDimension as Dimension,
            newDirective: result.newDirective,
          };
        }
      } catch (e) {
        // Fallback failed
      }

      return {
        status: "COMPLETE",
        content: response.text || "Synthesizer failed to use native function calling.",
      };
    }
  }

  async generateFinalReport(userInput: string | ThoughtPart[], steps: ThoughtStep[], synthesis: string): Promise<string> {
    const fullTrace = this.getContext(steps);
    const prompt = `You are the PRINCIPAL ARCHITECT. 
    
    TASK: Your job is to use all the previous thoughts and synthesized intent to describe a very detailed and long solution to the goal in form of a report that is not less than 3000 words long.
    
    USER INPUT: ${typeof userInput === 'string' ? `"${userInput}"` : "[MULTIMODAL INPUT]"}
    SYNTHESIZED INTENT:
    ${synthesis}
    
    FULL REASONING TRACE:
    ${fullTrace}
    
    REQUIREMENTS:
    1. The report MUST be extremely detailed, comprehensive, and technical.
    2. It MUST be at least 3000 words long. Do not be concise. Elaborate on every aspect of the solution.
    3. Use rich Markdown formatting (headings, tables, lists, bold, italics).
    4. Use LaTeX (KaTeX) for any mathematical formulas or formal logic.
    5. Structure the report with clear sections: Executive Summary, Problem Analysis, Proposed Architecture, Technical Specifications, Implementation Roadmap, Risk Assessment, and Conclusion.
    6. Ensure the solution is actionable and directly addresses the user's initial prompt with high fidelity.
    
    STYLE: Authoritative, expert, and exhaustive.`;

    const response = await this.retry(() => this.ai.models.generateContent({
      model: "gemini-3.1-pro-preview", // Use Pro for long-form generation
      contents: typeof userInput === 'string' ? prompt : [...userInput, { text: prompt }],
    }));
    return response.text || "Unable to generate final report.";
  }

  async generateSuggestions(): Promise<string[]> {
    const prompt = `You are the OBSIDIAN INTELLIGENCE PROMPT GENERATOR.
    TASK: Generate 4 standalone brainstorming tasks focused on inventing new products or solving specific real-world problems.
    STRICT DIRECTIVE: Do NOT assume any prior context or existing products. Each prompt must be a complete, independent idea for a user to explore.
    EXAMPLES: "Invent a new type of wearable device for deep-sea divers.", "Solve the problem of urban noise pollution using bio-materials.", "Design a low-cost water filtration system for rural communities."
    STYLE: Simple, direct, and creative.
    
    RETURN ONLY A JSON ARRAY OF STRINGS. NO PREAMBLE.`;

    try {
      const response = await this.retry(() => this.ai.models.generateContent({
        model: FLASH_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      }));
      return JSON.parse(response.text || "[]");
    } catch (e) {
      console.error("Suggestion Generation Failed:", e);
      return [
        "Invent a new type of wearable device for deep-sea divers.",
        "Solve the problem of urban noise pollution using bio-materials.",
        "Design a low-cost water filtration system for rural communities.",
        "Create a concept for a modular, zero-waste smartphone."
      ];
    }
  }
}
