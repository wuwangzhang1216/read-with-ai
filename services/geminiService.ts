import { GoogleGenAI } from "@google/genai";
import { Book, Chunk } from "../types";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// NOTE: The @google/genai API does not currently support an embedding model.
// The following functions simulate embedding generation and retrieval
// to build the RAG pipeline. In a real-world scenario, you would replace
// this with a call to a proper embedding model API.
function createFakeEmbedding(text: string): number[] {
  // Simple hash-based embedding for demonstration purposes
  const embedding = Array(10).fill(0);
  for (let i = 0; i < text.length; i++) {
    embedding[i % 10] += text.charCodeAt(i);
  }
  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) {
    return embedding; // Return zero vector for empty/zero-sum text
  }
  return embedding.map(v => v / norm);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 20));
  return createFakeEmbedding(text);
}


export async function generateEmbeddingsBatch(chunks: string[]): Promise<number[][]> {
  const embeddings = await Promise.all(chunks.map(chunk => generateEmbedding(chunk)));
  return embeddings;
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        return 0;
    }
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }
    const similarity = dotProduct / (magnitudeA * magnitudeB);
    return isNaN(similarity) ? 0 : similarity;
}

async function findRelevantChunks(book: Book, query: string, topK = 5): Promise<Chunk[]> {
  const queryEmbedding = await generateEmbedding(query);
  
  const similarities = book.chunks.map(chunk => ({
    chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  const relevant = similarities
    .filter(s => s.similarity > 0.25) // Filter for meaningful similarity
    .sort((a, b) => b.similarity - a.similarity);

  return relevant.slice(0, topK).map(s => s.chunk);
}

export async function generateAnswer(book: Book, query: string): Promise<string> {
  const relevantChunks = await findRelevantChunks(book, query);

  if (relevantChunks.length === 0) {
    return "Based on the book's content, I could not find a relevant answer to your question.";
  }

  const context = relevantChunks
    .map(chunk => `Source (Page ${chunk.pageNumber}):\n${chunk.content}`)
    .join("\n\n---\n\n");

  const sourcePages = [...new Set(relevantChunks.map(c => c.pageNumber))].sort((a,b) => a - b);
  
  const prompt = `You are an AI assistant helping a user understand a book they are reading.
  Based *only* on the following context from the book, answer the user's question.
  Do not use any outside knowledge.
  If the context does not contain the answer, state that you cannot answer based on the provided text.
  At the end of your answer, you MUST cite the relevant page numbers by writing "[Source: p1, p2, ...]".

  CONTEXT:
  ---
  ${context}
  ---

  QUESTION:
  ${query}
  `;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    let answer = response.text;

    // Ensure sources are cited if not already present
    if (!/\[Source:[^\]]*\d/.test(answer) && sourcePages.length > 0) {
        answer += ` [Source: ${sourcePages.join(', ')}]`;
    }

    return answer;

  } catch (error) {
    console.error("Error generating answer from Gemini:", error);
    return "Sorry, I encountered an error trying to generate an answer. Please try again.";
  }
}