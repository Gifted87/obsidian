import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function testKeys() {
  const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const keys = keysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0);

  if (keys.length === 0) {
    console.error("No keys found in .env under GEMINI_API_KEYS or GEMINI_API_KEY");
    return;
  }

  console.log(`--- Testing ${keys.length} API Keys ---`);

  const results = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const maskedKey = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    
    console.log(`[${i + 1}/${keys.length}] Testing key: ${maskedKey}`);
    
    const genAI = new GoogleGenAI({ apiKey: key });

    try {
      const result = await Promise.race([
        genAI.models.generateContent({
          model: "gemini-1.5-flash",
          contents: [{ parts: [{ text: "Say 'OK'" }] }]
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 10s")), 10000))
      ]) as any;
      
      const text = result.text || "No text returned";
      console.log(`   ✅ SUCCESS: ${text.trim()}`);
      results.push({ index: i + 1, key: maskedKey, status: "OK" });
    } catch (err: any) {
      console.error(`   ❌ FAILED: ${err.message}`);
      results.push({ index: i + 1, key: maskedKey, status: "FAILED", error: err.message });
    }
  }

  console.log("\n--- Final Test Summary ---");
  console.table(results);
  
  const successCount = results.filter(r => r.status === "OK").length;
  console.log(`\nSummary: ${successCount}/${keys.length} keys are working.`);
}

testKeys().catch(console.error);
