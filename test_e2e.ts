import 'dotenv/config';
import { DeepSeekEngine } from './src/lib/deepseek_engine.ts';
import { Dimension, ReasoningGraph, GraphUtils } from './src/lib/types.ts';

async function main() {
  const engine = new DeepSeekEngine();
  const goal = "Write a python script that computes the first 10 Fibonacci numbers and prints them.";

  console.log("Goal:", goal);

  let graph: ReasoningGraph = {
    nodes: new Map(),
    rootIds: [],
    activeHeadId: "",
    metadata: { sessionId: "test", createdAt: Date.now(), totalBranches: 0, maxDepth: 0 }
  };

  // 1. Initial dimension
  const initial = await engine.getInitialDimension(goal, "fast");
  console.log("\n[Initial Dimension]:", initial.dimension, "-", initial.reasoning);

  let nextDim: Dimension | "TERMINATE" = initial.dimension;
  let loops = 0;

  while (nextDim !== "TERMINATE" && loops < 10) {
    loops++;
    console.log(`\n--- Loop ${loops}: ${nextDim} ---`);

    const step = await engine.runStep(nextDim as any, goal, graph, "fast");
    GraphUtils.addNode(graph, step, graph.activeHeadId || null);

    console.log("Dimension:", step.dimension);
    console.log("Question:", step.question);
    console.log("Internal (first 200 chars):", step.answers.internal.substring(0, 200));

    // If a code request was made, dispatch it and wait for result
    if (step.codeRequest) {
      console.log(`\n[Code Request] language=${step.codeRequest.language}, dispatching...`);
      engine.dispatchCodeRequest(step.codeRequest);

      // Wait for execution (poll briefly)
      let completed = null;
      for (let i = 0; i < 30 && !completed; i++) {
        await new Promise(r => setTimeout(r, 1000));
        completed = await engine.checkForCompletedCode();
      }

      if (completed) {
        console.log(`\n[Code Observation] exitCode=${completed.result.exitCode}, elapsed=${completed.result.elapsedMs}ms`);
        console.log("stdout:", completed.result.stdout.substring(0, 500));
        if (completed.result.stderr) {
          console.log("stderr:", completed.result.stderr.substring(0, 300));
        }
        const obsStep = engine.createObservationStep(completed.requestId, step.codeRequest!, completed.result);
        GraphUtils.addNode(graph, obsStep, graph.activeHeadId);
        nextDim = obsStep.controllerDecision?.nextDimension || "TERMINATE";
        console.log("Observation routes to:", nextDim);
        continue;
      }
    }

    nextDim = step.controllerDecision?.nextDimension || "TERMINATE";
    console.log("Controller Next Dimension:", nextDim);
    console.log("Controller Reasoning:", step.controllerDecision?.reasoning?.substring(0, 200));
  }

  console.log("\nDone after", loops, "loops.");
}

main().catch(console.error);
