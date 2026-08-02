import { GoogleGenAI } from '@google/genai';
import { keyRotator } from './src/lib/key_rotator.js';

async function run() {
  const apiKey = keyRotator.getNextKey();
  console.log('Using key starting with:', apiKey.substring(0, 4));
  const ai = new GoogleGenAI({ apiKey });
  
  console.log('Testing generateContentStream with gemini-flash-lite-latest...');
  try {
    const stream = await ai.models.generateContentStream({
      model: 'gemini-flash-lite-latest',
      contents: 'Say hello.',
    });
    for await (const chunk of stream) {
      process.stdout.write(chunk.text || '');
    }
    console.log('\nStream success!');
  } catch (e: any) {
    console.error('\nStream ERROR:', e.message);
  }

  console.log('Testing cachedGenerate style (generateContent)...');
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: 'Say hello.',
    });
    console.log('\nGenerate success:', res.text);
  } catch (e: any) {
    console.error('\nGenerate ERROR:', e.message);
  }
}
run();
