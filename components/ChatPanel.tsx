import React, { useState, useRef, useEffect } from 'react';
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
  onGoToSource: (sourceId: number) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, chatHistory, onSendMessage, isAiThinking, onGoToSource }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [chatHistory, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isAiThinking) {
      onSendMessage(input.trim());
      setInput('');
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
          className="prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }} 
        />
        {sources.length > 0 && (
          <div className="mt-4 pt-2 border-t border-zinc-700/50 flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-zinc-400 uppercase">Sources:</span>
            {sources.map((match, index) => {
               const sourceIds = match[1].split(',').map(s => parseInt(s.trim(), 10));
               return sourceIds.map(id => (
                  <button
                    key={`${index}-${id}`}
                    onClick={() => onGoToSource(id)}
                    className="px-2 py-0.5 bg-indigo-600/50 text-indigo-300 text-xs font-mono rounded-md hover:bg-indigo-500/70 transition-colors"
                  >
                    {id}
                  </button>
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
      bg-zinc-800/90 backdrop-blur-md border-l border-zinc-700
      flex flex-col shadow-2xl z-20
      transition-transform duration-500 ease-in-out
      ${isOpen ? 'translate-x-0' : 'translate-x-full'}
    `}>
      <header className="flex items-center justify-between p-4 border-b border-zinc-700 flex-shrink-0">
        <h2 className="text-lg font-semibold">AI Assistant</h2>
        <button onClick={onClose} className="p-2 rounded-md hover:bg-zinc-700 transition-colors">
          <CloseIcon className="w-6 h-6" />
        </button>
      </header>
      <div className="flex-grow p-6 overflow-y-auto custom-scrollbar">
        <div className="space-y-6">
          {chatHistory.map((msg, index) => (
            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                  AI
                </div>
              )}
              <div className={`p-4 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-zinc-700 text-zinc-300 rounded-bl-none'}`}>
                 {msg.role === 'assistant' ? parseContent(msg.content) : msg.content}
              </div>
            </div>
          ))}
          {isAiThinking && (
             <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                  AI
                </div>
                <div className="p-4 rounded-2xl bg-zinc-700 text-zinc-300 rounded-bl-none">
                    <div className="flex items-center gap-2">
                        <Spinner/>
                        <span className="text-zinc-400 animate-pulse">Thinking...</span>
                    </div>
                </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="flex-shrink-0 p-4 border-t border-zinc-700">
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="w-full pl-4 pr-12 py-3 bg-zinc-700 border border-zinc-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all duration-200"
            disabled={isAiThinking}
          />
          <button
            type="submit"
            disabled={!input.trim() || isAiThinking}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-zinc-600 disabled:cursor-not-allowed transition-colors"
          >
            <SendIcon />
          </button>
        </form>
      </div>
       <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 8px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #4f4f52; border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6f6f72; }
          .prose-invert { color: #d1d5db; }
          .prose-invert p, .prose-invert ul, .prose-invert ol, .prose-invert li, .prose-invert strong, .prose-invert blockquote { color: #d1d5db; }
          .prose-invert a { color: #a5b4fc; text-decoration: underline; }
          .prose-invert a:hover { color: #c7d2fe; }
          .prose-invert p { margin-top: 0; margin-bottom: 1rem; line-height: 1.6; }
          .prose-invert ul, .prose-invert ol { margin: 1rem 0; padding-left: 1.5em; }
          .prose-invert ul { list-style-type: disc; }
          .prose-invert ol { list-style-type: decimal; }
          .prose-invert li { margin: 0.25rem 0; }
          .prose-invert li::marker { color: #6b7280; }
          .prose-invert code {
            background-color: #374151; color: #e5e7eb; padding: 0.2em 0.4em; margin: 0 0.1em;
            border-radius: 6px; font-size: 0.9em;
          }
          .prose-invert pre {
            background-color: #1f2937; border: 1px solid #4b5563; color: #e5e7eb; 
            padding: 1em; border-radius: 8px; overflow-x: auto; margin: 1rem 0;
          }
          .prose-invert pre code { background-color: transparent; padding: 0; margin: 0; font-size: 1em; }
          .prose-invert blockquote {
            border-left: 4px solid #6b7280; padding-left: 1em; margin-left: 0;
            font-style: italic; color: #9ca3af;
          }
          .prose-invert > :first-child { margin-top: 0; }
          .prose-invert > :last-child { margin-bottom: 0; }
      `}</style>
    </div>
  );
};

export default ChatPanel;