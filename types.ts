export interface Book {
  id: string;
  title: string;
  fileBuffer: ArrayBuffer;
}

// FIX: Add ChatMessage interface to resolve import error in ChatPanel.tsx
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
