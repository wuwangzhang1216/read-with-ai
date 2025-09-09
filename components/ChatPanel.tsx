import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChatMessage } from '../types';
import { CloseIcon, SendIcon } from './icons/Icons';
import Spinner from './ui/Spinner';
import MarkdownMessage from './MarkdownMessage';
import AnimatedMessage from './AnimatedMessage';

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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
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
            <AnimatedMessage key={index} delay={index * 100} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-md px-4 py-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : ''}`}
                style={msg.role === 'assistant' ? {backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'} : {}}
              >
                {msg.role === 'user'
                 ? <div className="whitespace-pre-wrap">{msg.content}</div>
                 : <MarkdownMessage content={msg.content} className="prose-light max-w-none" />
                }
              </div>
            </AnimatedMessage>
          ))}
          {isAiThinking && (
            <AnimatedMessage delay={chatHistory.length * 100} className="flex justify-start">
              <div className="max-w-md px-4 py-3 rounded-lg inline-flex" style={{backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)'}}>
                <Spinner className="w-5 h-5" />
              </div>
            </AnimatedMessage>
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

  return (
    <>
      <style>{`
        .prose-light {
          color: var(--text-primary);
          line-height: 1.7;
          font-size: 14px;
        }
        .prose-light > div > *:first-child {
          margin-top: 0;
        }
        .prose-light > div > *:last-child {
          margin-bottom: 0;
        }
        .prose-light p, .prose-light ul, .prose-light ol, .prose-light blockquote, .prose-light pre {
            margin-top: 1em;
            margin-bottom: 1em;
        }
        .prose-light ul, .prose-light ol {
            list-style-position: outside;
            padding-left: 1.4em;
        }
        .prose-light ul { list-style-type: disc; }
        .prose-light ol { list-style-type: decimal; }
        .prose-light li { margin-bottom: 0.3em; }
        .prose-light a { color: #3b82f6; text-decoration: underline; }
        .prose-light blockquote {
            border-left: 4px solid var(--border-color);
            padding-left: 1.2em;
            font-style: italic;
            color: var(--text-secondary);
            background-color: rgba(232, 228, 219, 0.3);
            padding: 1em 1.2em;
            border-radius: 0 8px 8px 0;
            margin: 1.2em 0;
        }
        .prose-light pre {
            background: linear-gradient(135deg, var(--sidebar-bg) 0%, var(--sidebar-bg-lighter) 100%);
            color: var(--text-light);
            padding: 1.2em;
            border-radius: 12px;
            overflow-x: auto;
            font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .prose-light :not(pre) > code {
            background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(232, 228, 219, 0.8) 100%);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 0.25em 0.5em;
            margin: 0 0.1em;
            font-size: 13px;
            border-radius: 6px;
            font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-weight: 500;
        }

        /* Enhanced message bubble styling */
        .message-bubble {
          position: relative;
          transition: all 0.2s ease-out;
        }

        .message-bubble:hover {
          transform: translateY(-1px);
        }

        .message-bubble.user {
          background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(44, 62, 80, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .message-bubble.assistant {
          background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(240, 237, 230, 0.95) 100%);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        /* Enhanced animations */
        .message-enter {
          animation: slideInFade 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideInFade {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Send button with enhanced styling */
        .send-button {
          background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
          transition: all 0.2s ease-out;
          box-shadow: 0 2px 8px rgba(44, 62, 80, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .send-button:hover:not(:disabled) {
          transform: translateY(-1px) scale(1.05);
          box-shadow: 0 4px 12px rgba(44, 62, 80, 0.4);
        }

        .send-button:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }

        .send-button:disabled {
          background: var(--hover-color);
          box-shadow: none;
          border: 1px solid var(--border-color);
        }

        /* Enhanced input styling */
        .chat-input {
          background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(240, 237, 230, 0.95) 100%);
          border: 2px solid var(--border-color);
          transition: all 0.2s ease-out;
          font-size: 14px;
          font-weight: 400;
        }

        .chat-input:focus {
          border-color: #2c3e50;
          box-shadow: 0 0 0 3px rgba(44, 62, 80, 0.1);
          background: linear-gradient(135deg, #ffffff 0%, var(--bg-secondary) 100%);
        }

        .chat-input::placeholder {
          color: var(--text-secondary);
          opacity: 0.7;
        }

        /* Header enhancement */
        .header-icon {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%);
          border: 1px solid rgba(59, 130, 246, 0.2);
        }
      `}</style>
      <div
        className="h-full w-full flex flex-col"
        style={{ backgroundColor: 'var(--bg-primary)'}}
      >
        <header className="flex items-center justify-between p-5 border-b flex-shrink-0" style={{ borderColor: 'var(--border-color)'}}>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>AI Assistant</h2>
          <button onClick={onClose} className="p-2.5 rounded-lg hover:bg-black/5 transition-all duration-200 hover:scale-105" aria-label="Close chat" style={{ color: 'var(--text-secondary)'}}>
            <CloseIcon className="w-5 h-5" />
          </button>
        </header>

        <div ref={chatContainerRef} className="flex-grow p-6 overflow-y-auto space-y-6">
          {chatHistory.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} message-enter`}>
              <div
                className={`w-full px-5 py-4 rounded-2xl message-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}
              >
                {msg.role === 'user'
                 ? <div className="whitespace-pre-wrap text-[15px] leading-relaxed font-medium">{msg.content}</div>
                 : <div className="prose-light max-w-none">{renderAiContent(msg.content)}</div>
                }
              </div>
            </div>
          ))}
          {isAiThinking && (
            <div className="flex justify-start message-enter">
              <div className="w-full px-5 py-4 rounded-2xl message-bubble assistant inline-flex" style={{backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)'}}>
                <Spinner className="w-5 h-5" />
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t flex-shrink-0" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)'}}>
          <div className="flex items-end space-x-3">
            <div className="flex-grow">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about the book..."
                disabled={isAiThinking}
                className="chat-input w-full px-5 py-3.5 border-2 rounded-2xl focus:outline-none transition-all duration-200 text-[14px]"
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isAiThinking}
              className="send-button p-3.5 text-white rounded-2xl disabled:cursor-not-allowed flex-shrink-0"
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
