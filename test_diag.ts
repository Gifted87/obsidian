import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function listModels() {
  const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const keys = keysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0);

  if (keys.length === 0) return;

  const key = keys[0];
  console.log(`--- Listing Available Models for Key 1 ---`);
  
  const genAI = new GoogleGenAI({ apiKey: key });

  try {
    // Attempt to list models if the SDK supports it, or just try a different model
    console.log("Testing with gemini-2.0-flash-exp...");
    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [{ parts: [{ text: "Say 'test'" }] }]
    }) as any;
    console.log("Success with gemini-2.0-flash-exp:", result.text);
  } catch (err: any) {
    console.error("Failed with gemini-2.0-flash-exp:", err.message);
  }
}

listModels().catch(console.error);
