export interface Book {
  id: string;
  title: string;
  fileBuffer: ArrayBuffer;
  fullText: string[]; // Array of strings, one per page
  chunks: Chunk[];
}

export interface Chunk {
  id: number;
  text: string;
  page: number;
  embedding?: number[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: number[];
}
