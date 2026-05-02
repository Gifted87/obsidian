import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ThinkingEngine } from './src/lib/engine.ts';
import { Dimension } from './src/lib/types.ts';
import { keyRotator } from './src/lib/key_rotator.ts';

dotenv.config();

const app = express();
const port = 3030;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const apiKey = process.env.GEMINI_API_KEY;

if (!keyRotator.hasKeys()) {
  console.error("CRITICAL ERROR: No API keys found in the environment.");
  console.error("Please ensure you have GEMINI_API_KEY or GEMINI_API_KEYS configured in your .env file.");
  process.exit(1);
}


app.get('/api/suggestions', async (req, res) => {
  try {
    const engine = new ThinkingEngine(apiKey);
    const suggestions = await engine.generateSuggestions();
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/think', async (req, res) => {
  const { input, files, mode } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const send = (type: string, payload: any) => {
    res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
  };

  const engine = new ThinkingEngine(apiKey, (msg) => {
    send('retry', msg);
  });

  try {
    let currentSteps: any[] = [];
    let nextDim: any = Dimension.UNDERSTANDING;
    let currentInput = input;

    // Support multimodal input
    if (files && files.length > 0) {
      currentInput = [
        { text: input },
        ...files.map((f: any) => ({
          inlineData: { mimeType: f.type, data: f.base64 }
        }))
      ];
    }

    let safetyCounter = 0;

    while (safetyCounter < 120) {
      while (nextDim !== "TERMINATE" && safetyCounter < 120) {
        send('current_dimension', nextDim);

        const step = await engine.runStep(nextDim, currentInput, currentSteps, mode);
        currentSteps.push(step);
        send('step', step);

        nextDim = step.controllerDecision?.nextDimension || "TERMINATE";
        safetyCounter++;
      }

      send('current_dimension', null);
      const synthesis = await engine.synthesizeIntent(currentInput, currentSteps, mode);

      if (synthesis.status === "CONTINUE" && synthesis.nextDimension) {
        nextDim = synthesis.nextDimension;
        if (synthesis.newDirective) {
          const directive = `\n\n[SYNTHESIZER DIRECTIVE: ${synthesis.newDirective}]`;
          if (typeof currentInput === 'string') {
            currentInput += directive;
          } else {
            currentInput[0].text += directive;
          }
        }
        send('synthesis_continue', synthesis);
      } else {
        send('final_intent', synthesis.content);

        // Generate Final Report
        send('status', 'Generating architectural report...');
        try {
          const report = await engine.generateFinalReport(currentInput, currentSteps, synthesis.content);
          send('final_report', report);
        } catch (reportErr) {
          console.error("Report Generation Failed:", reportErr);
        }

        // Generate TTS
        send('status', 'Synthesizing neural audio...');
        try {
          const audio = await engine.generateTTS(synthesis.content.substring(0, 500));
          send('audio_base64', audio);
        } catch (ttsErr) {
          console.error("TTS Generation Failed:", ttsErr);
        }

        break;
      }
    }

    if (safetyCounter >= 120) {
      send('error', "Safety Termination: Cognitive loop exceeded maximum allowed steps (120).");
    }

  } catch (error) {
    console.error("Think error:", error);
    send('error', (error as Error).message);
  } finally {
    res.end();
  }
});

app.post('/api/summary', async (req, res) => {
  const { steps } = req.body;
  try {
    const engine = new ThinkingEngine(apiKey);
    const summary = await engine.generateSummary(steps);
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
