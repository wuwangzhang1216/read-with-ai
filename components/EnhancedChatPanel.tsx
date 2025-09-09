import React, { useRef, useEffect, useState } from 'react';
import { ChatMessage } from '../types';
import { CloseIcon, SendIcon, ChevronDownIcon, ChevronRightIcon } from './icons/Icons';
import Spinner from './ui/Spinner';
import { ThoughtProcess, ToolUse } from '../services/enhancedRagService';
import MarkdownMessage from './MarkdownMessage';
import AnimatedMessage from './AnimatedMessage';

export interface EnhancedChatMessage extends ChatMessage {
  thoughts?: ThoughtProcess[];
  toolUses?: ToolUse[];
}

interface EnhancedChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chatHistory: EnhancedChatMessage[];
  onSendMessage: (message: string) => void;
  isAiThinking: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onNavigateToPage: (page: number) => void;
  currentThoughts?: ThoughtProcess[];
  currentToolUses?: ToolUse[];
  messageReceived?: boolean;
  currentProgress?: string;
}

const ThinkingIndicator: React.FC<{
  thoughts: ThoughtProcess[],
  toolUses: ToolUse[],
  messageReceived: boolean,
  progress: string
}> = ({ thoughts, toolUses, messageReceived, progress }) => {
  const [expanded, setExpanded] = useState(true);
  const latestThought = thoughts[thoughts.length - 1];
  const latestTool = toolUses[toolUses.length - 1];

  return (
    <div className="message-bubble assistant w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
               style={{ backgroundColor: 'rgba(44, 62, 80, 0.1)', color: '#2c3e50' }}>
            <Spinner className="w-4 h-4 thinking-pulse" />
            <span>
              {messageReceived ? "Message received..." :
               progress || (latestThought ? latestThought.stage : "Thinking...")}
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-lg hover:bg-black/5 transition-all duration-200 hover:scale-105"
          style={{ color: 'var(--text-secondary)' }}
        >
          {expanded ?
            <ChevronDownIcon className="w-4 h-4" /> :
            <ChevronRightIcon className="w-4 h-4" />
          }
        </button>
      </div>

      {expanded && (
        <div className="space-y-4">
          {thoughts.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                Reasoning Process
              </h4>
              <div className="space-y-3">
                {thoughts.map((thought, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg"
                       style={{ backgroundColor: 'rgba(232, 228, 219, 0.4)' }}>
                    <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                         style={{ backgroundColor: '#2c3e50' }}></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                        {thought.stage}
                      </div>
                      <div className="text-sm opacity-80" style={{ color: 'var(--text-secondary)' }}>
                        {thought.thought}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {toolUses.length > 0 && (
            <div className="pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                Tools Used
              </h4>
              <div className="space-y-2">
                {toolUses.map((tool, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg"
                       style={{ backgroundColor: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                    <div className="px-3 py-1 rounded-full text-xs font-medium"
                         style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                      {tool.toolName}
                    </div>
                    {tool.output && (
                      <div className="text-xs opacity-70" style={{ color: 'var(--text-secondary)' }}>
                        {tool.output.documentsFound && `Found ${tool.output.documentsFound} passages`}
                        {tool.output.queries && `Generated ${tool.output.queries.length} queries`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MessageWithProcess: React.FC<{
  message: EnhancedChatMessage,
  onNavigateToPage: (page: number) => void
}> = ({ message, onNavigateToPage }) => {
  const [showProcess, setShowProcess] = useState(false);


  return (
    <div>
      {message.thoughts && message.thoughts.length > 0 && (
        <button
          onClick={() => setShowProcess(!showProcess)}
          className="inline-flex items-center gap-2 text-sm opacity-70 hover:opacity-100 mb-4 px-3 py-2 rounded-lg transition-all duration-200 hover:scale-[1.02]"
          style={{ color: 'var(--text-secondary)', backgroundColor: 'rgba(44, 62, 80, 0.08)' }}
        >
          {showProcess ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
          <span className="font-medium">View reasoning process</span>
        </button>
      )}

      {showProcess && message.thoughts && (
        <div className="mb-4 p-4 rounded-xl text-sm" style={{
          backgroundColor: 'rgba(34, 197, 94, 0.05)',
          border: '1px solid rgba(34, 197, 94, 0.2)'
        }}>
          <div className="font-semibold mb-3 flex items-center gap-2" style={{ color: '#2c3e50' }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#2c3e50' }}></div>
            Reasoning Process
          </div>
          <div className="space-y-2">
            {message.thoughts.map((thought, idx) => (
              <div key={idx} className="flex items-start gap-3 p-2 rounded-md"
                   style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                <span className="text-xs font-medium opacity-70 mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <div className="font-medium text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                    {thought.stage}
                  </div>
                  <div className="text-sm opacity-80" style={{ color: 'var(--text-secondary)' }}>
                    {thought.thought}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {message.toolUses && message.toolUses.length > 0 && (
            <div className="mt-4 pt-3 border-t" style={{ borderColor: 'rgba(34, 197, 94, 0.2)' }}>
              <div className="font-semibold mb-2 flex items-center gap-2" style={{ color: '#2c3e50' }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#2c3e50' }}></div>
                Tools Used
              </div>
              <div className="space-y-2">
                {message.toolUses.map((tool, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-md"
                       style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                      {tool.toolName}
                    </span>
                    {tool.output?.documentsFound && (
                      <span className="text-xs opacity-70" style={{ color: 'var(--text-secondary)' }}>
                        {tool.output.documentsFound} results
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="prose-light max-w-none">
        <MarkdownMessage content={message.content} />
      </div>
    </div>
  );
};

const EnhancedChatPanel: React.FC<EnhancedChatPanelProps> = ({
  isOpen,
  onClose,
  chatHistory,
  onSendMessage,
  isAiThinking,
  inputValue,
  onInputChange,
  onNavigateToPage,
  currentThoughts = [],
  currentToolUses = [],
  messageReceived = false,
  currentProgress = "",
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
  }, [chatHistory, isAiThinking, currentThoughts]);

  const handleSendMessage = () => {
    if (inputValue.trim() && !isAiThinking) {
      // Immediate visual feedback
      const trimmedMessage = inputValue.trim();
      onInputChange(''); // Clear input immediately
      onSendMessage(trimmedMessage);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        .prose-light {
          color: var(--text-primary);
          line-height: 1.7;
          font-size: 14px;
        }
        .prose-light > * > *:first-child { margin-top: 0; }
        .prose-light > * > *:last-child { margin-bottom: 0; }
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

        /* Animation for thinking indicator */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .thinking-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        /* Enhanced message animations */
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

        /* Message received animation */
        @keyframes messageReceived {
          0% { opacity: 0; transform: translateY(15px) scale(0.9); }
          50% { opacity: 1; transform: translateY(-3px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        .message-received {
          animation: messageReceived 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* Progress text animation */
        .progress-text {
          transition: all 0.3s ease-out;
          font-weight: 500;
        }

        /* Header icon enhancement */
        .header-icon {
          background: linear-gradient(135deg, rgba(44, 62, 80, 0.1) 0%, rgba(44, 62, 80, 0.05) 100%);
          border: 1px solid rgba(44, 62, 80, 0.2);
        }
      `}</style>

      <div className="h-full w-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <header className="flex items-center justify-between p-5 border-b flex-shrink-0"
                style={{ borderColor: 'var(--border-color)', background: 'linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)' }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center header-icon">
              <svg className="w-7 h-7" style={{ color: '#2c3e50' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>
                AI Reading Assistant
              </h2>
              <p className="text-sm opacity-70 font-medium" style={{ color: 'var(--text-secondary)' }}>
                Enhanced RAG with LangChain
              </p>
            </div>
          </div>
          <button onClick={onClose}
                  className="p-2.5 rounded-lg hover:bg-black/5 transition-all duration-200 hover:scale-105"
                  aria-label="Close chat"
                  style={{ color: 'var(--text-secondary)' }}>
            <CloseIcon className="w-5 h-5" />
          </button>
        </header>

        <div ref={chatContainerRef} className="flex-grow p-6 overflow-y-auto space-y-6">
          {chatHistory.map((msg, index) => (
            <AnimatedMessage key={index} delay={index * 150} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} ${msg.role === 'user' && index === chatHistory.length - 1 && messageReceived ? 'message-received' : ''}`}>
              <div className={`w-full px-5 py-4 rounded-2xl message-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed font-medium">{msg.content}</div>
                ) : (
                  <div className="prose-light">
                    <MessageWithProcess message={msg} onNavigateToPage={onNavigateToPage} />
                  </div>
                )}
              </div>
            </AnimatedMessage>
          ))}

          {isAiThinking && (
            <AnimatedMessage delay={chatHistory.length * 150} className="flex justify-start">
              <div className="w-full">
                <ThinkingIndicator
                  thoughts={currentThoughts}
                  toolUses={currentToolUses}
                  messageReceived={messageReceived}
                  progress={currentProgress}
                />
              </div>
            </AnimatedMessage>
          )}
        </div>

        <div className="p-5 border-t flex-shrink-0"
             style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-end space-x-3">
            <div className="flex-grow">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the book... (Press Enter to send)"
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
          {isAiThinking && currentProgress && (
            <div className="mt-3 text-sm opacity-70 text-center progress-text font-medium"
                 style={{ color: 'var(--text-secondary)' }}>
              {currentProgress}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default EnhancedChatPanel;

// Export additional icons that are used
export const ChevronDownIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

export const ChevronRightIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);
