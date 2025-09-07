import React, { useState, useEffect, useRef } from 'react';
import { Book, ChatMessage } from '../types';
import { BackIcon, ChatIcon } from './icons/Icons';
import ChatPanel from './ChatPanel';
import * as geminiService from '../services/geminiService';

declare const PDFObject: any;

interface ReaderProps {
  book: Book;
  onBackToLibrary: () => void;
}

const Reader: React.FC<ReaderProps> = ({ book, onBackToLibrary }) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatInputValue, setChatInputValue] = useState("");
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (book && viewerRef.current) {
      // Clear previous embed to avoid issues
      viewerRef.current.innerHTML = '';
      
      const blob = new Blob([book.fileBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob) + (currentPage ? `#page=${currentPage}` : '');
      
      PDFObject.embed(url, viewerRef.current);
      
      // Clean up the object URL to avoid memory leaks when the component unmounts
      // or the book changes. The re-rendering for page change is handled by the effect dependency array.
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [book, currentPage]);

  const handleNavigateToPage = (page: number) => {
    setCurrentPage(page);
  };

  const handleSendMessage = async (message: string) => {
    const userMessage: ChatMessage = { role: 'user', content: message };
    setChatHistory(prev => [...prev, userMessage]);
    setIsAiThinking(true);

    try {
      const aiResponse = await geminiService.generateAnswer(book, message);
      const aiMessage: ChatMessage = { role: 'assistant', content: aiResponse };
      setChatHistory(prev => [...prev, aiMessage]);
    } catch (error)
    {
      console.error("Failed to get answer from AI:", error);
      const errorMessage: ChatMessage = { role: 'assistant', content: "Sorry, I couldn't process that. Please try again." };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsAiThinking(false);
    }
  };

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--bg-secondary)'}}>
      <header className="flex items-center justify-between p-4 border-b z-30 flex-shrink-0" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)'}}>
        <div className="flex items-center">
            <button onClick={onBackToLibrary} className="p-2 rounded-full hover:bg-gray-200/60 transition-colors" aria-label="Back to library" style={{ color: 'var(--text-secondary)' }}>
              <BackIcon className="w-6 h-6" />
            </button>
            <h1 className="ml-4 text-xl font-semibold truncate" style={{ color: 'var(--text-primary)'}}>{book.title}</h1>
        </div>
        <div className="flex items-center">
          <button onClick={() => setIsChatOpen(true)} className="p-2 rounded-full hover:bg-gray-200/60 transition-colors" aria-label="Open AI assistant" style={{ color: 'var(--text-secondary)' }}>
            <ChatIcon className="w-6 h-6" />
          </button>
        </div>
      </header>
      
      <div className="flex-grow relative min-h-0 overflow-hidden">
        <div 
          ref={viewerRef} 
          className="w-full h-full" 
          style={{ transform: 'translateZ(0)' }} // Promote to its own rendering layer to prevent flicker
        />
        <ChatPanel 
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            chatHistory={chatHistory}
            onSendMessage={handleSendMessage}
            isAiThinking={isAiThinking}
            inputValue={chatInputValue}
            onInputChange={setChatInputValue}
            onNavigateToPage={handleNavigateToPage}
        />
      </div>
    </div>
  );
};

export default Reader;