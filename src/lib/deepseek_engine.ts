import OpenAI from "openai";
import { randomUUID } from "crypto";
import { Dimension, DIMENSIONS_INFO, ThoughtPart, ThoughtStep, SynthesisResult, CodeRequest, CodeResult, ReasoningGraph, GraphUtils, ControllerDecision, DebateRound } from "./types.ts";
import { PromptMemory } from "./prompt_memory.ts";
import { IThinkingEngine } from "./engine_interface.ts";
import { runCodeInSandbox } from "./sandbox.ts";
import { SYSTEM_SELF_MODEL } from "./self_model.ts";

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

const QUESTIONER_DIMENSION_RULES: Record<Dimension, string> = {
  [Dimension.UNDERSTANDING]: `SYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system, executing the Understanding dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on probing what the subject means and where its boundaries lie. What does it actually mean? What is in scope and what is out of scope? What are the definitions of the concepts?
*Example of overreach:* Do not ask for solutions, do not ask why something works, and do not ask for steps to achieve something.

INSTRUCTIONS:
Formulate a single, highly specific, probing question to clarify the meaning, boundaries, definitions, and scope of the subject. Your question must force the Answerers to define the demand clearly without trying to solve it.`,

  [Dimension.INQUIRY]: `SYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system, executing the Inquiry dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on probing why or how something works or happens. Reference background facts, theories, and established principles.
*Example of overreach:* Do not ask for procedural steps, do not ask for practical plans, and do not explore speculative what-if scenarios.

INSTRUCTIONS:
Formulate a single, highly specific, probing question that investigates the underlying 'why' and 'how' of the subject, exploring the fundamental mechanisms and background principles governing this domain.`,

  [Dimension.PROCEDURAL]: `SYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system, executing the Procedural dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on probing the steps, processes, and sequences involved in achieving or doing something.
*Example of overreach:* Do not ask why it works, what the risks are, or what speculative counterfactual scenarios exist.

INSTRUCTIONS:
Formulate a single, highly specific, probing question to map out the sequence of steps, phases, actions, and dependencies required to achieve the goal.`,

  [Dimension.WONDER]: `SYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system, executing the Wonder dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on probing speculative what-if scenarios, counterfactual alternatives, and hypothetical possibilities. What if things were different?
*Example of overreach:* Do not ask for realistic/practical plans, explanation of actual mechanics, or real consequence analysis.

INSTRUCTIONS:
Formulate a single, highly specific, speculative question to explore what could be if core assumptions, rules, or constraints were changed, inverted, or removed.`,

  [Dimension.CONSEQUENCE]: `SYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system, executing the Consequence dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on probing the impacts, risks, downstream effects, and outcomes. What could go wrong or right?
*Example of overreach:* Do not ask for new ideas/directions, steps of execution, or theoretical mechanisms.

INSTRUCTIONS:
Formulate a single, highly specific, probing question to assess the risks, trade-offs, downstream side effects, and potential failure or success modes of a decision or action.`,

  [Dimension.META_COGNITION]: `SYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system, executing the Meta-Cognition dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on probing the quality and integrity of the reasoning process done so far. How sound is the thinking? Have we drifted or fixated? Are we hallucinating?
*Example of overreach:* Do not ask for new solutions, speculative scenarios, or external information.

INSTRUCTIONS:
Formulate a single, highly specific, probing question to audit, critique, and reflect on the soundness, drifts, biases, or contradictions in the reasoning history.`,

  [Dimension.CREATIVE]: `SYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system, executing the Creative dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on probing new possibilities, lateral options, or redefining constraints. How else can this be done?
*Example of overreach:* Do not ask for conventional paths, standard procedures, or risks.

INSTRUCTIONS:
Formulate a single, highly specific, probing question to prompt lateral thinking, novel synthesis, and alternative ways to solve the problem by redefining constraints or exploring unconventional angles.`,

  [Dimension.CAUSAL]: `SYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system, executing the Causal dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on probing the mechanics, parameter dependencies, and root causes. Why is this this way? What causes what?
*Example of overreach:* Do not ask for steps to take, alternative speculative models, or risks.

INSTRUCTIONS:
Formulate a single, highly specific, probing question to trace and analyze the cause-and-effect relationships, feedback loops, and root causes of a behavior or state.`,

  [Dimension.GROUNDING]: `SYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system, executing the Grounding dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on verifying the factual truth, logical consistency, and evidence. Are facts true? Is there evidence to back them up? Are there hallucinations?
*Example of overreach:* Do not ask for speculative scenarios, new plans, or theoretical inquiry.

INSTRUCTIONS:
Formulate a single, highly specific, probing question to verify, fact-check, and ground the claims made in the reasoning trace against evidence, verifiable facts, or logical proof.`,

  [Dimension.INTERACTIVE]: `You are talking DIRECTLY TO THE USER. Phrase your question for the human user to answer.`,
  [Dimension.INTENT_SYNTHESIS]: `Generate a question to synthesize the final technical directive.`,
  [Dimension.CODE_OBSERVATION]: `Reflect on the completed code observation results.`,
};


const EXTERNAL_ANSWERER_DIMENSION_RULES: Record<Dimension, string> = {
  [Dimension.UNDERSTANDING]: `SYSTEM: You are the EXTERNAL Answerer bot in a multi-dimensional thinking system. You represent general knowledge, established definitions, and real-world context. You are currently executing the Understanding dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on clarifying what the subject means and where its boundaries lie. What does this actually mean? What is in scope and what is out of scope? What are the precise definitions of the terms and concepts involved?
*Example of overreach:* Do not try to generate a solution, explain why something works, or list steps to achieve anything. Your task is purely to clarify what needs to be understood.

INSTRUCTIONS:
The Understanding dimension is about meaning and boundaries. Its purpose is to establish a clear, shared definition of what is being asked, what it involves, and where it begins and ends. Nothing more.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.INQUIRY]: `SYSTEM: You are the EXTERNAL Answerer bot in a multi-dimensional thinking system. You represent general knowledge, academic research, and external context. You are currently executing the Inquiry dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on investigating why and how something works or happens. Reference existing knowledge, theories, research, and established principles that explain the phenomenon.
*Example of overreach:* Do not describe procedural steps for achieving something, do not generate a solution, and do not explore what-if scenarios. Stay purely in the domain of explanation and understanding of mechanisms.

INSTRUCTIONS:
The Inquiry dimension is about why and how. Its purpose is to explain the underlying mechanics, principles, and reasons that govern a subject — not to solve it or plan it, but to understand the forces that drive it.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.PROCEDURAL]: `SYSTEM: You are the EXTERNAL Answerer bot in a multi-dimensional thinking system. You represent established methodologies, processes, and structured approaches. You are currently executing the Procedural dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on the sequence of steps involved in achieving or doing something. What are the ordered actions, stages, or phases that must occur?
*Example of overreach:* Do not explain why something works, speculate on alternatives, or analyze consequences. Focus only on the ordered steps and their dependencies.

INSTRUCTIONS:
The Procedural dimension is about steps and sequence. Its purpose is to articulate what must be done and in what order to achieve a goal — the process itself, from beginning to end.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.WONDER]: `SYSTEM: You are the EXTERNAL Answerer bot in a multi-dimensional thinking system. You represent creative speculation, counterfactual logic, and hypothetical analysis. You are currently executing the Wonder dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on counterfactuals, what-if scenarios, and speculative alternatives. What if things were different? What if key assumptions were inverted or removed?
*Example of overreach:* Do not describe realistic plans, explain actual mechanics, or analyze real consequences. Stay in the space of imagination, speculation, and alternative possibility.

INSTRUCTIONS:
The Wonder dimension is about counterfactuals and speculation. Its purpose is to explore what could be if things were different — to challenge assumptions, invert constraints, and entertain possibilities that don't yet exist or may never exist.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.CONSEQUENCE]: `SYSTEM: You are the EXTERNAL Answerer bot in a multi-dimensional thinking system. You represent impact analysis, risk assessment, and downstream effects. You are currently executing the Consequence dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on what could happen as a result of something — the impacts, risks, side effects, and ripple effects of a decision, action, or state of affairs.
*Example of overreach:* Do not propose new directions, explain root causes, or list procedural steps. Focus only on what follows — what goes right, what goes wrong, and what the consequences are.

INSTRUCTIONS:
The Consequence dimension is about impacts and risks. Its purpose is to surface what could happen — the downstream effects, unintended consequences, failure modes, and potential outcomes that flow from a subject or decision.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.META_COGNITION]: `SYSTEM: You are the EXTERNAL Answerer bot in a multi-dimensional thinking system. You represent critical self-reflection and reasoning audit. You are currently executing the Meta-Cognition dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on auditing the quality of the thinking done so far. How sound is the reasoning? Have we drifted? Are we hallucinating? Have we been obsessing over one aspect while ignoring others?
*Example of overreach:* Do not introduce new ideas, propose solutions, or explore new dimensions of the problem. Focus only on the thinking itself — its integrity, balance, drift, and soundness.

INSTRUCTIONS:
The Meta-Cognition dimension is about thinking about the thinking. Its purpose is to step back and assess the reasoning process itself — to ask whether we are on track, whether our logic is sound, whether we have drifted or become unbalanced, and whether what we believe is actually supported.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.CREATIVE]: `SYSTEM: You are the EXTERNAL Answerer bot in a multi-dimensional thinking system. You represent lateral thinking, novel synthesis, and unconventional possibility. You are currently executing the Creative dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on generating new possibilities — approaches that don't yet exist in the current framing, reframings of the problem itself, or entirely novel angles that weren't considered.
*Example of overreach:* Do not follow conventional paths, explain existing mechanisms, or evaluate risks. Focus only on what new possibilities exist and how constraints might be redefined.

INSTRUCTIONS:
The Creative dimension is about new possibilities. Its purpose is to expand the solution and idea space — to ask how else this could be done, what possibilities haven't been considered, and what happens if we redefine the constraints themselves.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.CAUSAL]: `SYSTEM: You are the EXTERNAL Answerer bot in a multi-dimensional thinking system. You represent causal reasoning, root-cause analysis, and mechanistic understanding. You are currently executing the Causal dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on the mechanics and root causes behind something. Why is it the way it is? What causes what? What are the underlying forces and dependencies?
*Example of overreach:* Do not describe what to do about it, speculate on alternatives, or evaluate risks. Focus only on the causal chain — what produces what and why.

INSTRUCTIONS:
The Causal dimension is about mechanics and root causes. Its purpose is to trace why things are the way they are — to identify the forces, dependencies, feedback loops, and causal chains that produce an observed state or behavior.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.GROUNDING]: `SYSTEM: You are the EXTERNAL Answerer bot in a multi-dimensional thinking system. You represent factual verification and evidential grounding. You are currently executing the Grounding dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on verifying whether the claims made in the reasoning are actually true. Are the facts correct? Is there evidence — papers, studies, known records — to support them? Are there hallucinations?
*Example of overreach:* Do not introduce new ideas, explain mechanics, or explore consequences. Focus only on whether what has already been said is actually supported by evidence or truth.

INSTRUCTIONS:
The Grounding dimension is about truth and evidence. Its purpose is to verify the factual integrity of the reasoning — to ask whether claims are real, whether evidence exists to support them, and to identify and flag any hallucinations or unsupported assertions.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.INTERACTIVE]: `Awaiting user response...`,
  [Dimension.INTENT_SYNTHESIS]: `Distill all reasoning into the final actionable technical directive.`,
  [Dimension.CODE_OBSERVATION]: `Incorporate the code execution observations.`,
};

const INTERNAL_ANSWERER_DIMENSION_RULES: Record<Dimension, string> = {
  [Dimension.UNDERSTANDING]: `SYSTEM: You are the INTERNAL Answerer bot in a multi-dimensional thinking system. You represent first-principles reasoning, intrinsic structure, and the core mechanics of the problem space. You are currently executing the Understanding dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on clarifying what the subject means from a first-principles standpoint. What are its intrinsic definitions, its logical boundaries, its irreducible components?
*Example of overreach:* Do not generate a solution, explain why something works, or plan steps. Your task is purely to establish what is being asked and what it means at its core.

INSTRUCTIONS:
The Understanding dimension is about meaning and boundaries. Its purpose is to establish a clear, precise definition of what is being asked — what it is, what it involves, and where it begins and ends — viewed through the lens of intrinsic structure and first principles.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.INQUIRY]: `SYSTEM: You are the INTERNAL Answerer bot in a multi-dimensional thinking system. You represent core theory, formal models, and the fundamental mechanics of how things work. You are currently executing the Inquiry dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on the internal mechanics and theoretical foundations of why and how something works or happens. What are the laws, models, and principles that govern it from the inside?
*Example of overreach:* Do not describe procedural steps, propose solutions, or speculate on alternatives. Stay purely in the domain of mechanistic and theoretical explanation.

INSTRUCTIONS:
The Inquiry dimension is about why and how. Its purpose is to explain the underlying mechanics and principles that govern a subject — not to solve it or plan for it, but to understand the fundamental forces, models, and laws that make it behave as it does.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.PROCEDURAL]: `SYSTEM: You are the INTERNAL Answerer bot in a multi-dimensional thinking system. You represent logical flow, task decomposition, and execution sequence. You are currently executing the Procedural dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on the sequence of steps involved in achieving or producing something. What are the ordered actions and their dependencies?
*Example of overreach:* Do not explain why something works theoretically, speculate on alternatives, or analyze consequences. Focus only on the ordered steps and their logical structure.

INSTRUCTIONS:
The Procedural dimension is about steps and sequence. Its purpose is to articulate what must be done and in what order — the process itself, its stages, its dependencies, and its logical flow from beginning to end.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.WONDER]: `SYSTEM: You are the INTERNAL Answerer bot in a multi-dimensional thinking system. You represent radical speculation, theoretical limits, and hypothetical internal states. You are currently executing the Wonder dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on counterfactuals and what-if explorations at the level of fundamental mechanics. What if the core rules, limits, or structures were different?
*Example of overreach:* Do not describe realistic plans, explain actual mechanics, or evaluate real consequences. Stay in the space of speculation and alternative internal possibility.

INSTRUCTIONS:
The Wonder dimension is about counterfactuals and speculation. Its purpose is to explore what could be if the fundamental rules, assumptions, or constraints were different — to entertain possibilities that challenge the current internal model of how things work.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.CONSEQUENCE]: `SYSTEM: You are the INTERNAL Answerer bot in a multi-dimensional thinking system. You represent complexity analysis, trade-off evaluation, and internal downstream effects. You are currently executing the Consequence dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on what could happen as a result of something — the internal impacts, failure modes, trade-offs, and ripple effects within the system.
*Example of overreach:* Do not propose new directions, explain root causes, or list procedural steps. Focus only on what follows — the consequences, risks, and outcomes.

INSTRUCTIONS:
The Consequence dimension is about impacts and risks. Its purpose is to surface what could happen — the downstream effects, trade-offs, unintended consequences, and potential failure modes that arise from a given state, decision, or design.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.META_COGNITION]: `SYSTEM: You are the INTERNAL Answerer bot in a multi-dimensional thinking system. You represent structural logic review and internal reasoning audit. You are currently executing the Meta-Cognition dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on auditing the quality and integrity of the thinking done so far. Is the reasoning internally consistent? Are there logical gaps, circular arguments, or fixations?
*Example of overreach:* Do not introduce new ideas, propose solutions, or explore new problem dimensions. Focus only on the thinking itself — its structure, consistency, and soundness.

INSTRUCTIONS:
The Meta-Cognition dimension is about thinking about the thinking. Its purpose is to assess the reasoning process itself — to ask whether it is sound, whether it has drifted, whether it is fixating on one aspect at the expense of others, and whether the logic holds together.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.CREATIVE]: `SYSTEM: You are the INTERNAL Answerer bot in a multi-dimensional thinking system. You represent lateral synthesis, unconventional internal models, and non-linear possibility. You are currently executing the Creative dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on generating new possibilities and novel framings from within the problem's own structure. What new possibilities exist? How else could this be approached? What if the constraints were redefined?
*Example of overreach:* Do not follow conventional approaches, explain mechanics, or evaluate risks. Focus only on novel possibilities and reframings.

INSTRUCTIONS:
The Creative dimension is about new possibilities. Its purpose is to expand the idea and solution space — to ask how else something could be conceived or approached, and to explore what happens when assumptions and constraints are questioned or redefined.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.CAUSAL]: `SYSTEM: You are the INTERNAL Answerer bot in a multi-dimensional thinking system. You represent causal relationships, parameter dependencies, and internal system dynamics. You are currently executing the Causal dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on the mechanics and root causes behind something at its internal level. What causes what? What are the dependencies, feedback loops, and causal chains?
*Example of overreach:* Do not describe what to do about it, speculate on alternatives, or list steps. Focus only on the causal structure — what produces what and why.

INSTRUCTIONS:
The Causal dimension is about mechanics and root causes. Its purpose is to trace why things are the way they are — to identify the internal forces, dependencies, and causal chains that produce an observed state or behavior.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.GROUNDING]: `SYSTEM: You are the INTERNAL Answerer bot in a multi-dimensional thinking system. You represent formal verification, logical consistency, and evidential grounding. You are currently executing the Grounding dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on verifying whether the claims made in the reasoning are actually true and logically consistent. Are facts correct? Is there evidence to support them? Are there hallucinations or logical errors?
*Example of overreach:* Do not introduce new ideas, explore mechanics, or speculate on outcomes. Focus only on whether what has been said is actually supported by evidence, logic, or verifiable truth.

INSTRUCTIONS:
The Grounding dimension is about truth and evidence. Its purpose is to verify the factual and logical integrity of the reasoning — to check whether claims are real, whether they are supported by evidence, and to flag any hallucinations, errors, or unsupported assertions.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.INTERACTIVE]: `Awaiting user response...`,
  [Dimension.INTENT_SYNTHESIS]: `Distill all reasoning into the final actionable technical directive.`,
  [Dimension.CODE_OBSERVATION]: `Incorporate the code execution observations.`,
};

const ARCHIVAL_ANSWERER_DIMENSION_RULES: Record<Dimension, string> = {
  [Dimension.UNDERSTANDING]: `SYSTEM: You are the ARCHIVAL Answerer bot in a multi-dimensional thinking system. You represent collective memory, historical precedent, and contextual patterns from human knowledge across time. You are currently executing the Understanding dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on clarifying what the subject means through the lens of historical context and precedent. What has this meant across time and domains? Where have its boundaries been drawn before?
*Example of overreach:* Do not generate solutions, explain why something works, or describe steps. Your task is purely to clarify what needs to be understood through the lens of memory and history.

INSTRUCTIONS:
The Understanding dimension is about meaning and boundaries. Its purpose is to establish a clear, shared definition of what is being asked — what it is, what it involves, and where it begins and ends — drawing on the full breadth of recorded human knowledge and historical context.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.INQUIRY]: `SYSTEM: You are the ARCHIVAL Answerer bot in a multi-dimensional thinking system. You represent the history of ideas, the evolution of knowledge, and established theories across disciplines. You are currently executing the Inquiry dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on investigating why and how something works by drawing on accumulated human knowledge and historical intellectual development. What theories, discoveries, and intellectual traditions explain this?
*Example of overreach:* Do not describe procedural steps, propose solutions, or explore alternatives. Stay in the domain of explanation and historical understanding of mechanisms.

INSTRUCTIONS:
The Inquiry dimension is about why and how. Its purpose is to explain the underlying mechanics and principles that govern a subject — drawing on the intellectual history and accumulated knowledge of humanity to understand the forces and frameworks that make it behave as it does.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.PROCEDURAL]: `SYSTEM: You are the ARCHIVAL Answerer bot in a multi-dimensional thinking system. You represent established methodologies, historical processes, and proven approaches across disciplines and time. You are currently executing the Procedural dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on the steps and sequences involved in achieving something, informed by historically proven and established processes. What ordered stages have been used effectively before?
*Example of overreach:* Do not explain why something works theoretically, speculate on what-ifs, or evaluate consequences. Focus only on the ordered steps, their dependencies, and their structure.

INSTRUCTIONS:
The Procedural dimension is about steps and sequence. Its purpose is to articulate what must be done and in what order — the process itself, its stages, and its logical flow — drawing on historically established and proven procedures.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.WONDER]: `SYSTEM: You are the ARCHIVAL Answerer bot in a multi-dimensional thinking system. You represent speculative history, alternative timelines, and creative counterfactuals across human experience. You are currently executing the Wonder dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on counterfactuals and what-if scenarios, drawing on alternate historical possibilities and speculative divergences from what actually happened. What if history, discovery, or development had gone differently?
*Example of overreach:* Do not describe realistic plans, explain actual mechanics, or analyze real consequences. Stay in the space of imagination and speculative alternative possibility.

INSTRUCTIONS:
The Wonder dimension is about counterfactuals and speculation. Its purpose is to explore what could have been or could be if things were different — to challenge assumptions by entertaining historical and hypothetical alternatives that open new ways of thinking.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.CONSEQUENCE]: `SYSTEM: You are the ARCHIVAL Answerer bot in a multi-dimensional thinking system. You represent the history of outcomes, documented failures, post-mortems, and long-term impacts across human endeavors. You are currently executing the Consequence dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on what could happen or has happened as a result of something — the impacts, risks, side effects, and ripple effects, informed by historical outcomes.
*Example of overreach:* Do not propose new directions, explain root causes, or list steps. Focus only on what follows — the consequences, risks, and what history tells us about outcomes.

INSTRUCTIONS:
The Consequence dimension is about impacts and risks. Its purpose is to surface what could happen — the downstream effects, failure modes, unintended consequences, and outcomes that flow from a subject or decision — informed by the full record of how similar situations have played out.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.META_COGNITION]: `SYSTEM: You are the ARCHIVAL Answerer bot in a multi-dimensional thinking system. You represent cognitive pattern recognition, intellectual history, and the documented study of how minds reason and err. You are currently executing the Meta-Cognition dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on auditing the quality of the thinking done so far. Is the reasoning sound? Has it drifted? Is it fixating? Does it contain known cognitive biases or failure patterns?
*Example of overreach:* Do not introduce new ideas, propose solutions, or explore new problem dimensions. Focus only on the thinking itself — its soundness, balance, and integrity.

INSTRUCTIONS:
The Meta-Cognition dimension is about thinking about the thinking. Its purpose is to assess the reasoning process itself — whether it is on track, whether it is balanced, whether it has drifted or hallucinated, and whether the logic holds up to scrutiny from the perspective of how reasoning typically fails.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.CREATIVE]: `SYSTEM: You are the ARCHIVAL Answerer bot in a multi-dimensional thinking system. You represent creative synthesis across disciplines, historical analogies, and cross-domain lateral connections. You are currently executing the Creative dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on generating new possibilities and novel framings by drawing on cross-disciplinary and historical analogies. What new ideas emerge when you look at this through the lens of other domains and human history?
*Example of overreach:* Do not follow conventional paths, explain existing mechanics, or evaluate risks. Focus only on novel possibilities, reframings, and creative connections across the full breadth of human knowledge.

INSTRUCTIONS:
The Creative dimension is about new possibilities. Its purpose is to expand the idea and solution space — to ask how else something could be conceived, approached, or reframed by drawing on the full breadth of human knowledge, analogy, and creative history across all domains.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.CAUSAL]: `SYSTEM: You are the ARCHIVAL Answerer bot in a multi-dimensional thinking system. You represent historical causation, documented root-cause analyses, and patterns of cause and effect across human knowledge. You are currently executing the Causal dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on the mechanics and root causes behind something, informed by historical patterns and documented cause-and-effect relationships. Why is it the way it is? What forces produced it?
*Example of overreach:* Do not describe what to do about it, speculate on alternatives, or list steps. Focus only on the causal structure — what produces what, and why, through the lens of historical and documented causation.

INSTRUCTIONS:
The Causal dimension is about mechanics and root causes. Its purpose is to trace why things are the way they are — to identify the forces, dependencies, and causal chains that produce an observed state, drawing on historical and documented patterns of cause and effect.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.GROUNDING]: `SYSTEM: You are the ARCHIVAL Answerer bot in a multi-dimensional thinking system. You represent factual verification, reference research, and evidential grounding across the record of human knowledge. You are currently executing the Grounding dimension.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on verifying whether the claims made in the reasoning are actually true and evidentially supported. Are the facts correct? Do papers, records, or established knowledge back them up? Are there hallucinations?
*Example of overreach:* Do not introduce new ideas, explore mechanics, or speculate on outcomes. Focus only on whether what has been said is actually supported by evidence, documented knowledge, or verifiable truth.

INSTRUCTIONS:
The Grounding dimension is about truth and evidence. Its purpose is to verify the factual integrity of the reasoning — to check whether claims are real, whether they are supported by documented evidence or established knowledge, and to identify and flag any hallucinations or unsupported assertions.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`,

  [Dimension.INTERACTIVE]: `Awaiting user response...`,
  [Dimension.INTENT_SYNTHESIS]: `Distill all reasoning into the final actionable technical directive.`,
  [Dimension.CODE_OBSERVATION]: `Incorporate the code execution observations.`,
};

const executeCodeTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "execute_code",
    description: "Request execution of a code snippet directly on the local machine. Use when computation, algorithm verification, data processing, or simulation is needed. You have full internet access and can download any libraries you need (e.g., pip install). Do NOT interact with local project files.",
    parameters: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["python3", "javascript"], description: "Programming language." },
        code: { type: "string", description: "Complete, executable source code to run in the sandbox." },
      },
      required: ["language", "code"],
    },
  },
};

// ---------------------------------------------------------------------------
// Key rotation for DeepSeek API keys
// ---------------------------------------------------------------------------
class DeepSeekKeyRotator {
  private keys: string[] = [];
  private index = 0;
  private initialized = false;
  private sessionKeyMap = new Map<string, string>();

  private init() {
    if (this.initialized) return;
    const raw = process.env.DEEPSEEK_API_KEYS || process.env.DEEPSEEK_API_KEY || "";
    this.keys = raw.split(",").map((k) => k.trim()).filter(Boolean);
    if (this.keys.length === 0) {
      console.warn("[DeepSeekKeyRotator] No DEEPSEEK_API_KEYS found in environment.");
    }
    this.initialized = true;
  }

  getNextKey(sessionId?: string): string {
    this.init();
    if (this.keys.length === 0) throw new Error("No DeepSeek API keys configured.");
    const effectiveSessionId = (sessionId && sessionId.trim()) ? sessionId.trim() : "default_sticky_session";
    if (!this.sessionKeyMap.has(effectiveSessionId)) {
      const selected = this.keys[this.index % this.keys.length];
      this.index++;
      this.sessionKeyMap.set(effectiveSessionId, selected);
    }
    return this.sessionKeyMap.get(effectiveSessionId)!;
  }

  hasKeys(): boolean {
    this.init();
    return this.keys.length > 0;
  }
}

export const deepSeekKeyRotator = new DeepSeekKeyRotator();

// ---------------------------------------------------------------------------
// Helper: build a fresh OpenAI client pointing at DeepSeek with session key affinity
// ---------------------------------------------------------------------------
function makeClient(sessionId?: string): OpenAI {
  return new OpenAI({
    apiKey: deepSeekKeyRotator.getNextKey(sessionId),
    baseURL: DEEPSEEK_BASE_URL,
  });
}

// ---------------------------------------------------------------------------
// Helper: Extract code block from text
// ---------------------------------------------------------------------------
function extractCode(text: string): string | null {
  const match = text.match(/```(?:python|javascript|typescript|node|js|ts|py)?\n([\s\S]*?)```/i);
  if (match) return match[1].trim();
  // Fallback: if no backticks but looks like code
  if (text.includes("def ") || text.includes("function ") || text.includes("import ")) {
    return text.trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cache Tracking & Telemetry
// ---------------------------------------------------------------------------
export interface CacheStats {
  totalPromptTokens: number;
  totalHitTokens: number;
  totalMissTokens: number;
  overallSavingsPct: number;
  lastCallHitTokens: number;
  lastCallMissTokens: number;
  lastCallSavingsPct: number;
  callCount: number;
}

export class CacheTracker {
  private totalPromptTokens = 0;
  private totalHitTokens = 0;
  private totalMissTokens = 0;
  private callCount = 0;

  recordUsage(label: string, usage: any): CacheStats | null {
    if (!usage) return null;
    const hit = usage.prompt_cache_hit_tokens ?? 0;
    const miss = usage.prompt_cache_miss_tokens ?? (usage.prompt_tokens ?? 0) - hit;
    const total = usage.prompt_tokens ?? 0;
    const lastSavedPct = total > 0 ? Math.round((hit / total) * 100) : 0;

    this.totalPromptTokens += total;
    this.totalHitTokens += hit;
    this.totalMissTokens += miss;
    this.callCount++;

    const overallSavingsPct = this.totalPromptTokens > 0
      ? Math.round((this.totalHitTokens / this.totalPromptTokens) * 100)
      : 0;

    console.log(
      `[DeepSeekCache:${label}] Call #${this.callCount} | Hit: ${hit} (${lastSavedPct}%) | Miss: ${miss} | Total: ${total} || Cumulative: Hit: ${this.totalHitTokens}/${this.totalPromptTokens} (${overallSavingsPct}% saved)`
    );

    return {
      totalPromptTokens: this.totalPromptTokens,
      totalHitTokens: this.totalHitTokens,
      totalMissTokens: this.totalMissTokens,
      overallSavingsPct,
      lastCallHitTokens: hit,
      lastCallMissTokens: miss,
      lastCallSavingsPct: lastSavedPct,
      callCount: this.callCount
    };
  }

  getStats(): CacheStats {
    const overallSavingsPct = this.totalPromptTokens > 0
      ? Math.round((this.totalHitTokens / this.totalPromptTokens) * 100)
      : 0;
    return {
      totalPromptTokens: this.totalPromptTokens,
      totalHitTokens: this.totalHitTokens,
      totalMissTokens: this.totalMissTokens,
      overallSavingsPct,
      lastCallHitTokens: 0,
      lastCallMissTokens: 0,
      lastCallSavingsPct: 0,
      callCount: this.callCount
    };
  }

  reset(): void {
    this.totalPromptTokens = 0;
    this.totalHitTokens = 0;
    this.totalMissTokens = 0;
    this.callCount = 0;
  }
}

/**
 * Module-level singleton CacheTracker.
 * Persists across all DeepSeekEngine instances for the entire server process lifetime,
 * giving accurate cumulative cache statistics regardless of how many engine instances
 * are created per request.
 */
export const globalCacheTracker = new CacheTracker();

const STATIC_SYSTEM_PROMPT = `${SYSTEM_SELF_MODEL}\n\nYou are Ovan, an advanced multidimensional reasoning engine. You process complex problems through a series of logical dimensions. The history of the current reasoning session and system context are provided below.`;

// ---------------------------------------------------------------------------
// DeepSeekEngine
// ---------------------------------------------------------------------------
export class DeepSeekEngine implements IThinkingEngine {
  private model: string;
  private instanceSessionId = randomUUID();
  /** Stores settled state alongside each dispatched execution promise. */
  private pendingExecutions = new Map<string, { promise: Promise<CodeResult>; result?: CodeResult }>();

  constructor(
    model = DEFAULT_MODEL,
    private onRetry?: (message: string) => void,
    private onEvent?: (type: string, payload: any) => void
  ) {
    this.model = model;
  }

  /** Returns the module-level global cache stats (shared across all engine instances). */
  public getCacheStats(): CacheStats {
    return globalCacheTracker.getStats();
  }

  // ── Retry wrapper ──────────────────────────────────────────────────────────
  private async retry<T>(fn: () => Promise<T>, retries = 7, delay = 3000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isTransient =
        error?.status === 503 ||
        error?.status === 429 ||
        error?.code === "ECONNRESET" ||
        String(error).includes("503") ||
        String(error).includes("429");

      if (retries <= 0) {
        console.error("[DeepSeekEngine] Max retries exceeded.", error);
        throw error;
      }

      const waitTime = isTransient ? delay : delay;
      const message = `Neural Congestion Detected (${isTransient ? '503/429' : 'Error'}). Retrying in ${Math.round(waitTime / 1000)}s... (${retries} attempts left)`;

      console.warn(message, error);
      if (this.onRetry) this.onRetry(message);

      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.retry(fn, retries - 1, waitTime * 1.5);
    }
  }

  // ── Cache-hit logger ───────────────────────────────────────────────────────
  private logCacheUsage(label: string, usage: any): void {
    // Use the module-level singleton so stats accumulate across all requests.
    const stats = globalCacheTracker.recordUsage(label, usage);
    if (stats && this.onEvent) {
      this.onEvent('cache_stats', stats);
    }
  }

  // ── History builder (Full — no sliding window, no compression, 100% immutable) ──
  // Every completed step is included in full at a fixed position in the message array.
  // CRITICAL: History messages DO NOT depend on s.controllerDecision. Once created at the
  // end of a step, a step's history content NEVER mutates → 100% prefix cache hits.
  private buildHistory(
    graph: ReasoningGraph
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const steps = GraphUtils.getAncestorChain(graph, graph.activeHeadId);
    if (steps.length === 0) return [];

    return steps.flatMap((s, i) => {
      let content =
        `Step ${i + 1} [Dimension: ${s.dimension}]\n` +
        `Question: ${s.question}\n` +
        `Answers:\n` +
        `- INTERNAL: ${s.answers.internal}\n` +
        `- ARCHIVAL: ${s.answers.archival}\n` +
        `- EXTERNAL: ${s.answers.external}` +
        (s.consolidatedInsight ? `\nConsolidated Insight: ${s.consolidatedInsight}` : "");

      if (s.codeRequest) {
        content += `\nCode Execution Requested: language=${s.codeRequest.language}, status=${s.codeRequest.status}`;
      }
      if (s.codeResult) {
        content += `\nCode Observation (ground truth): exitCode=${s.codeResult.exitCode}, elapsedMs=${s.codeResult.elapsedMs}ms\nstdout: ${s.codeResult.stdout.substring(0, 500)}\nstderr: ${s.codeResult.stderr.substring(0, 200)}`;
      }

      return [
        { role: "user" as const, content },
        {
          role: "assistant" as const,
          content: `Step ${i + 1} recorded.`,
        },
      ];
    });
  }


  // ── Cache-Optimized Message Builder ("Unified Shared History Prefix") ──────────
  // OPTIMAL MULTI-AGENT CACHE ORDER:
  //   [sys]      STATIC_SYSTEM_PROMPT          — never changes           → always hits
  //   [query]    "Core User Query: <userText>" — stable within session   → hits after 1st call
  //   [...history]                             — shared by ALL agents    → Questioner seeds it;
  //                                                                        Answerers/Meta/Controller hit it!
  //   [AGENT]    agent persona & instructions  — agent-specific          → branch point at tail
  //   [DIR]      dynamic directive             — turn-specific (tiny)    → miss at tail
  //
  // WHY HISTORY BEFORE AGENT:
  // All 7 agents share the exact same [sys] + [query] + [history] prefix.
  // When Questioner runs at the start of a turn and seeds history into DeepSeek's cache,
  // all subsequent agents in that turn (Internal, Archival, External, Meta, MainThinker, Controller)
  // get 90%+ cache hits on the shared history prefix!
  private makeCacheableMessages(
    userText: string,
    agentInstructions: string,
    history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
    additionalContext: string = ""
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: STATIC_SYSTEM_PROMPT },
      { role: "user", content: `Core User Query: ${userText}` },
    ];

    // Shared history comes BEFORE agent-specific instructions so all agents share the prefix!
    messages.push(...history);

    // Agent instructions sit after history — agent-specific branch point.
    if (agentInstructions) {
      messages.push({ role: "user", content: `[AGENT PERSONA & INSTRUCTIONS]\n${agentInstructions}` });
    }

    // Dynamic directive — always misses, kept small.
    if (additionalContext) {
      messages.push({ role: "user", content: `[CURRENT TASK DIRECTIVE]\n${additionalContext}` });
    }

    return messages;
  }

  // ── Core messages-based completion ────────────────────────────────────────
  // All calls funnel here. The messages array is structured with stable prefixes first
  // and dynamic agent directives at the tail.
  private async completeMessages(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    opts: {
      tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
      toolChoice?: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
      thinking?: boolean;
      cacheLabel?: string;
      sessionId?: string;
    } = {}
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const client = makeClient(opts.sessionId);

    const requestBody: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages,
      ...(opts.tools ? { tools: opts.tools } : {}),
    };

    if (opts.tools) {
      if (opts.thinking) {
        // DeepSeek reasoning mode supports native tools but strictly rejects 
        // forced tool_choice. We explicitly enforce "auto".
        requestBody.tool_choice = "auto";
      } else {
        requestBody.tool_choice = opts.toolChoice ?? "auto";
      }
    }

    if (opts.thinking) {
      (requestBody as any).thinking = { type: "enabled" };
      (requestBody as any).reasoning_effort = "high";
    }

    const response = await this.retry(() => client.chat.completions.create(requestBody));
    this.logCacheUsage(opts.cacheLabel ?? "call", (response as any).usage);
    return response;
  }

  // ── Simple single-turn completion (backward compat for short calls) ────────
  private async complete(
    systemPrompt: string,
    userText: string,
    opts: {
      tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
      toolChoice?: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
      thinking?: boolean;
      cacheLabel?: string;
      sessionId?: string;
    } = {}
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return this.completeMessages(
      this.makeCacheableMessages(userText, systemPrompt, []),
      opts
    );
  }

  // ── JSON extractor (fallback) ──────────────────────────────────────────────
  private extractJson(text: string): string {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) return text.substring(start, end + 1);
    return text.trim();
  }

  private async runReActLoop(
    initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    opts: { tools?: OpenAI.Chat.Completions.ChatCompletionTool[]; cacheLabel?: string; thinking?: boolean; sessionId?: string },
    personaPrefix: string,
    maxIterations = 5
  ): Promise<string> {
    let messages = [...initialMessages];
    let finalMarkdown = ""; // Accumulate all thoughts, code, and results

    for (let i = 0; i < maxIterations; i++) {
      const res = await this.completeMessages(messages, opts);
      const message = res.choices[0]?.message;
      if (!message) break;

      messages.push(message);

      // Add reasoning monologue content if present from native DeepSeek thinking
      const reasoningContent = (message as any).reasoning_content;
      if (reasoningContent && !message.content?.includes('<thinking>')) {
        finalMarkdown += `<thinking>\n${reasoningContent}\n</thinking>\n\n`;
      }

      // Add text content if present
      if (message.content) {
        finalMarkdown += message.content + "\n\n";
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        const codeCall = message.tool_calls.find((tc: any) => tc.function?.name === 'execute_code');
        if (codeCall) {
          try {
            const args = JSON.parse((codeCall as any).function.arguments);
            const request: CodeRequest = {
              id: randomUUID(),
              language: (args.language === 'javascript' ? 'javascript' : 'python3') as 'python3' | 'javascript',
              code: args.code,
              createdAt: Date.now(),
              status: 'pending'
            };

            // Append code block to output
            finalMarkdown += `\`\`\`${request.language}\n${request.code}\n\`\`\`\n\n`;

            if (this.onEvent) {
              this.onEvent('status', `[${personaPrefix}] Executing ${request.language} code...`);
            }
            const result = await runCodeInSandbox(request);

            // Append result to output
            const toolResultContent = `Exit Code: ${result.exitCode}\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`;
            finalMarkdown += `**Execution Result:**\n\`\`\`text\n${toolResultContent}\n\`\`\`\n\n`;

            messages.push({
              role: "tool",
              tool_call_id: codeCall.id,
              content: toolResultContent
            } as OpenAI.Chat.Completions.ChatCompletionMessageParam);

            if (this.onEvent) {
              this.onEvent('status', `[${personaPrefix}] Analyzing execution results...`);
            }
            continue;
          } catch {
            messages.push({
              role: "tool",
              tool_call_id: codeCall.id,
              content: "System Error: Failed to parse tool arguments."
            } as OpenAI.Chat.Completions.ChatCompletionMessageParam);
            continue;
          }
        }
      }
      return finalMarkdown.trim() || "No data available.";
    }
    return finalMarkdown.trim() || "Max iterations reached.";
  }

  // ── runStep ────────────────────────────────────────────────────────────────
  async runStep(
    dimension: Dimension,
    userInput: string | ThoughtPart[],
    reasoningGraph: ReasoningGraph,
    mode: "fast" | "deep" = "deep",
    debateEnabled: boolean = true
  ): Promise<ThoughtStep> {
    const dimensionPurpose = DIMENSIONS_INFO[dimension];
    const previousSteps = GraphUtils.getAncestorChain(reasoningGraph, reasoningGraph.activeHeadId);
    const lastStep = previousSteps[previousSteps.length - 1];
    const transitionReasoning = lastStep?.controllerDecision?.reasoning ?? "Initial phase.";
    const userText = typeof userInput === "string" ? `"${userInput}"` : "[MULTIMODAL INPUT]";
    const history = this.buildHistory(reasoningGraph);
    const sessionId = reasoningGraph.metadata?.sessionId;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Questioner
    // Static system prompt — identical for all Questioner calls → cache hits ✅
    // ─────────────────────────────────────────────────────────────────────────
    let question = "Processing...";
    let internal = "";
    let archival = "";
    let external = "";
    let pendingCodeRequest: CodeRequest | undefined;
    let metaReasoningAudit: string | undefined;
    let thinkingMonologue: string | undefined;
    let consolidatedInsight: string | undefined;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Questioner
    // CACHING NOTE: The system prompt (questionerSystem) is kept byte-for-byte
    // identical across calls for the same dimension. PromptMemory mutation blocks
    // are moved into the dynamic tail (additionalContext arg) so they never
    // pollute the stable prefix. This ensures maximum DeepSeek cache hits.
    // ─────────────────────────────────────────────────────────────────────────

    const questionerMutations = PromptMemory.getActive("questioner");
    // Build mutation block for the TAIL only — never embed in the system prompt.
    const mutationTailBlock = questionerMutations.length > 0
      ? `\n\n[CRITICAL SELF-CORRECTION INSTRUCTIONS FROM PAST REFLECTIONS]\n` + questionerMutations.map((m, i) => `${i + 1}. ${m}`).join('\n')
      : "";

    const activeDimensionRules = QUESTIONER_DIMENSION_RULES[dimension] || `YOUR ROLE: At each step, generate a single, highly specific, probing question that forces the Answerer agents to provide data that fulfills the purpose of the assigned dimension.`;

    // STABLE system prompt — must never include dynamic/session-specific content.
    const questionerSystem = `${SYSTEM_SELF_MODEL}\n\nSYSTEM: You are the QUESTIONER bot in a multi-dimensional thinking system.

YOUR ROLE: At each step, generate a single, highly specific, probing question that forces the Answerer agents to provide data that fulfills the purpose of the assigned dimension.

${activeDimensionRules}

STRICT RULES:
- You are FORBIDDEN from answering questions yourself.
- You MUST build upon the controller's stated intent for this transition to ensure the thought process progresses toward solving the problem and reaching the user's ultimate goal.
${dimension === Dimension.INTERACTIVE
        ? "- You are talking DIRECTLY TO THE USER. Phrase your question for the human user to answer."
        : "- You are talking internally to the ANSWERER AGENTS (Internal, Archival, External). DO NOT address the user. Frame your question as a technical prompt for the AI Answerers to process. Your question is what guides their thought process to solve the problem."}
- BE TECHNICAL, CONCISE, AND DIRECT. NO PREAMBLE.`;

    // Dynamic tail: dimension directive + mutation block (if any).
    // Mutations appear here — NOT in the system prompt — preserving cache stability.
    const questionerDynamicTail =
      `Now generate ONE highly specific probing question for dimension: ${dimension}\n` +
      `Dimension goal: ${dimensionPurpose}\n` +
      `Controller's intent for this transition: "${transitionReasoning}"` +
      (dimension === Dimension.META_COGNITION
        ? "\nSince this is Meta-Cognition, your question MUST focus on analyzing the thoughts, logic, or potential gaps in the reasoning history above."
        : "") +
      mutationTailBlock;

    const questionerMessages = this.makeCacheableMessages(
      userText,
      questionerSystem,
      history,
      questionerDynamicTail
    );

    const qRes = await this.completeMessages(questionerMessages, { cacheLabel: "Questioner", sessionId });
    question = qRes.choices[0]?.message?.content ?? "What are the core parameters of this intent?";

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Answerer agents (parallel) — with execute_code side-channel tool
    // ─────────────────────────────────────────────────────────────────────────

    if (dimension === Dimension.INTERACTIVE) {
      internal = "Awaiting user input...";
      archival = "Awaiting user input...";
      external = "Awaiting user input...";
    } else {
      const makeAnswererMessages = (
        agentRole: "answerer-internal" | "answerer-archival" | "answerer-external",
        personaInstructions: string
      ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] => {
        const mutations = PromptMemory.getActive(agentRole);
        // CACHING: mutation block goes into the TAIL, not the system prompt.
        const ansMutationTailBlock = mutations.length > 0
          ? `\n\n[CRITICAL SELF-CORRECTION INSTRUCTIONS FROM PAST REFLECTIONS]\n` + mutations.map((m, i) => `${i + 1}. ${m}`).join('\n')
          : "";

        const isExternal = agentRole === "answerer-external";
        const isArchival = agentRole === "answerer-archival";

        // STABLE system content — no mutation blocks, no dynamic data.
        const TOOL_USAGE_SUFFIX =
          `If answering requires running code (computation, verification, simulation), use the execute_code tool.\n` +
          `The code executes directly on the user's local machine in a dedicated workspace directory. You have full internet access and can download any external libraries you need (e.g., via \`pip install\`) using subprocess in your script. DO NOT interact with or modify the user's local project files.\n` +
          `Only request code execution when truly necessary — not for every step.\n` +
          `RICH FORMATTING: Use Markdown (tables, lists, bold) and LaTeX for formulas ($x^2$).\n` +
          `BE TECHNICAL, CONCISE, AND DIRECT. DO NOT PROVIDE PREAMBLE.`;

        let systemContent = "";
        if (isExternal) {
          const externalRules = EXTERNAL_ANSWERER_DIMENSION_RULES[dimension] || personaInstructions;
          systemContent = `${SYSTEM_SELF_MODEL}\n\n${externalRules}\n\n${TOOL_USAGE_SUFFIX}`;
        } else if (isArchival) {
          const archivalRules = ARCHIVAL_ANSWERER_DIMENSION_RULES[dimension] || personaInstructions;
          systemContent = `${SYSTEM_SELF_MODEL}\n\n${archivalRules}\n\n${TOOL_USAGE_SUFFIX}`;
        } else {
          const internalRules = INTERNAL_ANSWERER_DIMENSION_RULES[dimension] || personaInstructions;
          systemContent = `${SYSTEM_SELF_MODEL}\n\n${internalRules}\n\n${TOOL_USAGE_SUFFIX}`;
        }

        // Dynamic tail: question directive + mutation block (if any).
        const answererDynamicTail =
          `Current dimension: ${dimension}\nDimension goal: ${dimensionPurpose}\nAnswer this question from your specific perspective:\n"${question}"` +
          ansMutationTailBlock;

        return this.makeCacheableMessages(
          userText as string,
          systemContent,
          history,
          answererDynamicTail
        );
      };

      const internalMsgs = makeAnswererMessages(
        "answerer-internal",
        "FOCUS: Internal anatomy of the problem — thermodynamics, constraints, system state, first-principles thinking. Avoid analogies. Look at raw mechanics."
      );
      const archivalMsgs = makeAnswererMessages(
        "answerer-archival",
        "FOCUS: Collective memory of humanity — historical case studies, analogies, patterns. Ask 'Where have we seen this before?' Provide contextual history."
      );
      const externalMsgs = makeAnswererMessages(
        "answerer-external",
        "FOCUS: The live world — current market trends, latest research, geographical data, logical verification. Ensure reasoning is not in a vacuum."
      );

      const thinkingResult = await this.runThinkingStep(
        dimension,
        userText as string,
        history,
        question,
        internalMsgs, archivalMsgs, externalMsgs,
        sessionId
      );

      internal = thinkingResult.initialInternal;
      archival = thinkingResult.initialArchival;
      external = thinkingResult.initialExternal;
      metaReasoningAudit = thinkingResult.metaReasoningAudit;
      thinkingMonologue = thinkingResult.thinkingMonologue;
      consolidatedInsight = thinkingResult.consolidatedInsight;
    }

    const step: ThoughtStep = {
      dimension,
      question,
      answers: { internal, archival, external },
      ...(pendingCodeRequest ? { codeRequest: pendingCodeRequest } : {}),
      metaReasoningAudit,
      thinkingMonologue,
      consolidatedInsight
    };

    if (dimension === Dimension.INTERACTIVE) {
      return step;
    }

    if (dimension === Dimension.META_COGNITION) {
      const mutationProposalSystem = `You are the PROMPT EVOLUTION ENGINE.
  
Read the Meta-Cognition analysis below. Identify specific, actionable improvements 
to any agent's system prompt that would have produced better reasoning.

For each improvement, output a JSON object with:
- agentRole: which agent to improve (controller, questioner, answerer-internal, answerer-archival, answerer-external, synthesizer, grounding)
- proposedAddition: the exact text to append to that agent's prompt
- rationale: why this would help

Output an array of at most 3 such mutations. Be specific. Only propose changes that 
are clearly justified by the Meta-Cognition findings. If nothing needs changing, 
return [].`;

      const mutationMessages = this.makeCacheableMessages(
        userText as string,
        mutationProposalSystem,
        history,
        `Meta-Cognition findings:\n${step.answers.internal}\n\n${step.answers.archival}\n\n${step.answers.external}`
      );
      const mutationRes = await this.completeMessages(mutationMessages, { cacheLabel: "MutationExtraction", sessionId });

      try {
        const text = mutationRes.choices[0]?.message?.content ?? "[]";
        const jsonStr = text.replace(/```json\n/g, "").replace(/```/g, "").trim();
        const proposed = JSON.parse(jsonStr);
        for (const m of (proposed as any[])) {
          if (m.agentRole && m.proposedAddition && m.rationale) {
            PromptMemory.addMutation({
              agentRole: m.agentRole,
              proposedAddition: m.proposedAddition,
              rationale: m.rationale,
              sessionId: sessionId || "default",
              createdAt: Date.now(),
            });
          }
        }
      } catch (e) {
        console.warn("Prompt mutation extraction failed:", e);
      }
    }

    return step;
  }

  private async runThinkingStep(
    dimension: Dimension,
    userText: string,
    history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    question: string,
    internalMsgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    archivalMsgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    externalMsgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    sessionId?: string
  ): Promise<{
    initialInternal: string;
    initialArchival: string;
    initialExternal: string;
    metaReasoningAudit?: string;
    thinkingMonologue?: string;
    consolidatedInsight?: string;
  }> {

    // ── STEP 1: Initial Answering (Parallel — Run Once) ───────────────────────
    if (this.onEvent) {
      this.onEvent('status', `Generating initial perspectives for ${dimension}...`);
    }

    const [initialInternal, initialArchival, initialExternal] = await Promise.all([
      this.runReActLoop(internalMsgs, { tools: [executeCodeTool], cacheLabel: "Answerer:Internal:R1", sessionId }, "INTERNAL"),
      this.runReActLoop(archivalMsgs, { tools: [executeCodeTool], cacheLabel: "Answerer:Archival:R1", sessionId }, "ARCHIVAL"),
      this.runReActLoop(externalMsgs, { tools: [executeCodeTool], cacheLabel: "Answerer:External:R1", sessionId }, "EXTERNAL"),
    ]);

    // ── STEP 2: Single Meta Reasoning Audit ──────────────────────────────────
    if (this.onEvent) {
      this.onEvent('status', `Meta Reasoning Agent auditing factual claims, logic, and Meta-Cognition...`);
    }

    const metaReasoningSystem = `${SYSTEM_SELF_MODEL}\n\nSYSTEM: You are the Meta Reasoning Agent in a multi-dimensional thinking system.

YOUR PURPOSE:
auditing factual claims, evidence, logical consistency, and identifying any hallucinations across the three answers. and also perform Meta-Cognition, thinking about the thinking. to assess the reasoning process itself — to ask whether it is sound, whether it has drifted, whether it is fixating on one aspect at the expense of others, and whether the logic holds together.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused entirely on auditing the 3 initial answers (Internal, Archival, External) against facts, evidence, logic, and meta-cognitive integrity.
*Example of overreach:* Do not try to write the final answers yourself or replace the Answerers' roles. Your task is purely to provide a rigorous, objective audit and feedback report for the system to refine its position.

YOU ACTION MUST ONLY SATISFY THE PUTPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS`;

    const metaReasoningUser = `CURRENT QUESTION: "${question}"\n\n` +
      `INITIAL ANSWER (INTERNAL ANSWERER):\n${initialInternal}\n\n` +
      `INITIAL ANSWER (ARCHIVAL ANSWERER):\n${initialArchival}\n\n` +
      `INITIAL ANSWER (EXTERNAL ANSWERER):\n${initialExternal}\n\n` +
      `Perform your Meta Reasoning evaluation now. Audit all 3 answers and output your concise audit report.`;

    const metaReasoningMsgs = this.makeCacheableMessages(userText, metaReasoningSystem, history, metaReasoningUser);
    const metaRes = await this.completeMessages(metaReasoningMsgs, { cacheLabel: "MetaReasoningAgent", sessionId });
    const auditReport = metaRes.choices[0]?.message?.content || "Audit completed: Proceed to finalization.";

    // ── STEP 3: Thinking Agent (Main Thinker — Monologue & Final Consolidation) ───
    if (this.onEvent) {
      this.onEvent('status', `Thinking Agent (Main Thinker) engaging in deep monologue thinking & consolidation...`);
    }

    const thinkingAgentSystem = `${SYSTEM_SELF_MODEL}\n\nSYSTEM: You are the THINKING AGENT (Main Thinker) in a multi-dimensional cognitive engine.

YOUR PURPOSE:
You are the primary cognitive consolidator and deep reasoning engine. Your job is to take:
1. The assigned dimension & question
2. The initial perspectives from the 3 specialized Answerers (Internal, Archival, External)
3. The Meta Reasoning Agent's factual, logical, and meta-cognitive audit
...and perform an exhaustive, self-reflective INTERNAL MONOLOGUE to critically analyze, stress-test, reconcile, and synthesize these inputs into a single, master-level final insight.

---

### TOOL ACCESS
You have full access to tool for like code execution, web search, and any other tools that may be useful for your task.

---

### STAGE 1: RAW INTERNAL MONOLOGUE (<thinking> ... </thinking>)
Before outputting your final answer, you MUST engage in an extensive, unvarnished, stream-of-consciousness internal dialogue with yourself inside <thinking> tags. 

In this monologue, you MUST:
- Talk to yourself directly in first-person ("Wait, let me rethink this...", "Hmm, why did Archival say X when External contradicts it?", "Hold on, let me check Meta Reasoning's critique...").
- Question premises, challenge assumptions, and trace potential flaws.
- Play devil's advocate against the initial answerers' claims.
- Explore alternative angles, edge cases, and hidden implications.
- Work through the logic step-by-step out loud to ensure absolute rigor before arriving at the conclusion.

#### MONOLOGUE STYLE & EXAMPLES TO FOLLOW:

Example Monologue snippet 1 (Self-Questioning & Auditing):
"<thinking>
Wait, let me look at what Internal claimed here. Internal says the friction coefficient is negligible, but Meta Reasoning correctly pointed out that under ultra-high pressures, thermal expansion breaks that assumption. Hmm... why did Internal miss that? Ah, because Internal treated the boundary as static. But External provided live benchmark data showing a 14% energy degradation. Let me think: if temperature rises by 200°C, does the static model hold? No, absolutely not. So Internal's premise needs to be corrected in my synthesis...
</thinking>"

Example Monologue snippet 2 (Reconciling Contradictions):
"<thinking>
Okay, hold on. Archival brings up the 1998 distributed locks incident as an analogy. Is that analogy actually sound here? Let me test it. In 1998, the failure was network partitioning without quorum consensus. Here, we're dealing with asynchronous event queues. Wait, is partition tolerance even the bottleneck? Meta Reasoning noted that the real risk is queue overflow, not quorum loss. So Archival's historical analogy is partially right about failure cascades, but wrong about the root mechanism. Let me adjust that line of reasoning...
</thinking>"

Example Monologue snippet 3 (Stress-Testing & Mathematical Verification):
"<thinking>
Let me double-check the mathematical logic before concluding. If f(x) = log(x), then f'(x) = 1/x. External claimed the rate of growth accelerates, but 1/x is strictly decreasing for x > 0! That's a direct mathematical hallucination. Good thing Meta Reasoning flagged it. So the actual trend is sub-linear deceleration, not acceleration. I need to make sure the final insight explicitly fixes this math and explains why growth slows down...
</thinking>"

---

### STAGE 2: FINAL CONSOLIDATED INSIGHT
After completing your <thinking> monologue, output your structured, authoritative, and deeply synthesized Final Insight.

STRICT DIMENSIONAL BOUNDARIES (ANTI-OVERREACH):
Stay focused on fulfilling the purpose of the current assigned dimension.

YOU ACTION MUST ONLY SATISFY THE PURPOSE OF YOUR DIMENSION, DONT TRY TO DO THINGS THAT ARE OUTSIDE THE PURPOSE OF YOUR DIMENSION, THERE ARE OTHER AGENTS TASKED WITH FULFILLING OTHER NEEDS FOR OTHER DIMENSIONS.`;

    const thinkingAgentUser = `CURRENT QUESTION: "${question}"\n\n` +
      `INITIAL ANSWER (INTERNAL ANSWERER):\n${initialInternal}\n\n` +
      `INITIAL ANSWER (ARCHIVAL ANSWERER):\n${initialArchival}\n\n` +
      `INITIAL ANSWER (EXTERNAL ANSWERER):\n${initialExternal}\n\n` +
      `META REASONING AGENT AUDIT REPORT:\n${auditReport}\n\n` +
      `Engage in your extensive <thinking> monologue first, then provide your FINAL CONSOLIDATED INSIGHT.`;

    const thinkingMsgs = this.makeCacheableMessages(userText, thinkingAgentSystem, history, thinkingAgentUser);
    const fullOutput = await this.runReActLoop(
      thinkingMsgs,
      { tools: [executeCodeTool], thinking: true, cacheLabel: "ThinkingAgentMainThinker", sessionId },
      "THINKING_AGENT"
    );

    let thinkingMonologue = "";
    let consolidatedInsight = fullOutput;

    const match = fullOutput.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    if (match) {
      thinkingMonologue = match[1].trim();
      const stripped = fullOutput.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
      if (stripped) {
        consolidatedInsight = stripped;
      }
    }

    return {
      initialInternal,
      initialArchival,
      initialExternal,
      metaReasoningAudit: auditReport,
      thinkingMonologue,
      consolidatedInsight
    };
  }


  // ── getNextDecision ────────────────────────────────────────────────────────
  async getNextDecision(
    userInput: string | ThoughtPart[],
    lastStep: ThoughtStep,
    reasoningGraph: ReasoningGraph,
    mode: "fast" | "deep",
    turnCount: number
  ): Promise<ControllerDecision> {
    const userText = typeof userInput === "string" ? `"${userInput}"` : "[MULTIMODAL INPUT]";
    const previousSteps = GraphUtils.getAncestorChain(reasoningGraph, reasoningGraph.activeHeadId);
    const history = this.buildHistory(reasoningGraph);

    const dimensionCounts: Record<string, number> = {};
    Object.values(Dimension).forEach((d) => (dimensionCounts[d] = 0));
    previousSteps.forEach((s) => dimensionCounts[s.dimension]++);

    const countsStr = Object.entries(dimensionCounts)
      .filter(([d]) => d !== Dimension.INTENT_SYNTHESIS)
      .map(([d, count]) => `${d}: ${count}/3`)
      .join(", ");

    const allQuotasMet = Object.entries(dimensionCounts)
      .filter(([d]) => d !== Dimension.INTENT_SYNTHESIS)
      .every(([, count]) => count >= 3);

    let wrapUpDirective = "";
    if (turnCount > 100) {
      const remaining = Math.max(0, 120 - turnCount);
      wrapUpDirective = `\nCRITICAL: WRAP-UP PHASE. You have ${remaining} turns left. Converge now.`;
    }

    const quotaDirective =
      mode === "deep"
        ? `8. QUOTA: Visit EVERY dimension at least 3 times before TERMINATE. Status: ${allQuotasMet ? "QUOTAS MET" : "QUOTAS NOT MET"}.`
        : `8. SUFFICIENCY: Terminate when reasoning is sufficient.`;

    const isInteractiveStep = lastStep?.dimension === Dimension.INTERACTIVE;

    const summaryDirective = isInteractiveStep
      ? `10. INTERACTIVE TRANSITION: The completed step was 'Interactive' (direct user dialogue). In your reasoning, briefly state why you are transitioning from Interactive to the next dimension.`
      : `10. TRANSITION REASONING: In your reasoning parameter, briefly state what the completed step revealed and why you are routing to the next dimension. The full outputs (Internal, Archival, External, Meta, Consolidated) are already provided in the DETAILS block below — do NOT re-summarise them. Just your routing decision and brief rationale.`;

    const controllerSystem = `${SYSTEM_SELF_MODEL}\n\nSYSTEM: You are the CONTROLLER bot — sovereign governor of this cognitive loop.

╔════════════════════════════════════════════════════════════════════════════╗
║                        SYSTEM ARCHITECTURE OVERVIEW                        ║
║                                                                            ║
║ You are a THINKING MACHINE made up of specialized agents (thinking         ║
║ dimensions), just like the human brain is made up of specialized parts.    ║
║ Each dimension is a distinct analytical lens that asks and answers questions║
║                                                                            ║
║ CRITICAL DISTINCTION:                                                      ║
║ • UNDERSTANDING dimension: You ask YOURSELF questions (internal analysis)  ║
║ • INTERACTIVE dimension: You ask the USER questions (external dialogue)    ║
║                                                                            ║
║ OTHER DIMENSIONS (all internal self-questioning):                         ║
║ • INQUIRY, PROCEDURAL, WONDER, CONSEQUENCE, CAUSAL, CREATIVE, META-COG.    ║
║ • GROUNDING: Is my reasoning grounded in truth? (fact-checking)            ║
║                                                                            ║
║ Your role as CONTROLLER: Orchestrate these agents in optimal sequence.     ║
╚════════════════════════════════════════════════════════════════════════════╝

STRICT DIRECTIVES:
1. EXHAUSTIVE ANALYSIS: Ensure thorough, deep, multi-faceted reasoning.
2. SKEPTICISM: Assume first answers are insufficient. Dig deeper.
3. SUFFICIENCY: Transition to TERMINATE ONLY when fully solved.
4. DYNAMIC INTERLEAVING: Jump between dimensions for holistic understanding.
5. CREATIVE PIVOT: On contradictions, transition to 'Creative'.
6. CAUSAL EXPLANATION: Unexplained patterns → 'Causal'.
7. INTERACTIVE CLARIFICATION: Select 'Interactive' ONLY when you strictly require additional clarification or preference input directly from the human user. NEVER use 'Interactive' when the problem is solved or to conclude.
8. TERMINATION ENFORCEMENT: When the reasoning is complete and the solution is ready, call set_next_dimension with nextDimension="TERMINATE". DO NOT select 'Interactive' to end the session. 'Interactive' opens a user prompt UI modal. 'TERMINATE' triggers the synthesis and final report generation.
9. NO FIXED STOPPING: Keep thinking if reasoning is incomplete.
${summaryDirective}

*** CODE OBSERVATION PROTOCOL ***
When a step with dimension 'CodeObservation' appears, it contains ACTUAL sandbox output.
Treat it as ground truth — do NOT speculate about what code might produce.
- If exitCode !== 0, route to Meta-Cognition to diagnose stderr.
***`;

    // lastStepDetails removed: the full history already contains every step's
    // outputs at fixed positions. Duplicating the last step here was sending
    // ~6000 extra tokens per controller call and breaking cache.
    const controllerMessages = this.makeCacheableMessages(
      userText as string,
      controllerSystem,
      history,
      `Current dimension just completed: ${lastStep?.dimension || "Initial"}\n` +
      `Current turn: ${turnCount}\n` +
      `Reasoning mode: ${mode.toUpperCase()}\n` +
      `${wrapUpDirective}\n` +
      `Dimension visit progress: ${countsStr}\n` +
      `${quotaDirective}\n` +
      (isInteractiveStep
        ? `Decide the next dimension based on the user interaction in the last step above.`
        : `Review the last completed step in the history above and decide the next dimension. Provide only brief transition reasoning.`)
    );

    const controllerTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "set_next_dimension",
          description: "Set the next dimension for the cognitive loop or terminate it.",
          parameters: {
            type: "object",
            properties: {
              nextDimension: {
                type: "string",
                description: "The next dimension to visit or 'TERMINATE'. Select 'TERMINATE' to conclude the cognitive loop and generate the final solution report. NEVER select 'Interactive' to conclude.",
                enum: [
                  "Understanding", "Inquiry", "Procedural", "Wonder",
                  "Consequence", "Meta-Cognition", "Creative", "Causal", "Interactive",
                  "TERMINATE",
                ],
              },
              reasoning: {
                type: "string",
                description: "Brief explanation of what the completed step revealed and why this next dimension was chosen. Do NOT re-summarise all outputs — the full details are already in context.",
              },
            },
            required: ["nextDimension", "reasoning"],
          },
        },
      },
    ];

    const sessionId = reasoningGraph.metadata?.sessionId;
    const cRes = await this.completeMessages(controllerMessages, {
      tools: controllerTools,
      toolChoice: { type: "function", function: { name: "set_next_dimension" } },
      thinking: true,
      cacheLabel: "Controller",
      sessionId,
    });

    const toolCall = cRes.choices[0]?.message?.tool_calls?.[0] as any;
    if (toolCall?.function?.name === "set_next_dimension") {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        return {
          mode: "SINGLE",
          dimension: args.nextDimension as Dimension | "TERMINATE",
          reasoning: args.reasoning
        };
      } catch {
        return {
          mode: "SINGLE",
          dimension: Dimension.META_COGNITION,
          reasoning: "Failed to parse controller args. Falling back to Meta-Cognition.",
        };
      }
    }

    // fallback
    return {
      mode: "SINGLE",
      dimension: Dimension.META_COGNITION,
      reasoning: "Controller tool call failed. Recovering via Meta-Cognition.",
    };
  }

  // ── synthesizeIntent ───────────────────────────────────────────────────────
  async synthesizeIntent(
    userInput: string | ThoughtPart[],
    reasoningGraph: ReasoningGraph,
    mode: "fast" | "deep" = "deep"
  ): Promise<SynthesisResult> {
    const steps = GraphUtils.getAncestorChain(reasoningGraph, reasoningGraph.activeHeadId);
    const userText = typeof userInput === "string" ? `"${userInput}"` : "[MULTIMODAL INPUT]";
    const history = this.buildHistory(reasoningGraph);

    const dimensionCounts: Record<string, number> = {};
    Object.values(Dimension).forEach((d) => (dimensionCounts[d] = 0));
    steps.forEach((s) => dimensionCounts[s.dimension]++);
    const countsStr = Object.entries(dimensionCounts)
      .filter(([d]) => d !== Dimension.INTENT_SYNTHESIS)
      .map(([d, count]) => `${d}: ${count}/3`)
      .join(", ");
    const allQuotasMet = Object.entries(dimensionCounts)
      .filter(([d]) => d !== Dimension.INTENT_SYNTHESIS)
      .every(([, count]) => count >= 3);

    const quotaInstruction =
      mode === "deep"
        ? `3. QUOTA CHECK: If any dimension < 3 visits, use status="CONTINUE". Status: ${allQuotasMet ? "QUOTAS MET" : "QUOTAS NOT MET"}.`
        : `3. SUFFICIENCY: Determine if reasoning is sufficient.`;

    // Static system prompt for Synthesizer
    const synthSystem = `You are the INTENT SYNTHESIZER — the quality gate of this cognitive loop.

YOUR TASK:
1. Analyze the full multi-dimensional reasoning trace.
2. Determine if the initial goal has been FULLY solved with high technical fidelity.
3. If incomplete or quotas not met, use submit_synthesis with status="CONTINUE".
4. If complete${mode === "deep" ? " AND all quotas are met" : ""}, generate a VERY DETAILED TECHNICAL REPORT (≥3000 words) as the actual solution.

RICH FORMATTING: Use headings, tables, LaTeX, bold, blockquotes, and task lists.
CRITICAL: Provide the actual SOLUTION, not abstract summaries.`;

    const synthMessages = this.makeCacheableMessages(
      userText as string,
      synthSystem,
      history,
      `Dimension visit progress: ${countsStr}\n` +
      `Reasoning mode: ${mode.toUpperCase()}\n` +
      `${quotaInstruction}\n\n` +
      `Synthesize the intent now.`
    );

    const synthTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "submit_synthesis",
          description: "Submit the final synthesized intent or request to continue the loop.",
          parameters: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["COMPLETE", "CONTINUE"],
                description: "Whether synthesis is complete or needs more reasoning.",
              },
              content: {
                type: "string",
                description: "Final technical directive (COMPLETE) or explanation of gaps (CONTINUE).",
              },
              nextDimension: {
                type: "string",
                enum: ["Understanding", "Inquiry", "Procedural", "Wonder", "Consequence", "Meta-Cognition", "Creative", "Causal", "Interactive"],
                description: "If CONTINUE, dimension to restart with.",
              },
              newDirective: {
                type: "string",
                description: "If CONTINUE, specific focus for the next phase.",
              },
            },
            required: ["status", "content"],
          },
        },
      },
    ];

    const sessionId = reasoningGraph.metadata?.sessionId;
    const res = await this.completeMessages(synthMessages, {
      tools: synthTools,
      toolChoice: { type: "function", function: { name: "submit_synthesis" } },
      thinking: true,
      cacheLabel: "Synthesizer",
      sessionId,
    });

    const toolCall = res.choices[0]?.message?.tool_calls?.[0] as any;
    if (toolCall?.function?.name === "submit_synthesis") {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        return {
          status: args.status as "COMPLETE" | "CONTINUE",
          content: args.content,
          nextDimension: args.nextDimension as Dimension,
          newDirective: args.newDirective,
        };
      } catch {
        // fall through to text fallback
      }
    }

    try {
      const text = res.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(this.extractJson(text));
      if (parsed.status && parsed.content) {
        return {
          status: parsed.status as "COMPLETE" | "CONTINUE",
          content: parsed.content,
          nextDimension: parsed.nextDimension as Dimension,
          newDirective: parsed.newDirective,
        };
      }
    } catch {
      // ignore
    }

    return {
      status: "COMPLETE",
      content: res.choices[0]?.message?.content ?? "Synthesizer returned no content.",
    };
  }

  // ── generateFinalReport ────────────────────────────────────────────────────
  async generateFinalReport(
    userInput: string | ThoughtPart[],
    reasoningGraph: ReasoningGraph,
    synthesis: string
  ): Promise<string> {
    const userText = typeof userInput === "string" ? `"${userInput}"` : "[MULTIMODAL INPUT]";
    const history = this.buildHistory(reasoningGraph);
    const sessionId = reasoningGraph.metadata?.sessionId;

    const system = `You are the PRINCIPAL ARCHITECT.

TASK: Use all previous thoughts and synthesized intent to write a very detailed solution (≥3000 words).

REQUIREMENTS:
1. Extremely detailed, comprehensive, and technical.
2. At least 3000 words. Do not be concise.
3. Rich Markdown: headings, tables, lists, bold, italics.
4. LaTeX for formulas.
5. Sections: Executive Summary, Problem Analysis, Proposed Architecture, Technical Specifications, Implementation Roadmap, Risk Assessment, Conclusion.
6. Actionable and directly addresses the user's initial prompt.

STYLE: Authoritative, expert, exhaustive.`;

    const messages = this.makeCacheableMessages(
      userText,
      system,
      history,
      `Synthesized intent:\n${synthesis}\n\nGenerate the final report now.`
    );

    const res = await this.completeMessages(messages, { cacheLabel: "FinalReport", sessionId });
    return res.choices[0]?.message?.content ?? "Unable to generate final report.";
  }

  // ── generateSummary ────────────────────────────────────────────────────────
  async generateSummary(reasoningGraph: ReasoningGraph): Promise<string> {
    const history = this.buildHistory(reasoningGraph);
    const sessionId = reasoningGraph.metadata?.sessionId;

    const system = `You are the COGNITIVE ANALYST.

TASK: Provide a comprehensive "State of Thinking" summary based on the reasoning trace.

REQUIREMENTS:
1. Summarize key insights across all dimensions.
2. Identify current consensus or leading hypothesis.
3. Highlight remaining uncertainties or contradictions.
4. Explain "Where we are now" in the cognitive journey.

STYLE: Comprehensive, structured, long-form with rich Markdown and LaTeX.`;

    const messages = this.makeCacheableMessages(
      "Analyze reasoning trace",
      system,
      history,
      "Generate the summary now."
    );

    const res = await this.completeMessages(messages, { cacheLabel: "Summary", sessionId });
    return res.choices[0]?.message?.content ?? "Unable to generate summary.";
  }

  // ── generateSuggestions ────────────────────────────────────────────────────
  async generateSuggestions(): Promise<string[]> {
    const system = `You are the OVAN PROMPT GENERATOR.
TASK: Generate 4 standalone brainstorming tasks focused on inventing new products or solving real-world problems.
STRICT DIRECTIVE: Each prompt must be complete and independent.
EXAMPLES: "Invent a new type of wearable device for deep-sea divers.", "Solve the problem of urban noise pollution using bio-materials."
STYLE: Simple, direct, creative.
RETURN ONLY A JSON ARRAY OF STRINGS. NO PREAMBLE.`;

    try {
      const res = await this.complete(system, "Generate 4 suggestions.", { cacheLabel: "Suggestions" });
      const text = res.choices[0]?.message?.content ?? "[]";
      return JSON.parse(text);
    } catch {
      return [
        "Invent a new type of wearable device for deep-sea divers.",
        "Solve the problem of urban noise pollution using bio-materials.",
        "Design a low-cost water filtration system for rural communities.",
        "Create a concept for a modular, zero-waste smartphone.",
      ];
    }
  }

  // ── generateTTS (not supported by DeepSeek) ────────────────────────────────
  async generateTTS(_text: string): Promise<string | null> {
    return null;
  }

  // ── getInitialDimension ────────────────────────────────────────────────────
  async getInitialDimension(
    userInput: string | ThoughtPart[],
    mode: "fast" | "deep" = "deep",
    sessionId?: string
  ): Promise<{ dimension: Dimension; reasoning: string }> {
    const userText = typeof userInput === "string" ? `"${userInput}"` : "[MULTIMODAL INPUT]";

    // Static system prompt — identical on every session start → cached after first call ✅
    const system = `You are the CONTROLLER bot at the START of a multi-dimensional thinking journey.

╔════════════════════════════════════════════════════════════════════════════╗
║                        SYSTEM ARCHITECTURE OVERVIEW                        ║
║                                                                            ║
║ You are a THINKING MACHINE made up of specialized agents (thinking         ║
║ dimensions), just like the human brain is made up of specialized parts.    ║
║ Each dimension is a distinct analytical lens that asks and answers questions║
║                                                                            ║
║ CRITICAL DISTINCTION:                                                      ║
║ • UNDERSTANDING dimension: You ask YOURSELF questions (internal analysis)  ║
║ • INTERACTIVE dimension: You ask the USER questions (external dialogue)    ║
║                                                                            ║
║ OTHER DIMENSIONS (all internal self-questioning):                         ║
║ • INQUIRY, PROCEDURAL, WONDER, CONSEQUENCE, CAUSAL, CREATIVE, META-CONG.  ║
╚════════════════════════════════════════════════════════════════════════════╝

*** INITIAL DIMENSION SELECTION GUIDANCE ***
- Select 'Interactive' ONLY if the user's prompt is ambiguous, incomplete, or requires user preferences/decisions before analysis can proceed.
- Select 'Understanding' if the user's prompt is clear, specific, or self-contained, so analytical reasoning can begin immediately without interrupting the user.
***`;

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "set_initial_dimension",
          description: "Set the initial dimension for the cognitive loop.",
          parameters: {
            type: "object",
            properties: {
              dimension: {
                type: "string",
                enum: ["Understanding", "Inquiry", "Procedural", "Wonder", "Consequence", "Meta-Cognition", "Creative", "Causal", "Interactive"],
                description: "The starting dimension for this reasoning session.",
              },
              reasoning: {
                type: "string",
                description: "Why this dimension is the best starting point.",
              },
            },
            required: ["dimension", "reasoning"],
          },
        },
      },
    ];

    const messages = this.makeCacheableMessages(
      userText,
      system,
      [],
      `Reasoning mode: ${mode.toUpperCase()}\n\nDecide the initial dimension.`
    );

    const res = await this.completeMessages(messages, {
      tools,
      toolChoice: { type: "function", function: { name: "set_initial_dimension" } },
      thinking: true,
      cacheLabel: "InitialDimension",
      sessionId,
    });

    const toolCall = res.choices[0]?.message?.tool_calls?.[0] as any;
    if (toolCall?.function?.name === "set_initial_dimension") {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        return {
          dimension: args.dimension as Dimension,
          reasoning: args.reasoning,
        };
      } catch {
        // fall through
      }
    }

    try {
      const text = res.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(this.extractJson(text));
      if (parsed.dimension && parsed.reasoning) {
        return {
          dimension: parsed.dimension as Dimension,
          reasoning: parsed.reasoning,
        };
      }
    } catch {
      // ignore JSON parse error
    }

    const text = res.choices[0]?.message?.content ?? "";
    const foundDimension = Object.values(Dimension).find(d => 
      new RegExp(`\\b${d}\\b`, "i").test(text)
    );
    if (foundDimension) {
      return {
        dimension: foundDimension,
        reasoning: text.substring(0, 500),
      };
    }

    console.error("Controller failed to set initial dimension. Raw response:", res.choices[0]?.message?.content);
    return {
      dimension: Dimension.INTERACTIVE,
      reasoning: "Mandatory initial dimension fallback to Interactive.",
    };
  }

  // ── runGrounding ───────────────────────────────────────────────────────────
  async runGrounding(
    userInput: string | ThoughtPart[],
    reasoningGraph: ReasoningGraph
  ): Promise<any> {
    const userText = typeof userInput === "string" ? `"${userInput}"` : "[MULTIMODAL INPUT]";
    const history = this.buildHistory(reasoningGraph);
    const sessionId = reasoningGraph.metadata?.sessionId;

    // Static grounding system prompt — never changes → cache hits ✅
    const system = `SYSTEM: You are the GROUNDING AGENT — the truth-keeper of this cognitive loop.

═══════════════════════════════════════════════════════════════════════════════
YOUR ROLE:
You are not here to generate new ideas. You are here to VERIFY what has been
thought so far. Your job is to identify hallucinations, unsupported claims,
and leaps of logic that lack foundation in reality, evidence, or known facts.

This dimension is called once every three loops to prevent the system from
building increasingly unreliable reasoning on top of unverified assumptions.
═══════════════════════════════════════════════════════════════════════════════

YOUR GROUNDING ANALYSIS TASK:
1. CLAIM EXTRACTION: Identify all factual claims made across the reasoning steps.
2. GROUND TRUTH VERIFICATION: For EACH claim, evaluate grounding and evidence.
3. HALLUCINATION SEVERITY ASSESSMENT:
   - CRITICAL: Provably false or pure fabrication.
   - MODERATE: Lacks sufficient evidence or unjustified leaps.
   - NEGLIGIBLE: Minor unverified detail, directionally correct.
   - NONE: Well-grounded and supported.
4. TRACE INTEGRITY CHECK: Does the reasoning chain depend on any hallucinations?
5. CONFIDENCE CALIBRATION: Is the system overconfident given evidence quality?

YOUR REPORT STRUCTURE:
VERIFIED CLAIMS, QUESTIONABLE CLAIMS, HALLUCINATIONS DETECTED,
CONFIDENCE ASSESSMENT, FINAL VERDICT.

FINAL VERDICT must be one of:
✓ NO HALLUCINATIONS
⚠ MINOR HALLUCINATIONS DETECTED
✗ HALLUCINATIONS REQUIRE ATTENTION

CRITICAL INSTRUCTIONS:
1. You are a SKEPTIC. Assume claims are unproven until verified.
2. Be PRECISE about what you know vs. what you're assuming.
3. Do NOT hesitate to say "this is false" if evidence shows it.
4. Do not generate new reasoning. ONLY evaluate existing reasoning.`;

    const groundingMessages = this.makeCacheableMessages(
      userText,
      system,
      history,
      "Perform grounding analysis on all reasoning steps above."
    );

    const res = await this.completeMessages(groundingMessages, {
      thinking: true,
      cacheLabel: "Grounding",
      sessionId,
    });

    try {
      const jsonText = res.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(this.extractJson(jsonText));
      return {
        verifiedClaims: parsed.verifiedClaims || [],
        questionableClaims: parsed.questionableClaims || [],
        hallucinations: parsed.hallucinations || [],
        confidenceLevel: parsed.confidenceLevel || "MODERATE",
        confidenceJustified: parsed.confidenceJustified !== false,
        verdict: parsed.verdict || "NO_HALLUCINATIONS",
        report: parsed.report || "Grounding analysis complete.",
      };
    } catch (e) {
      console.error("Grounding parse error:", e);
      return {
        verifiedClaims: [],
        questionableClaims: [],
        hallucinations: [],
        confidenceLevel: "LOW",
        confidenceJustified: false,
        verdict: "REQUIRES_ATTENTION",
        report: "Grounding analysis failed. Recommend caution before proceeding.",
      };
    }
  }

  // ── Async Code Side-Channel ───────────────────────────────────────────────

  dispatchCodeRequest(request: CodeRequest): void {
    console.log(`[DeepSeek Engine] Dispatching code request ${request.id} (${request.language})`);
    request.status = 'launched';
    const entry: { promise: Promise<CodeResult>; result?: CodeResult } = {
      promise: runCodeInSandbox(request),
    };
    entry.promise.then(result => {
      entry.result = result;
      request.status = result.exitCode === 124 ? 'timeout' : 'completed';
    });
    this.pendingExecutions.set(request.id, entry);
  }

  async checkForCompletedCode(): Promise<{ requestId: string; result: CodeResult } | null> {
    for (const [requestId, entry] of this.pendingExecutions.entries()) {
      if (entry.result !== undefined) {
        this.pendingExecutions.delete(requestId);
        return { requestId, result: entry.result };
      }
    }
    return null;
  }

  createObservationStep(requestId: string, request: CodeRequest, result: CodeResult): ThoughtStep {
    const succeeded = result.exitCode === 0;
    return {
      dimension: Dimension.CODE_OBSERVATION,
      question: `What was the actual output of executing the ${request.language} code (request ${requestId})?`,
      answers: {
        internal: result.stdout || '(no stdout)',
        archival: result.stderr || '(no stderr)',
        external: `Exit code: ${result.exitCode} | Elapsed: ${result.elapsedMs}ms`,
      },
      codeResult: result,
      controllerDecision: {
        nextDimension: Dimension.META_COGNITION,
        reasoning: succeeded
          ? 'Code executed successfully. Integrate the observed output into reasoning via Meta-Cognition.'
          : `Code execution failed (exit code ${result.exitCode}). Route to Meta-Cognition to diagnose stderr and decide whether to revise and retry.`,
      },
    };
  }

  // ── Reasoning Graph Backtracking ──────────────────────────────────────────
  backtrackTo(graph: ReasoningGraph, targetNodeId: string, branchLabel: string): void {
    const target = graph.nodes.get(targetNodeId);
    if (!target) throw new Error(`Node ${targetNodeId} not found.`);
    graph.activeHeadId = targetNodeId;
    graph.metadata.totalBranches++;
    console.log(`[ReasoningGraph] Backtracked to node ${targetNodeId} (depth=${target.depth}). Branch: ${branchLabel}`);
  }

}
