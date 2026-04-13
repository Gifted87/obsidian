# Obsidian Thinking Machine: User & Architectural Guide

## Overview
**Obsidian Thinking Machine** (Prestige Cognitive Layer v2.0) is a sophisticated multi-agent reasoning application designed to solve complex technical problems through iterative, multi-dimensional contemplation. It leverages the Google Gemini API (specifically `gemini-flash-latest` and `gemini-2.5-flash-preview-tts`) to simulate a deep cognitive process.

---

## Technical Stack
- **Frontend**: React 19, Vite, TypeScript.
- **Styling**: Tailwind CSS 4.0, Lucide React (Icons).
- **Animation**: Motion (formerly Framer Motion).
- **Data Visualization**: D3.js (used for neural pulse/visuals).
- **AI Integration**: `@google/genai` (Google Generative AI SDK).
- **Markdown Rendering**: `react-markdown` with `remark-gfm`, `rehype-katex`, and `remark-math`.

---

## How to Use the Application

### 1. Initializing a Query
- **Stimulus Input**: Type your complex technical query or problem into the main text area.
- **Inspiration**: Click the ✨ (**Sparkles**) icon to generate creative brainstorming prompts.
- **File Upload**: Use the 📤 (**Upload**) icon to attach images or documents for multimodal analysis.

### 2. Selecting Reasoning Mode
Upon clicking **"Initiate Loop"**, you must choose a cognitive depth:
- **Fast Mode**: Optimized for speed. Provides immediate synthesis once the controller deems the reasoning sufficient.
- **Deep Mode**: High-rigor mode. Forces the engine to visit **every cognitive dimension at least 3 times** before finalizing, ensuring exhaustive analysis.

### 3. Monitoring the Thinking Process
As the engine runs, you can track its progress in real-time:
- **Cognitive Evolution Monitor**: A vertical timeline showing each "Iteration" and the dimension currently active.
- **Dimension Registry**: A checklist showing which "Dimensions" (e.g., Understanding, Causal, Meta-Cognition) have been explored and how many times.
- **Neural Pulse**: The animated brain icon pulses and glows based on system activity and integrity.

### 4. Analyzing the Thought Trace
The **Cognitive Chronicle** (right column) provides a transparent look into the AI's "internal monologue":
- **Internal Synthesis**: System-state and logical deductions.
- **Archival Memory**: Patterns and biographical context.
- **External Context**: General knowledge and web-grounded data.
- **Controller Directive**: Why the system decided to move to the next specific dimension.

### 5. Final Output & Export
Once the loop terminates:
- **Intent Realized**: A comprehensive, high-fidelity technical report is generated.
- **Audio Briefing**: If available, you can listen to a synthesized voice summary using the 🔊 icon.
- **Exporting**: 
    - **Copy All**: Copies the entire reasoning trace and final report to your clipboard.
    - **Download .md**: Downloads a full Markdown version of the Architect's Report.

---

## The 9 Cognitive Dimensions
1. **Understanding**: Establishing semantic ground truth and intent.
2. **Inquiry**: Root cause analysis and foundational questioning.
3. **Procedural**: Formulating methodology and implementation plans.
4. **Wonder**: Modeling "What-if" scenarios and counterfactuals.
5. **Consequence**: Analyzing downstream effects and impact.
6. **Meta-Cognition**: Reflecting on the reasoning process itself to identify gaps.
7. **Creative**: Finding lateral solutions to contradictions or dead-ends.
8. **Causal**: Explaining the fundamental "why" behind patterns.
9. **Intent Synthesis**: Distilling all thoughts into the final actionable solution.

---

## System Resilience
The application includes a built-in **Neural Congestion** handler that automatically retries API calls (up to 7 times with exponential backoff) when encountering 429 (Too Many Requests) or 503 (Service Unavailable) errors from the Gemini API.
