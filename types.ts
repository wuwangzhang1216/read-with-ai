export interface Chunk {
  id: string;
  bookId: string;
  pageNumber: number;
  content: string;
  embedding: number[];
}

export interface Book {
  id: string;
  title: string;
  fileBuffer: ArrayBuffer;
  pageCount: number;
  fullText: string;
  chunks: Chunk[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}