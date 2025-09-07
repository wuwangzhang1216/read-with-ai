

import { GoogleGenAI } from "@google/genai";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// The RAG-based functions (generateEmbedding, generateEmbeddingsBatch, generateAnswer)
// have been removed as the application no longer extracts text from PDFs.
// The Gemini service is kept for potential future AI features not dependent on book content.
