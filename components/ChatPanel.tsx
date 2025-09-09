import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChatMessage } from '../types';
import { CloseIcon, SendIcon } from './icons/Icons';
import Spinner from './ui/Spinner';

declare const marked: any;

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
  onNavigateToPage,
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
  
  const renderAiContent = (content: string) => {
    const markedOptions = {
        gfm: true,
        breaks: true,
    };

    const parts = content.split(/(\[Source:[^\]]+\])/g);
    
    return parts.map((part, index) => {
      if (!part) return null;
      
      const match = part.match(/\[Source:\s*([^\]]+)\]/);
      if (match) {
        const pages = match[1].split(',').map(p => p.trim().replace(/^p/i, '')).map(Number).filter(n => !isNaN(n) && n > 0);
        
        if (pages.length === 0) {
            const html = marked.parse(part, markedOptions);
            return <div key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        
        return (
          <div key={index} className="text-sm mt-2" style={{color: 'var(--text-secondary)'}}>
            Source: {pages.map((page, i) => (
              <React.Fragment key={page}>
                <button
                  onClick={() => onNavigateToPage(page)}
                  className="underline hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded"
                  style={{ color: '#3b82f6'}}
                >
                  p{page}
                </button>
                {i < pages.length - 1 ? ', ' : ''}
              </React.Fragment>
            ))}
          </div>
        );
      }
      
      const html = marked.parse(part, markedOptions);
      return <div key={index} dangerouslySetInnerHTML={{ __html: html }} />;
    });
  };

  if (!isOpen) {
    return null;
  }

  const content = (
    <>
      <style>{`
        .prose-light {
          color: var(--text-primary);
          line-height: 1.6;
        }
        .prose-light > div > *:first-child {
          margin-top: 0;
        }
        .prose-light > div > *:last-child {
          margin-bottom: 0;
        }
        .prose-light p, .prose-light ul, .prose-light ol, .prose-light blockquote, .prose-light pre {
            margin-top: 0.8em;
            margin-bottom: 0.8em;
        }
        .prose-light ul, .prose-light ol {
            list-style-position: outside;
            padding-left: 1.2em;
        }
        .prose-light ul { list-style-type: disc; }
        .prose-light ol { list-style-type: decimal; }
        .prose-light li { margin-bottom: 0.25em; }
        .prose-light a { color: #3b82f6; text-decoration: underline; }
        .prose-light blockquote {
            border-left: 3px solid var(--border-color);
            padding-left: 1em;
            font-style: italic;
            color: var(--text-secondary);
        }
        .prose-light pre {
            background-color: var(--sidebar-bg);
            color: var(--text-light);
            padding: 1em;
            border-radius: 8px;
            overflow-x: auto;
            font-family: monospace;
        }
        .prose-light :not(pre) > code {
            background-color: var(--bg-secondary);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 0.2em 0.4em;
            margin: 0 0.1em;
            font-size: 85%;
            border-radius: 6px;
            font-family: monospace;
        }
      `}</style>
      <div
        className="h-full w-full flex flex-col"
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
                {msg.role === 'user' 
                 ? <div className="whitespace-pre-wrap">{msg.content}</div>
                 : <div className="prose-light max-w-none">{renderAiContent(msg.content)}</div>
                }
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

  return content;
};

export default ChatPanel;
