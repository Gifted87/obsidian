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
  [Dimension.UNDERSTANDING]: "Understand and define the intent of the question or topic, to understand something or some behavior or process. you muse ask questions to understand the user intent. examples: what does he really mean by {prompt}? what actually is the user asking for? what is the user trying to achieve? what is the user trying to solve?",
  [Dimension.INQUIRY]: "find out why something is or acts like it does. to find out the facts, logic, evidence, philosophical, psychological and spiritual reasons why",
  [Dimension.PROCEDURAL]: "to know how to do something using current ideas, knowledge, information and concepts. Formulate methodology, strategy, and step-by-step implementation plans.",
  [Dimension.WONDER]: " to wonder about possibilities and scenerios and wonder about the outcomes of each wonder.Model counterfactual possibilities and 'What-if' scenarios.",
  [Dimension.CONSEQUENCE]: "Analyze impact, influence, and downstream effects of potential actions.",
  [Dimension.META_COGNITION]: "Think about the thoughts produced so far. Critically reflect on the reasoning, assumptions, and conclusions generated in previous steps.",
  [Dimension.CREATIVE]: "Exploring all the logical ways to solve a problem. developing new hypothesis. Think of new, lateral, or unconventional ways to solve issues, especially when encountering contradictions or dead-ends.",
  [Dimension.CAUSAL]: "Explain the fundamental cause behind a result, pattern, or phenomenon observed in the reasoning.",
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
