import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { VectorStore } from "@langchain/core/vectorstores";
import { Document } from "@langchain/core/documents";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { formatDocumentsAsString } from "langchain/util/document";
import { PromptTemplate } from "@langchain/core/prompts";
import { Book, Chunk } from "../types";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

// Initialize models
const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.API_KEY,
  model: "gemini-2.5-flash",
  temperature: 0.3,
});

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.API_KEY,
  model: "text-embedding-004",
});

// Tool use tracking
export interface ToolUse {
  toolName: string;
  input: any;
  output?: any;
  timestamp: number;
}

export interface ThoughtProcess {
  stage: string;
  thought: string;
  timestamp: number;
}

export interface RAGResult {
  answer: string;
  toolUses: ToolUse[];
  thoughts: ThoughtProcess[];
  relevantChunks: Chunk[];
}

// Callbacks for streaming and telemetry
export interface RAGCallbacks {
  onThought?: (t: ThoughtProcess) => void;
  onToolUse?: (t: ToolUse) => void;
  onProgress?: (text: string) => void;
  onToken?: (token: string) => void; // streaming tokens for the final answer
  onDone?: () => void;               // fired when streaming completes
}

// In-memory vector store implementation
class InMemoryVectorStore {
  private documents: Document[] = [];
  private embeddings: number[][] = [];

  constructor(private embeddingModel: GoogleGenerativeAIEmbeddings) {}

  async addDocuments(documents: Document[]) {
    const texts = documents.map(doc => doc.pageContent);
    const newEmbeddings = await this.embeddingModel.embedDocuments(texts);
    this.documents.push(...documents);
    this.embeddings.push(...newEmbeddings);
  }

  async similaritySearch(query: string, k: number = 5): Promise<Document[]> {
    if (this.documents.length === 0) return [];

    const queryEmbedding = await this.embeddingModel.embedQuery(query);

    // Calculate similarities
    const similarities = this.embeddings.map((embedding, index) => ({
      index,
      similarity: this.cosineSimilarity(queryEmbedding, embedding),
      document: this.documents[index]
    }));

    // Sort and return top k
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)
      .filter(s => s.similarity > 0.3) // Threshold for relevance
      .map(s => s.document);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  clear() {
    this.documents = [];
    this.embeddings = [];
  }
}

// Store for each book's vector store
const bookVectorStores = new Map<string, InMemoryVectorStore>();

// Initialize or get vector store for a book
async function getOrCreateVectorStore(book: Book, callbacks?: RAGCallbacks): Promise<InMemoryVectorStore> {
  if (bookVectorStores.has(book.id)) {
    return bookVectorStores.get(book.id)!;
  }

  callbacks?.onProgress?.("Initializing vector store...");

  const vectorStore = new InMemoryVectorStore(embeddings);

  // Convert chunks to documents
  const documents = book.chunks.map(chunk => new Document({
    pageContent: chunk.content,
    metadata: {
      pageNumber: chunk.pageNumber,
      chunkId: chunk.id,
      bookId: chunk.bookId
    }
  }));

  await vectorStore.addDocuments(documents);
  bookVectorStores.set(book.id, vectorStore);

  return vectorStore;
}

// Generate embeddings for chunks during book upload
export async function generateEmbeddingsBatch(chunks: string[]): Promise<number[][]> {
  try {
    const embeddings_result = await embeddings.embedDocuments(chunks);
    return embeddings_result;
  } catch (error) {
    console.error("Error generating embeddings:", error);
    // Fallback to fake embeddings if the API fails
    return chunks.map(chunk => {
      const embedding = Array(768).fill(0);
      for (let i = 0; i < chunk.length; i++) {
        embedding[i % 768] += chunk.charCodeAt(i);
      }
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return norm === 0 ? embedding : embedding.map(v => v / norm);
    });
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embedding = await embeddings.embedQuery(text);
    return embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    // Fallback to fake embedding
    const embedding = Array(768).fill(0);
    for (let i = 0; i < text.length; i++) {
      embedding[i % 768] += text.charCodeAt(i);
    }
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return norm === 0 ? embedding : embedding.map(v => v / norm);
  }
}

// Multi-query retrieval - generate multiple search queries for comprehensive results
async function multiQueryRetrieval(
  vectorStore: InMemoryVectorStore,
  query: string,
  thoughts: ThoughtProcess[],
  toolUses: ToolUse[],
  callbacks?: RAGCallbacks
): Promise<Document[]> {
  const analysisThought: ThoughtProcess = {
    stage: "Query Analysis",
    thought: `Analyzing your question to generate multiple search perspectives...`,
    timestamp: Date.now()
  };
  thoughts.push(analysisThought);
  callbacks?.onThought?.(analysisThought);

  // Generate multiple search queries
  const queryGenerationPrompt = PromptTemplate.fromTemplate(`
You are an AI assistant helping to search through a book.
Your goal is to find relevant passages efficiently by crafting diverse, high-yield search queries.

Given the user's question, generate 3 different search queries that explore distinct angles or aspects of the question.
- Prefer concrete key terms from the question; add synonyms where helpful.
- If the question is not in English and the content might be English, include at least one English variant.
- Keep queries concise (6–12 words) and avoid punctuation noise.

Original Question: {question}

Output exactly 3 queries, one per line, no numbering.
After producing the queries, internally reflect on whether these cover likely aspects (do not output the reflection).
`);

  const queryChain = queryGenerationPrompt.pipe(llm).pipe(new StringOutputParser());

  const queryGenTool: ToolUse = {
    toolName: "Query Generation",
    input: { originalQuery: query },
    timestamp: Date.now()
  };
  toolUses.push(queryGenTool);
  callbacks?.onToolUse?.(queryGenTool);

  callbacks?.onProgress?.("Generating search queries...");

  const generatedQueries = await queryChain.invoke({ question: query });
  const queries = generatedQueries.split('\n').filter(q => q.trim()).slice(0, 3);
  queries.unshift(query); // Include original query

  queryGenTool.output = { queries };
  callbacks?.onToolUse?.({ ...queryGenTool, output: { queries } });

  const strategyThought: ThoughtProcess = {
    stage: "Search Strategy",
    thought: `Generated ${queries.length} search queries to explore different aspects; will search and reassess coverage.`,
    timestamp: Date.now()
  };
  thoughts.push(strategyThought);
  callbacks?.onThought?.(strategyThought);

  // Search with all queries
  const allDocs = new Map<string, Document>();

  for (let i = 0; i < queries.length; i++) {
    const searchQuery = queries[i];

    callbacks?.onProgress?.(`Searching (${i + 1}/${queries.length}): "${searchQuery.substring(0, 30)}..."`);

    const searchTool: ToolUse = {
      toolName: "Vector Search",
      input: { query: searchQuery, index: i + 1, total: queries.length },
      timestamp: Date.now()
    };
    toolUses.push(searchTool);
    callbacks?.onToolUse?.(searchTool);

    const docs = await vectorStore.similaritySearch(searchQuery, 5);

    searchTool.output = {
      documentsFound: docs.length,
      pages: docs.map(d => d.metadata.pageNumber)
    };
    callbacks?.onToolUse?.({ ...searchTool, output: searchTool.output });

    docs.forEach(doc => {
      const key = doc.metadata.chunkId || doc.pageContent.substring(0, 50);
      allDocs.set(key, doc);
    });
  }

  const uniqueDocs = Array.from(allDocs.values());

  const completeThought: ThoughtProcess = {
    stage: "Retrieval Complete",
    thought: `Found ${uniqueDocs.length} unique relevant passages across ${queries.length} searches`,
    timestamp: Date.now()
  };
  thoughts.push(completeThought);
  callbacks?.onThought?.(completeThought);

  return uniqueDocs;
}

// Chain of thought reasoning
async function chainOfThoughtReasoning(
  documents: Document[],
  query: string,
  thoughts: ThoughtProcess[],
  toolUses: ToolUse[],
  callbacks?: RAGCallbacks
): Promise<string> {
  const reasoningThought: ThoughtProcess = {
    stage: "Reasoning",
    thought: "Analyzing retrieved passages to construct a comprehensive answer...",
    timestamp: Date.now()
  };
  thoughts.push(reasoningThought);
  callbacks?.onThought?.(reasoningThought);

  const reasoningPrompt = PromptTemplate.fromTemplate(`
You are an AI assistant helping a user understand a book they are reading.

Based on the following context from the book, provide a comprehensive answer to the user's question.
Think step by step and consider multiple aspects of the question. Use the retrieved context carefully and avoid fabricating details.

IMPORTANT: Respond in the same language as the user's question. If the question is bilingual or mixed, use the primary language.

Context from the book:
{context}

Question: {question}

Instructions:
1. Identify the key aspects of the question
2. Address each aspect using information from the context
3. Synthesize the information into a coherent answer
4. Include page citations in the format [p. X] or [pp. X-Y]
5. If the context doesn't fully answer the question, explicitly state limitations
6. Before finalizing, quickly self-check for contradictions or missing steps

Answer:
`);

  const answerChain = reasoningPrompt
    .pipe(llm)
    .pipe(new StringOutputParser());

  const answerGenTool: ToolUse = {
    toolName: "Answer Generation",
    input: {
      question: query,
      contextLength: documents.length
    },
    timestamp: Date.now()
  };
  toolUses.push(answerGenTool);
  callbacks?.onToolUse?.(answerGenTool);

  const context = documents.map(doc =>
    `[Page ${doc.metadata.pageNumber}]: ${doc.pageContent}`
  ).join('\n\n');

  callbacks?.onProgress?.("Generating comprehensive answer...");

  // Stream tokens so UI can render incremental response
  // Some providers yield cumulative text, others yield deltas.
  // Normalize to deltas to avoid duplicate appends in the UI.
  let answer = "";
  let accumulated = "";
  const stream = await answerChain.stream({ context, question: query });
  for await (const chunk of stream) {
    const next = typeof chunk === 'string' ? chunk : String(chunk);
    let delta = "";
    if (next.startsWith(accumulated)) {
      delta = next.slice(accumulated.length);
    } else if (accumulated.startsWith(next)) {
      // Provider emitted a shorter prefix; skip as it doesn't add new text
      delta = "";
    } else {
      // Fallback: compute longest common prefix and append the remainder
      let i = 0;
      const minLen = Math.min(next.length, accumulated.length);
      while (i < minLen && next.charCodeAt(i) === accumulated.charCodeAt(i)) i++;
      delta = next.slice(i);
    }
    accumulated = next;
    if (delta) {
      answer += delta;
      callbacks?.onToken?.(delta);
    }
  }
  callbacks?.onDone?.();

  answerGenTool.output = {
    answerLength: answer.length
  };
  callbacks?.onToolUse?.({ ...answerGenTool, output: answerGenTool.output });

  const generatedThought: ThoughtProcess = {
    stage: "Answer Generated",
    thought: "Successfully synthesized information into a comprehensive response",
    timestamp: Date.now()
  };
  thoughts.push(generatedThought);
  callbacks?.onThought?.(generatedThought);

  // Ensure answer holds the final text
  if (!answer && accumulated) answer = accumulated;
  return answer;
}

// Main RAG pipeline with enhanced features
export async function generateAnswer(book: Book, query: string, callbacks?: RAGCallbacks): Promise<RAGResult> {
  const thoughts: ThoughtProcess[] = [];
  const toolUses: ToolUse[] = [];

  const initThought: ThoughtProcess = {
    stage: "Initialization",
    thought: `Starting enhanced RAG pipeline for: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`,
    timestamp: Date.now()
  };
  thoughts.push(initThought);
  callbacks?.onThought?.(initThought);

  try {
    // Get or create vector store
    callbacks?.onProgress?.("Preparing vector database...");
    const vectorStore = await getOrCreateVectorStore(book, callbacks);

    // Multi-query retrieval
    const relevantDocs = await multiQueryRetrieval(vectorStore, query, thoughts, toolUses, callbacks);

    // Post-retrieval reflection (think after tool use)
    const retrievalReflection: ThoughtProcess = {
      stage: "Post-Retrieval Reflection",
      thought: `Retrieved ${relevantDocs.length} relevant passages. Proceeding to synthesize an answer using citations.`,
      timestamp: Date.now()
    };
    thoughts.push(retrievalReflection);
    callbacks?.onThought?.(retrievalReflection);

    if (relevantDocs.length === 0) {
      const noResultsThought: ThoughtProcess = {
        stage: "No Results",
        thought: "No relevant passages found in the book for this query",
        timestamp: Date.now()
      };
      thoughts.push(noResultsThought);
      callbacks?.onThought?.(noResultsThought);

      return {
        answer: "I couldn't find relevant information in the book to answer your question. The topic might not be covered in this text, or it might be phrased differently.",
        toolUses,
        thoughts,
        relevantChunks: []
      };
    }

    // Generate answer with chain of thought
    const answer = await chainOfThoughtReasoning(relevantDocs, query, thoughts, toolUses, callbacks);

    // Convert documents back to chunks for compatibility
    const relevantChunks: Chunk[] = relevantDocs.map(doc => ({
      id: doc.metadata.chunkId || `temp-${Date.now()}`,
      bookId: book.id,
      pageNumber: doc.metadata.pageNumber,
      content: doc.pageContent,
      embedding: [] // We don't need to return embeddings
    }));

    const completeThought: ThoughtProcess = {
      stage: "Complete",
      thought: "Successfully completed RAG pipeline",
      timestamp: Date.now()
    };
    thoughts.push(completeThought);
    callbacks?.onThought?.(completeThought);

    return {
      answer,
      toolUses,
      thoughts,
      relevantChunks
    };

  } catch (error) {
    console.error("Error in RAG pipeline:", error);

    const errorThought: ThoughtProcess = {
      stage: "Error",
      thought: `Encountered an error: ${error}`,
      timestamp: Date.now()
    };
    thoughts.push(errorThought);
    callbacks?.onThought?.(errorThought);

    // Attempt to return an error message in the same language as the user's query
    let localized = "I encountered an error while processing your question. Please try again.";
    try {
      const prompt = PromptTemplate.fromTemplate(`
Rewrite the following message so that it uses the same language as this user question.
Keep it concise and polite. Output only the rewritten sentence.

Question: {question}
Message: {message}
`);
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      localized = await chain.invoke({ question: query, message: localized });
    } catch {}

    return {
      answer: localized,
      toolUses,
      thoughts,
      relevantChunks: []
    };
  }
}

// For backward compatibility
export { generateAnswer as default };
