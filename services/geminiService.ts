

import { GoogleGenAI } from "@google/genai";
import { Chunk } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates an embedding for a single text query.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // FIX: Removed 'taskType' as it is not a valid property in the 'EmbedContentParameters' type.
    const result = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [text],
    });
    return result.embeddings[0].values;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

/**
 * Generates embeddings for a batch of text documents.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
    try {
        // The API has a limit on batch size; 100 is a safe number.
        const BATCH_SIZE = 100;
        const allEmbeddings: (number[] | null)[] = [];

        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
            const batchTexts = texts.slice(i, i + BATCH_SIZE);
            
            // FIX: Removed 'taskType' as it is not a valid property in the 'EmbedContentParameters' type.
            const result = await ai.models.embedContent({
                model: "text-embedding-004",
                contents: batchTexts,
            });

            const batchEmbeddings = result.embeddings.map(e => e.values);
            allEmbeddings.push(...batchEmbeddings);
            
            // A small delay can help prevent rate-limiting issues on very large books.
            if (texts.length > BATCH_SIZE) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        return allEmbeddings;

    } catch (error) {
        console.error("Error generating batch embeddings:", error);
        // Return an array of nulls so the calling function can handle it gracefully.
        return texts.map(() => null);
    }
}


export async function generateAnswer(question: string, contextChunks: Chunk[]): Promise<string> {
  if (contextChunks.length === 0) {
    return "I couldn't find any relevant information in the book to answer that question. Please try asking something else.";
  }

  const context = contextChunks
    .map(chunk => `[Source: ${chunk.id}] ${chunk.text}`)
    .join('\n\n---\n\n');

  const prompt = `You are an AI reading assistant. Based *only* on the following context from a book, answer the user's question.
Your answer must be concise and directly based on the provided text.
After your answer, you MUST cite the sources you used in the format [Source: X] or [Source: X, Y, Z].
Do not use any information outside of the provided context. If the context does not contain the answer, say so.

--- CONTEXT ---
${context}
--- END CONTEXT ---

User Question: "${question}"

Answer:`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.1,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Sorry, I encountered an error while trying to generate an answer. Please try again.";
  }
}