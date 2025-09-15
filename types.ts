export interface Chunk {
  id: string;
  bookId: string;
  pageNumber: number;
  content: string;
  embedding: number[];
  metadata?: any;
}

export interface Book {
  id: string;
  title: string;
  fileBuffer?: ArrayBuffer;
  pageCount?: number;
  totalPages?: number;
  fullText?: string;
  chunks: Chunk[];
  metadata?: any;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}