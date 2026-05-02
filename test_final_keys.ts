import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function testKeys() {
  const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const keys = keysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0);

  if (keys.length === 0) return;

  console.log(`--- Testing ${keys.length} API Keys with gemini-flash-lite-latest ---`);

  const results = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const maskedKey = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    
    process.stdout.write(`[${i + 1}/${keys.length}] Testing ${maskedKey}... `);
    
    const genAI = new GoogleGenAI({ apiKey: key });

    try {
      const result = await Promise.race([
        genAI.models.generateContent({
          model: "gemini-flash-lite-latest",
          contents: [{ parts: [{ text: "OK" }] }]
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000))
      ]) as any;
      
      const text = result.text || "No text";
      console.log(`✅ OK (${text.trim()})`);
      results.push({ index: i + 1, key: maskedKey, status: "OK", error: "-" });
    } catch (err: any) {
      let msg = err.message;
      if (msg.includes("429")) msg = "429 Quota Exceeded";
      else if (msg.includes("403")) msg = "403 Forbidden/Denied";
      else if (msg.includes("404")) msg = "404 Model Not Found";
      
      console.log(`❌ ${msg}`);
      results.push({ index: i + 1, key: maskedKey, status: "FAILED", error: msg });
    }
  }

  console.log("\n--- Summary ---");
  console.table(results);
}

testKeys().catch(console.error);
