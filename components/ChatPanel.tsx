import React, { useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { CloseIcon, SendIcon } from './icons/Icons';
import Spinner from './ui/Spinner';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chatHistory: ChatMessage[];
  onSendMessage: (message: string) => void;
  isAiThinking: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onNavigateToPage: (page: number) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onClose,
  chatHistory,
  onSendMessage,
  isAiThinking,
  inputValue,
  onInputChange,
  onNavigateToPage
}) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
        inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isAiThinking]);

  const handleSendMessage = () => {
    if (inputValue.trim() && !isAiThinking) {
      onSendMessage(inputValue);
      onInputChange('');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSendMessage();
    }
  };
  
  const parseContent = (content: string) => {
    const parts = content.split(/(\[Source:[^\]]+\])/g);
    return parts.map((part, index) => {
      if (!part) return null;
      const match = part.match(/\[Source:\s*([^\]]+)\]/);
      if (match) {
        const pages = match[1].split(',').map(p => p.trim().replace(/^p/i, '')).map(Number).filter(n => !isNaN(n) && n > 0);
        if (pages.length === 0) return <span key={index}>{part}</span>;
        
        return (
          <div key={index} className="text-sm mt-2" style={{color: 'var(--text-tertiary)'}}>
            Source: {pages.map((page, i) => (
              <React.Fragment key={page}>
                <button
                  onClick={() => onNavigateToPage(page)}
                  className="underline hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded"
                >
                  p{page}
                </button>
                {i < pages.length - 1 ? ', ' : ''}
              </React.Fragment>
            ))}
          </div>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      ></div>
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-lg shadow-2xl z-50 flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ backgroundColor: 'var(--bg-primary)'}}
      >
        <header className="flex items-center justify-between p-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border-color)'}}>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>AI Assistant</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200/60 transition-colors" aria-label="Close chat" style={{ color: 'var(--text-secondary)'}}>
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>
        
        <div ref={chatContainerRef} className="flex-grow p-4 overflow-y-auto space-y-6">
          {chatHistory.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-md px-4 py-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : ''}`}
                style={msg.role === 'assistant' ? {backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'} : {}}
              >
                <div className="whitespace-pre-wrap">{parseContent(msg.content)}</div>
              </div>
            </div>
          ))}
          {isAiThinking && (
            <div className="flex justify-start">
              <div className="max-w-md px-4 py-3 rounded-lg inline-flex" style={{backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)'}}>
                <Spinner className="w-5 h-5" />
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t flex-shrink-0" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)'}}>
          <div className="flex items-center space-x-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about the book..."
              disabled={isAiThinking}
              className="w-full px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)'}}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isAiThinking}
              className="p-3 bg-blue-500 text-white rounded-full disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors flex-shrink-0"
              aria-label="Send message"
            >
              <SendIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatPanel;
