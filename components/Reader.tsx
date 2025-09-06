import React, { useState, useCallback } from 'react';
import { Book, ChatMessage, Chunk } from '../types';
import { generateAnswer, generateEmbedding } from '../services/geminiService';
import BookViewer from './BookViewer';
import ChatPanel from './ChatPanel';
import { BackIcon, ChatIcon } from './icons/Icons';

interface ReaderProps {
  book: Book;
  onBackToLibrary: () => void;
}

const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const Reader: React.FC<ReaderProps> = ({ book, onBackToLibrary }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(true);

  const retrieveRelevantChunks = useCallback(async (question: string): Promise<Chunk[]> => {
    const chunksWithEmbeddings = book.chunks.filter(chunk => chunk.embedding && chunk.embedding.length > 0);
    if (chunksWithEmbeddings.length > 0) {
      try {
        const questionEmbedding = await generateEmbedding(question);
        const scoredChunks = chunksWithEmbeddings.map(chunk => ({
            chunk,
            score: cosineSimilarity(questionEmbedding, chunk.embedding!),
        }));
        scoredChunks.sort((a, b) => b.score - a.score);
        return scoredChunks.slice(0, 5).map(item => item.chunk);
      } catch (error) {
        console.error("Failed to perform semantic search:", error);
      }
    }

    console.warn("Performing fallback keyword search.");
    const questionTerms = question.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    if (questionTerms.length === 0) return [];

    const scoredChunks = book.chunks.map(chunk => {
      let score = 0;
      const chunkTextLower = chunk.text.toLowerCase();
      if (chunkTextLower.includes(question.toLowerCase())) {
          score += 5;
      }
      for (const term of questionTerms) {
        if (chunkTextLower.includes(term)) {
          score++;
        }
      }
      return { chunk, score };
    });

    return scoredChunks
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(item => item.chunk);
  }, [book.chunks]);
  
  const handleSendMessage = useCallback(async (message: string) => {
    setIsAiThinking(true);
    if(!isChatPanelOpen) setIsChatPanelOpen(true);
    const userMessage: ChatMessage = { role: 'user', content: message };
    setChatHistory(prev => [...prev, userMessage]);

    const relevantChunks = await retrieveRelevantChunks(message);
    const aiResponseText = await generateAnswer(message, relevantChunks);

    const sources = aiResponseText.match(/\[Source: (\d+(?:,\s*\d+)*)\]/);
    let sourceIds: number[] = [];
    if (sources && sources[1]) {
        sourceIds = sources[1].split(',').map(s => parseInt(s.trim(), 10));
    }

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: aiResponseText,
      sources: sourceIds
    };
    
    setChatHistory(prev => [...prev, assistantMessage]);
    setIsAiThinking(false);
  }, [book.chunks, retrieveRelevantChunks, isChatPanelOpen]);
  
  const handleGoToSource = (sourceId: number) => {
    const chunk = book.chunks.find(c => c.id === sourceId);
    if (chunk) {
      setCurrentPage(chunk.page);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-900">
      <header className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50 backdrop-blur-sm z-30 flex-shrink-0">
        <div className="flex items-center">
            <button onClick={onBackToLibrary} className="p-2 rounded-md hover:bg-zinc-700 transition-colors">
              <BackIcon className="w-6 h-6" />
            </button>
            <h1 className="ml-4 text-xl font-semibold truncate">{book.title}</h1>
        </div>
        <button onClick={() => setIsChatPanelOpen(!isChatPanelOpen)} className="p-2 rounded-md hover:bg-zinc-700 transition-colors">
            <ChatIcon className="w-6 h-6" />
        </button>
      </header>
      <div className="flex-grow relative min-h-0">
        <BookViewer
          book={book}
          currentPage={currentPage}
        />
        <ChatPanel
          isOpen={isChatPanelOpen}
          onClose={() => setIsChatPanelOpen(false)}
          chatHistory={chatHistory}
          onSendMessage={handleSendMessage}
          isAiThinking={isAiThinking}
          onGoToSource={handleGoToSource}
        />
      </div>
    </div>
  );
};

export default Reader;