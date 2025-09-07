import React, { useState, useCallback } from 'react';
import { Book, ChatMessage, Chunk } from '../types';
import { generateAnswer, generateEmbedding } from '../services/geminiService';
import BookViewer from './BookViewer';
import ChatPanel from './ChatPanel';
import { BackIcon, ChatIcon, ChevronLeftIcon, ChevronRightIcon } from './icons/Icons';

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
    normB += vecB[i] * vecB[i];
    normA += vecA[i] * vecA[i];
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
  const [chatInput, setChatInput] = useState('');

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

    const sources = aiResponseText.match(/\[Source: (\d+(?:,\s*\d+)*)\]/g);
    let sourceIds: number[] = [];
    if (sources) {
        sources.forEach(sourceMatch => {
            const ids = sourceMatch.match(/\d+/g);
            if (ids) {
                sourceIds.push(...ids.map(id => parseInt(id, 10)));
            }
        });
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
  
  const handleAskAboutSelection = (selection: string) => {
    setIsChatPanelOpen(true);
    const formattedText = `Regarding this selection:\n\n> ${selection.replace(/\n/g, '\n> ')}\n\n`;
    setChatInput(formattedText);
  };

  const handlePrevPage = () => setCurrentPage(prev => Math.max(1, prev - 1));
  const handleNextPage = () => setCurrentPage(prev => Math.min(book.fullText.length, prev + 1));

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--bg-secondary)'}}>
      <header className="flex items-center justify-between p-4 border-b z-30 flex-shrink-0" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)'}}>
        <div className="flex items-center">
            <button onClick={onBackToLibrary} className="p-2 rounded-full hover:bg-gray-200/60 transition-colors" style={{ color: 'var(--text-secondary)' }}>
              <BackIcon className="w-6 h-6" />
            </button>
            <h1 className="ml-4 text-xl font-semibold truncate" style={{ color: 'var(--text-primary)'}}>{book.title}</h1>
        </div>
        <button onClick={() => setIsChatPanelOpen(!isChatPanelOpen)} className="p-2 rounded-full hover:bg-gray-200/60 transition-colors" style={{ color: 'var(--text-secondary)' }}>
            <ChatIcon className="w-6 h-6" />
        </button>
      </header>
      <div className="flex-grow relative min-h-0">
        <BookViewer
          book={book}
          currentPage={currentPage}
          onAskAboutSelection={handleAskAboutSelection}
        />
        
        {/* Backdrop */}
        <div
            className={`absolute inset-0 bg-black z-35 transition-opacity duration-300 ease-in-out
            ${isChatPanelOpen ? 'opacity-40' : 'opacity-0 pointer-events-none'}`
            }
            onClick={() => setIsChatPanelOpen(false)}
            aria-hidden="true"
        />

        <ChatPanel
          isOpen={isChatPanelOpen}
          onClose={() => setIsChatPanelOpen(false)}
          chatHistory={chatHistory}
          onSendMessage={handleSendMessage}
          isAiThinking={isAiThinking}
          onGoToSource={handleGoToSource}
          inputValue={chatInput}
          onInputChange={setChatInput}
        />
      </div>
       <footer className="flex-shrink-0 flex items-center justify-center gap-4 p-2 border-t z-10" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)'}}>
        <button 
          onClick={handlePrevPage} 
          disabled={currentPage <= 1}
          className="p-2 rounded-full hover:bg-gray-200/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </button>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)', minWidth: '100px', textAlign: 'center' }}>Page {currentPage} of {book.fullText.length}</span>
        <button 
          onClick={handleNextPage} 
          disabled={currentPage >= book.fullText.length}
          className="p-2 rounded-full hover:bg-gray-200/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
           style={{ color: 'var(--text-secondary)' }}
        >
          <ChevronRightIcon className="w-6 h-6" />
        </button>
      </footer>
    </div>
  );
};

export default Reader;