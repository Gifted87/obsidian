import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY not found in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: { baseUrl: 'https://aiplatform.googleapis.com', apiVersion: 'v1/publishers/google' }
});

ai.models.generateContent({ model: "gemini-2.5-flash-lite", contents: "explain AI briefly" })
  .then(console.log)
  .catch(console.error);
