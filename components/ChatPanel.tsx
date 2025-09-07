import React, { useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { SendIcon, CloseIcon } from './icons/Icons';
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
}

const ChatPanel: React.FC<ChatPanelProps> = ({ 
  isOpen, 
  onClose, 
  chatHistory, 
  onSendMessage, 
  isAiThinking, 
  inputValue,
  onInputChange
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [chatHistory, isOpen]);
  
    useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      if(inputValue) {
        const len = inputValue.length;
        inputRef.current?.setSelectionRange(len, len);
      }
    }
  }, [isOpen, inputValue]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isAiThinking) {
      onSendMessage(inputValue.trim());
      onInputChange('');
    }
  };
  
  const parseContent = (content: string) => {
    const sourceRegex = /\[Source: (\d+(?:,\s*\d+)*)\]/g;
    const sources = [...content.matchAll(sourceRegex)];
    const textOnly = content.replace(sourceRegex, '').trim();

    const htmlContent = marked.parse(textOnly);

    return (
      <>
        <div 
          className="prose prose-light max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }} 
        />
        {sources.length > 0 && (
          <div className="mt-4 pt-3 border-t flex flex-wrap gap-2 items-center" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <span className="text-xs font-semibold uppercase" style={{ color: 'rgba(255,255,255,0.6)' }}>Sources:</span>
            {sources.map((match, index) => {
               const sourceIds = match[1].split(',').map(s => parseInt(s.trim(), 10));
               return sourceIds.map(id => (
                  <span
                    key={`${index}-${id}`}
                    className="px-2 py-0.5 text-xs font-mono rounded-md"
                    style={{ backgroundColor: 'rgba(250, 248, 243, 0.1)', color: 'var(--text-light)'}}
                  >
                    p.{id}
                  </span>
               ));
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <div className={`
      absolute top-0 right-0 h-full w-full max-w-md
      border-l
      flex flex-col shadow-2xl z-40
      transition-all duration-300 ease-in-out
      ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}
    `} style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--border-color)' }}>
      <header className="flex items-center justify-between p-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-light)' }}>AI Assistant</h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors" style={{ color: 'var(--text-light)' }}>
          <CloseIcon className="w-6 h-6" />
        </button>
      </header>
      <div className="flex-grow p-6 overflow-y-auto custom-scrollbar">
        <div className="space-y-6">
          {chatHistory.map((msg, index) => (
            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                 <div className="w-8 h-8 flex-shrink-0 rounded-full bg-black flex items-center justify-center text-white font-bold text-sm" style={{ background: 'var(--text-primary)'}}>
                  AI
                </div>
              )}
              <div className={`p-3 rounded-2xl max-w-[85%]`} style={{
                backgroundColor: msg.role === 'user' ? 'var(--accent-red)' : 'var(--sidebar-bg-lighter)',
                color: 'var(--text-light)',
                borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
                borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '16px',
              }}>
                 {msg.role === 'assistant' ? parseContent(msg.content) : msg.content}
              </div>
            </div>
          ))}
          {isAiThinking && (
             <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex-shrink-0 rounded-full bg-black flex items-center justify-center text-white font-bold text-sm" style={{ background: 'var(--text-primary)'}}>
                  AI
                </div>
                <div className="p-3 rounded-2xl rounded-bl-none" style={{ backgroundColor: 'var(--sidebar-bg-lighter)' }}>
                    <div className="flex items-center gap-2">
                        <Spinner className="w-5 h-5 text-white/70" />
                        <span className="animate-pulse" style={{ color: 'rgba(255,255,255,0.7)' }}>Thinking...</span>
                    </div>
                </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="flex-shrink-0 p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask a question, or paste text..."
            className="w-full pl-4 pr-12 py-2.5 border rounded-lg outline-none transition-all duration-200 resize-none focus:ring-2"
            style={{ 
              backgroundColor: 'var(--sidebar-bg-lighter)',
              borderColor: 'rgba(255,255,255,0.1)',
              color: 'var(--text-light)',
              '--ring-color': 'var(--accent-red)',
            } as React.CSSProperties}
            onFocus={(e) => e.target.style.borderColor = 'var(--ring-color)'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            disabled={isAiThinking}
            rows={1}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isAiThinking}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-white transition-colors disabled:opacity-50"
             style={{ backgroundColor: 'var(--accent-red)' }}
             onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-red-hover)'}
             onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-red)'}
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </form>
      </div>
       <style>{`
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #C7C7CC; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #999999; }
          .prose-light { color: var(--text-light); }
          .prose-light p, .prose-light ul, .prose-light ol, .prose-light li, .prose-light strong, .prose-light blockquote { color: var(--text-light); }
          .prose-light a { color: var(--hover-color); }
          .prose-light p { margin-top: 0; margin-bottom: 0.5rem; line-height: 1.6; }
          .prose-light ul, .prose-light ol { margin: 0.5rem 0; padding-left: 1.5em; }
          .prose-light > :first-child { margin-top: 0; }
          .prose-light > :last-child { margin-bottom: 0; }
      `}</style>
    </div>
  );
};

export default ChatPanel;