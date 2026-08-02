**OVAN: Building a Thinking Machine That Can Act**

Einstein was not considered a genius because he knew more physics than his contemporaries. In fact, there were physicists of his era with broader technical knowledge. What set Einstein apart was something harder to name — the architecture of his reasoning. He asked different questions, approached problems from unexpected angles, and crucially, he turned his thinking back on itself. He reasoned *with* what he knew in ways others did not.

This tells us something important about intelligence: it is not merely a function of knowledge. It is shaped by the structure of the thinking process — what questions are asked, in what order, from what angles, and with what degree of self-correction.

But there is a second thing worth noticing about Einstein. He did not just think. He published. He corresponded. He built physical intuition pumps and ran thought experiments that others later converted into instruments and theories. The thinking was inseparable from the doing. Neither half was the point. The point was the full loop.

This insight is the foundation of OVAN.

---

**Why OVAN Exists**

We already have systems with extraordinary knowledge. A single large language model knows more than any single human being — more history, more science, more literature, more code. Knowledge, in that sense, is a solved problem.

What has not been solved is the *process* — both thinking and acting.

When you give a standard AI a complex problem, it does two things almost simultaneously: it thinks, and it acts. There is no real separation between the two. The model predicts the next token. Those tokens become code, or a plan, or an answer. The thinking and the acting collapse into a single, unreflected pass. The problem is not that the model is stupid. The problem is that it has no room to be wrong before it commits.

Real intelligence does not work this way. A good engineer does not type the first line of code before understanding the problem. A good strategist does not issue the first order before modelling the adversary. The thinking happens first, seriously and at depth, and only then does the acting begin — informed by everything the thinking produced.

OVAN is built around that separation. Think first. Act second. And make both of those halves as rigorous as possible.

---

**What OVAN Is**

OVAN is a unified system with two inseparable halves: a multidimensional reasoning engine and an autonomous execution engine. Neither half is optional. Neither half is more important than the other. Together, they form a complete loop from problem to solution.

The reasoning engine is what handles the thinking. The execution engine is what handles the doing. The point is that the thinking informs the doing — not as a rough summary or a vague intention, but as a precise, deeply reasoned specification that the execution engine can act on with confidence.

**The Reasoning Half**

At each step of the thinking process, six agents work in sequence, each doing a distinct job.

**The Questioner** opens every step. It reads the full reasoning history and generates a single, precise, probing question — framed for the dimension being explored. Its only job is to ask the right question. It is explicitly forbidden from answering it.

**Three Answerer Agents** respond to that question in parallel, each from a different epistemic standpoint:

- The **Internal Answerer** reasons from first principles — the core mechanics, formal models, and intrinsic structure of the problem.
- The **Archival Answerer** draws on collective memory — historical precedent, documented patterns, intellectual traditions, and what humanity has learned across time.
- The **External Answerer** grounds the reasoning in the live world — current research, market data, external context, and logical verification that the reasoning is not in a vacuum.

**The Meta Reasoning Agent** then reads all three answers and audits them — checking for factual accuracy, logical consistency, internal contradictions, and hallucinations. It does not replace any answerer. Its job is to produce a rigorous critique that the next agent uses as input.

**The Thinking Agent** — the main thinker — does the hardest work. It takes the three initial perspectives, the meta-reasoning audit, and the original question, and engages in an exhaustive internal monologue: questioning premises, reconciling contradictions, playing devil's advocate, and working through the logic step by step. Only after this monologue does it produce a final consolidated insight.

**The Controller** reads that consolidated insight alongside the full reasoning history and decides what to do next: which dimension to explore, why, and what the intent of the next step should be. When it judges that sufficient depth has been reached, it terminates the thinking loop and passes everything — all of it, the full structured trace of reasoning — to the execution engine.

What gives this structure its reach is the framework of nine thinking dimensions — what I call the dimensions of cognition — through which the controller navigates:

- **Understanding** — What does this actually mean, and where are its boundaries?
- **Inquiry** — Why or how does this happen?
- **Procedural** — What are the steps involved?
- **Wonder** — What if things were different?
- **Consequence** — What are the impacts and risks?
- **Meta-Cognition** — How sound is the thinking so far?
- **Creative** — What new possibilities exist?
- **Causal** — What are the mechanics and root causes?
- **Grounding** — Are the claims actually true? What evidence exists?

Each dimension has strict anti-overreach rules. The Consequence agent does not propose solutions. The Grounding agent does not explore speculative scenarios. The Wonder agent does not analyze real consequences. The boundaries are enforced so that each dimension contributes something the others cannot, and the full picture only emerges across the whole sequence.

**The Execution Half**

When the reasoning loop ends, the synthesized output does not become a piece of text to read. It becomes a specification to act on.

A second swarm of five planning agents reads the specification and produces a structured task graph — a DAG — that maps out every piece of work needed, in what order, with what dependencies, and with what safeguards. A technical architect, a dependency analyst, an execution sequencer, a meta-reasoning auditor, and a consolidator each propose their interpretation of the plan. Their proposals are reconciled into one.

Autonomous worker agents then carry out the tasks in parallel. Each worker is a ReAct loop — it reasons, acts, observes the result, and reasons again. It can read and write files, run terminal commands, edit code at the syntax-tree level rather than the string level, and control a live browser to verify what it built actually works in a real environment.

Workers in the same batch can edit the same files safely, because a file lock manager coordinates access at the lock level, detects deadlocks before they happen, and rolls back batches that cannot be resolved cleanly.

When a batch finishes, a manager agent steps in. Before the batch even began, the manager had already formulated a precise model of what success looks like. Now it runs that verification: executing build scripts, inspecting code structure, loading the application in a browser. If the workers made a mistake, the manager does not just report it — it fixes it directly, then signs off.

That is the full loop. Thinking, planning, executing, verifying.

---

**Was It Successful?**

OVAN version 1 is still highly experimental. The reasoning agents are limited — they draw from training data, shallow web searches, and code sandboxes, but not yet from images, video, deep simulation, or live experimental data. The architecture is still being refined.

But the core hypothesis — that separating the process of thinking from the process of acting, and making both of them rigorous, produces meaningfully better outcomes than collapsing the two into a single pass — has shown early promise. The reports generated by OVAN reflect a depth and coherence that flat, single-pass generation does not consistently achieve. You can explore reports generated by the OVAN thinking machine here: [github.com/Gifted87/OBSIDIAN-ARTIFACTS](https://github.com/Gifted87/OBSIDIAN-ARTIFACTS)

The system is not yet what it will become. But it is a first, serious step toward something worth building: a machine that does not merely know, but genuinely *thinks* — and then genuinely *acts* on what it thought.

The goal, ultimately, is superintelligence — not through brute scale, but through better architecture. OVAN is the beginning of that search.

---

**How to Use OVAN**

Running OVAN on your laptop takes about ten minutes. Here is exactly what to do, step by step.

---

**Step 1 — Get Your API Keys**

OVAN supports two AI providers: Google Gemini and DeepSeek. You need at least one.

**For Gemini:**
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with any Google account
3. Click **"Get API Key"** in the top-left menu
4. Click **"Create API key"** and copy the key that appears — it will look something like `AIzaSy...`

**For DeepSeek:**
1. Go to [platform.deepseek.com](https://platform.deepseek.com)
2. Sign in and navigate to the API section
3. Create an API key and copy it — it will look something like `sk-...`

You can use both. OVAN will rotate across multiple keys automatically if you provide them. Keep your keys somewhere safe. You will need them in Step 4.

---

**Step 2 — Install the Prerequisites**

Before running OVAN, your laptop needs two things installed: **Node.js** and **Git**. If you already have them, skip ahead.

**Installing Node.js** (version 20 or higher)
- Go to [nodejs.org](https://nodejs.org) and download the **LTS** version
- Run the installer and follow the on-screen steps
- To confirm it worked, open your terminal and type: `node --version` — you should see a number like `v20.x.x`

**Installing Git**
- Go to [git-scm.com/downloads](https://git-scm.com/downloads) and download Git for your operating system
- Run the installer with all default settings
- To confirm it worked, type: `git --version` in your terminal

> **What is a terminal?** On Mac, search for "Terminal" in Spotlight. On Windows, search for "Command Prompt" or "PowerShell". On Linux, it is usually under Applications → Terminal.

---

**Step 3 — Download the Code**

Open your terminal and run these two commands one at a time:

```bash
git clone https://github.com/Gifted87/ovan.git
cd ovan
```

The first command downloads the project onto your laptop. The second command moves you into the project folder.

---

**Step 4 — Add Your API Keys**

Inside the project folder, you will find a file called `.env.example`. You need to copy it and fill in your keys.

Run this in the terminal:

```bash
cp .env.example .env
```

Now open the new `.env` file in any text editor (Notepad, TextEdit, VS Code — anything works). Fill in your keys:

```
AI_PROVIDER="gemini"

GEMINI_API_KEY="AIzaSyXXXXXXXXXXXXXXXXXXXX"

DEEPSEEK_API_KEYS="sk-XXXXXXXXXXXXXXXXXX"
```

If you have multiple keys for the same provider, separate them with commas. OVAN will rotate through them automatically.

Save the file.

---

**Step 5 — Install Dependencies**

Dependencies are the small software packages that OVAN relies on to run. Install them with one command:

```bash
npm install
```

This may take a minute or two. You will see a lot of text scroll by — that is normal.

---

**Step 6 — Run OVAN**

OVAN has two parts: a **backend server** (the brain) and a **frontend interface** (the face). You need to run both at the same time, so you will need **two terminal windows** open side by side.

**Terminal 1 — Start the server:**
```bash
npm run server
```

**Terminal 2 — Start the interface:**
```bash
npm run dev
```

Once both are running, open your browser and go to:

```
http://localhost:3000
```

OVAN will be live and ready to use.

---

**Troubleshooting**

| Problem | Fix |
|---|---|
| `node: command not found` | Node.js is not installed. Repeat Step 2. |
| `git: command not found` | Git is not installed. Repeat Step 2. |
| The page does not load | Make sure both terminal commands from Step 6 are still running. |
| API errors in the interface | Double-check that your `.env` file has the correct key and no extra spaces around it. |

---

**License**

OVAN is open source and released under the [MIT License](LICENSE).

---

**Build On This**

OVAN is not a finished product. It is an open foundation — a first serious attempt to show that the architecture of thinking matters as much as the store of knowledge, that thinking and acting are stronger together than either is alone, and that the gap between them can be closed by a system that treats both with equal seriousness. Version 1 is deliberately minimal. The agents are limited. The dimensions are a starting point, not a ceiling. The whole point is that someone, somewhere, should take this further than I can alone.

If you are a developer, this is an invitation.

The architecture is simple enough to understand in an afternoon and open enough to be taken in almost any direction. Some things worth building:

**Richer answering agents** — agents that can browse the web deeply, analyse images and videos, run code, perform simulations, query databases, and call external APIs. The current agents are shallow. The framework is ready for agents that are not.

**Better controller logic** — the controller that decides which thinking dimension to explore next is the heart of the reasoning half. Smarter routing, learned heuristics, or even a trained model for dimension selection could dramatically improve output quality.

**New cognitive dimensions** — the nine dimensions are not the only possible decomposition. There may be better ones. Ethical reasoning, probabilistic thinking, temporal analysis — the design space is wide open.

**Memory and context** — OVAN currently thinks and acts without persistent memory. An agent that can recall past reasoning sessions, build a model of a domain over time, or recognise when it has solved a similar problem before would be a qualitatively different thing.

**Multi-model architectures** — the provider router already supports Gemini and DeepSeek. A version that routes different question types to different specialist models — mixing reasoning models, vision models, code models — across both halves of the system could be far more capable.

**Evaluation frameworks** — how do you measure whether a thinking machine is actually thinking better? How do you measure whether an execution engine is actually executing more reliably? Building rigorous benchmarks and evaluation pipelines for this kind of system is unsolved and important work.

The repository is open. The licence is MIT. Take it, fork it, break it, rebuild it. If you build something interesting on top of this architecture, I want to know about it.

The goal is not that OVAN wins. The goal is that the idea — that reasoning structure matters, and that thinking and acting together produce something neither can produce alone — gets tested, refined, and taken as far as it can go. That requires more than one person.

Build something.
