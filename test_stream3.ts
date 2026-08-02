import { GoogleGenAI } from '@google/genai';
import { keyRotator } from './src/lib/key_rotator.js';

async function run() {
  const ai = new GoogleGenAI({ apiKey: keyRotator.getNextKey() });
  
  try {
    const stream = await ai.models.generateContentStream({
      model: 'gemini-flash-lite-latest',
      contents: 'Say hello.',
      config: { systemInstruction: 'You are a helpful assistant.', temperature: 0.4 }
    });
    for await (const chunk of stream) {
      process.stdout.write(chunk.text || '');
    }
    console.log('\nStream success!');
  } catch (e: any) {
    console.error('\nStream ERROR:', e.message);
  }
}
run();
