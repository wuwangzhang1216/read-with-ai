import React, { useRef, useEffect, useState } from 'react';
import { ChatMessage } from '../types';
import { CloseIcon, SendIcon, ChevronDownIcon, ChevronRightIcon, EditIcon } from './icons/Icons';
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
  onResendEdited: (message: string) => void;
  isAiThinking: boolean;
  hasStreamStarted?: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onNavigateToPage: (page: number) => void;
  currentThoughts?: ThoughtProcess[];
  currentToolUses?: ToolUse[];
  messageReceived?: boolean;
  currentProgress?: string;
  // Thread tabs
  threads: { id: string; title: string }[];
  activeThreadId: string;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onCloseThread?: (id: string) => void;
  // Edit & resend
  editingIndex: number | null;
  onStartEditMessage: (index: number, content: string) => void;
  onCancelEdit: () => void;
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
  const activeIndex = Math.max(0, thoughts.length - 1);
  return (
    <div className="message-bubble assistant w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
             style={{ backgroundColor: 'rgba(44, 62, 80, 0.08)', color: '#2c3e50' }}>
          <Spinner className="w-4 h-4 thinking-pulse" />
          <span className="flex items-center gap-1">
            {messageReceived ? 'Message received' : (progress || (latestThought ? latestThought.stage : 'Thinking'))}
            <span className="codex-caret" aria-hidden> </span>
          </span>
          {thoughts.length > 0 && (
            <span className="opacity-70 ml-1">· Step {activeIndex + 1}</span>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-lg hover:bg-black/5 transition-all duration-200 hover:scale-105"
          style={{ color: 'var(--text-secondary)' }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronDownIcon className="w-4 h-4" />
          ) : (
            <ChevronRightIcon className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Codex-like token stream */}
      <div className="codex-stream mb-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="bar" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>

      {expanded && (
        <div className="space-y-3">
          {thoughts.length > 0 && (
            <ReasoningSteps thoughts={thoughts} activeIndex={activeIndex} />
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
          className="inline-flex items-center gap-2 text-sm opacity-80 hover:opacity-100 mb-3 px-3 py-2 rounded-md transition-all duration-200"
          style={{ color: 'var(--text-secondary)', backgroundColor: 'rgba(44, 62, 80, 0.08)' }}
        >
          {showProcess ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
          <span className="font-medium">Reasoning Process</span>
        </button>
      )}

      {showProcess && message.thoughts && (
        <div className="mb-4 p-4 rounded-xl text-sm" style={{ backgroundColor: 'rgba(240, 237, 230, 0.6)', border: '1px solid var(--border-color)' }}>
          <ReasoningSteps thoughts={message.thoughts} />
          {/* Tools UI removed per request */}
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
  onResendEdited,
  isAiThinking,
  inputValue,
  onInputChange,
  onNavigateToPage,
  currentThoughts = [],
  currentToolUses = [],
  messageReceived = false,
  currentProgress = "",
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onCloseThread,
  editingIndex,
  onStartEditMessage,
  onCancelEdit,
  hasStreamStarted = false,
}) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const [autoStickToBottom, setAutoStickToBottom] = useState(false);
  const programmaticScrollUntilRef = useRef<number>(0);
  const wasAtBottomRef = useRef<boolean>(false);
  const lastLenRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(0);
  const [hasInitialized, setHasInitialized] = useState(false);
  // Track length of currently streaming assistant message to detect token appends
  const streamingContentLen = React.useMemo(() => {
    const last = chatHistory[chatHistory.length - 1];
    if (last && last.role === 'assistant' && typeof last.content === 'string') {
      return last.content.length;
    }
    return 0;
  }, [chatHistory]);

  const scrollToBottom = (smooth: boolean = false, force: boolean = false) => {
    const el = chatContainerRef.current;
    if (!el) return;

    // Skip if user has scrolled up and we're not forcing
    if (!force && !autoStickToBottom) return;

    // Check if already at bottom (within 20px threshold)
    const threshold = 20;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

    // Only scroll if not already at bottom or if forced
    if (!atBottom || force) {
      programmaticScrollUntilRef.current = Date.now() + 500; // ignore scroll events briefly
      // Primary: scroll sentinel into view within container
      endOfMessagesRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
      // Fallback: directly set container scroll position next frame
      requestAnimationFrame(() => {
        try {
          el.scrollTop = el.scrollHeight;
        } catch {}
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      // Reset initialization state when panel opens or thread changes
      setHasInitialized(false);
    }
  }, [isOpen, activeThreadId]);

  // After user sends a message and AI starts thinking, make sure the
  // thinking indicator at the bottom is visible and enable stickiness
  useEffect(() => {
    if (!isOpen) return;
    if (isAiThinking && !hasStreamStarted) {
      scrollToBottom(false, true);
      setAutoStickToBottom(true);
    }
  }, [isAiThinking, hasStreamStarted, isOpen]);

  // Listen for streaming scroll events from Reader component
  useEffect(() => {
    const handleStreamScroll = () => {
      if (isOpen) {
        scrollToBottom(false, true); // Force scroll when explicitly requested
      }
    };

    window.addEventListener('streamScrollToBottom', handleStreamScroll);
    return () => window.removeEventListener('streamScrollToBottom', handleStreamScroll);
  }, [isOpen]);

  // When streaming starts, enable auto-stick-to-bottom if user is at bottom
  useEffect(() => {
    if (hasStreamStarted && isOpen) {
      const el = chatContainerRef.current;
      if (el) {
        const threshold = 20;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
        if (atBottom) {
          setAutoStickToBottom(true);
          wasAtBottomRef.current = true;
        }
      }
    }
  }, [hasStreamStarted, isOpen]);

  // Handle initial loading and delayed scroll to bottom
  useEffect(() => {
    if (!isOpen || hasInitialized) return;

    // If there are chat messages, wait for them to render, then scroll to bottom
    if (chatHistory.length > 0) {
      // Wait for content to render, then smoothly scroll to bottom
      const timer = setTimeout(() => {
        scrollToBottom(true);
        setAutoStickToBottom(true); // Enable auto-stick for future messages
        setHasInitialized(true);
      }, 300); // Reduced delay for better responsiveness

      return () => clearTimeout(timer);
    } else {
      // No chat history, just mark as initialized
      setHasInitialized(true);
    }
  }, [isOpen, chatHistory.length, hasInitialized, activeThreadId]);

  const handleScrollContainer = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    if (Date.now() < programmaticScrollUntilRef.current) return;

    // More precise bottom detection
    const threshold = 20; // px from bottom considered as "at bottom"
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    const wasAtBottom = wasAtBottomRef.current;

    // Update auto-stick state
    setAutoStickToBottom(atBottom);
    wasAtBottomRef.current = atBottom;

    // If user just scrolled to bottom, ensure we stay there during streaming
    if (atBottom && !wasAtBottom && hasStreamStarted) {
      scrollToBottom(false, true);
    }
  };

  // Helper function to check if user is at bottom
  const isAtBottom = () => {
    const el = chatContainerRef.current;
    if (!el) return false;
    const threshold = 20;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  };

  // Handle user interaction that should disable auto-stick-to-bottom
  const handleUserInteraction = () => {
    setAutoStickToBottom(false);
  };

  // Handle scrolling when new messages are added
  useEffect(() => {
    if (!isOpen) return;

    const len = chatHistory.length;
    const prevLen = lastLenRef.current;

    // Only trigger scroll when new messages are added
    if (len > prevLen) {
      const lastMessage = chatHistory[chatHistory.length - 1];

      // Skip scroll if the last assistant message is empty and stream hasn't started
      const shouldSkipScroll = lastMessage?.role === 'assistant' &&
                             (!lastMessage.content || lastMessage.content.length === 0) &&
                             !hasStreamStarted;

      if (!shouldSkipScroll) {
        // Use instant scroll during streaming to avoid jitter, smooth scroll otherwise
        scrollToBottom(!hasStreamStarted, true); // Force scroll for new messages
      }
    }

    lastLenRef.current = len;
  }, [chatHistory.length, isOpen, hasStreamStarted]);

  // Handle streaming content updates - scroll if we're at bottom
  useEffect(() => {
    if (!isOpen || !hasStreamStarted) return;
    // Only auto-scroll while user is at (or sticking to) bottom
    const el = chatContainerRef.current;
    const userAtBottom = autoStickToBottom || (el ? (el.scrollHeight - el.scrollTop - el.clientHeight <= 20) : false);
    if (!userAtBottom) return;

    const scrollTimer = setTimeout(() => {
      scrollToBottom(false, true);
    }, 10);
    return () => clearTimeout(scrollTimer);
  }, [streamingContentLen, isOpen, hasStreamStarted, autoStickToBottom]);

  // Observe whether the bottom sentinel is visible within the container
  useEffect(() => {
    const root = chatContainerRef.current;
    const target = endOfMessagesRef.current;
    if (!root || !target) return;

    const io = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (!entry) return;
      if (Date.now() < programmaticScrollUntilRef.current) return;

      const atBottom = entry.isIntersecting;
      const wasAtBottom = wasAtBottomRef.current;

      setAutoStickToBottom(atBottom);
      wasAtBottomRef.current = atBottom;

      // If user just scrolled to bottom, ensure we stay there during streaming
      if (atBottom && !wasAtBottom && hasStreamStarted) {
        scrollToBottom(false, true);
      }
    }, {
      root,
      threshold: 0.99,
      rootMargin: '0px 0px -20px 0px' // Consider 20px above bottom as "at bottom"
    });

    io.observe(target);
    return () => io.disconnect();
  }, [isOpen, hasStreamStarted]);

  // This useEffect is now handled by the main scroll logic above

  // Stream start scrolling is now handled by the main scroll logic above

  const handleSendMessage = () => {
    if (inputValue.trim() && !isAiThinking) {
      // Immediate visual feedback
      const trimmedMessage = inputValue.trim();
      onInputChange(''); // Clear input immediately
      if (editingIndex !== null && editingIndex >= 0) {
        onResendEdited(trimmedMessage);
      } else {
        onSendMessage(trimmedMessage);
      }
      // Ensure view is pinned to the bottom to show thinking indicator
      requestAnimationFrame(() => scrollToBottom(false, true));
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
        /* Ensure AI response text is selectable */
        .prose-light, .prose-light * {
          -webkit-user-select: text;
          -moz-user-select: text;
          -ms-user-select: text;
          user-select: text;
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
          transition: box-shadow 0.2s ease-out;
        }

        /* Only nudge user bubbles on hover; keep assistant stable for reliable selection */
        .message-bubble.user:hover {
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
        /* Explicitly allow text selection inside assistant bubbles */
        .message-bubble.assistant, 
        .message-bubble.assistant *,
        .message-bubble.assistant *::before,
        .message-bubble.assistant *::after,
        .enhanced-chat-panel .prose-light,
        .enhanced-chat-panel .prose-light *,
        .enhanced-chat-panel .markdown-message,
        .enhanced-chat-panel .markdown-message * {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
          pointer-events: auto !important;
          -webkit-touch-callout: default !important;
        }

        /* Animation for thinking indicator */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .thinking-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        /* Codex-style caret and token stream */
        @keyframes caretBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        .codex-caret {
          width: 8px;
          height: 1.1em;
          border-left: 2px solid #2c3e50;
          display: inline-block;
          animation: caretBlink 1s steps(1) infinite;
          transform: translateY(1px);
        }
        .codex-stream { display: flex; align-items: center; gap: 6px; padding: 0 2px; }
        .codex-stream .bar {
          width: 6px; height: 10px; border-radius: 2px;
          background: linear-gradient(180deg, #2c3e50 0%, #8aa0b4 100%);
          opacity: 0.6;
          animation: streamPulse 900ms ease-in-out infinite;
        }
        @keyframes streamPulse {
          0%, 100% { transform: scaleY(0.6); opacity: 0.4; }
          50% { transform: scaleY(1.2); opacity: 1; }
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

        /* Minimal step-by-step reasoning timeline */
        .steps {
          position: relative;
        }
        .step-item {
          display: grid;
          grid-template-columns: 20px 1fr;
          gap: 10px;
          align-items: start;
          opacity: 0;
          transform: translateY(6px);
          animation: fadeInUp 300ms ease forwards;
        }
        .step-dot {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          margin-top: 6px;
          background-color: var(--border-color);
        }
        .step-item.active .step-dot { background-color: #2c3e50; }
        .step-item.complete .step-dot { background-color: #2c3e50; opacity: 0.6; }
        .step-line {
          grid-column: 1 / 2;
          width: 2px;
          background-color: var(--border-color);
          justify-self: center;
        }
        .step-title { font-weight: 600; color: var(--text-primary); }
        .step-sub { color: var(--text-secondary); opacity: 0.9; }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Reserved for future exit animations */

        /* Compact icon buttons (Codex-like) */
        .icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background: rgba(255,255,255,0.16);
          color: var(--text-secondary);
          transition: background 120ms ease, transform 120ms ease, opacity 120ms ease;
        }
        .icon-btn:hover { background: rgba(0,0,0,0.06); }
        .icon-btn.primary {
          background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .icon-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
      <style>{`
        /* Edit area default (light) */
        .edit-textarea {
          background: transparent;
          border: 2px solid var(--border-color);
          color: var(--text-primary);
          resize: vertical;
          outline: none;
          box-shadow: none;
          font-family: inherit;
        }
        .edit-textarea::placeholder { color: var(--text-secondary); opacity: 0.8; }
        .edit-badge { background-color: rgba(44,62,80,0.08); border: 1px solid var(--border-color); color: var(--text-primary); }

        /* Dark user bubble overrides for readability */
        .message-bubble.user .edit-textarea {
          background: rgba(255,255,255,0.10);
          border-color: rgba(255,255,255,0.28);
          color: #ffffff;
        }
        .message-bubble.user .edit-textarea::placeholder { color: rgba(255,255,255,0.75); }
        .message-bubble.user .edit-toolbar .icon-btn { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.28); color: #ffffff; }
        .message-bubble.user .edit-badge { background-color: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.28); color: #ffffff; }
        .message-bubble.user .icon-btn { color: #ffffff; border-color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.12); }
        .message-bubble.user .icon-btn.primary { background: linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.18) 100%); color: #1e293b; border-color: rgba(255,255,255,0.35); }
        .message-bubble.user .edit-hint { color: rgba(255,255,255,0.75) !important; }
      `}</style>

      <div className="enhanced-chat-panel h-full w-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
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
        {/* Thread Tabs */}
        <div className="flex items-center px-3 py-2 border-b gap-2 overflow-x-auto"
             style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
          {threads.map((t) => {
            const isActive = t.id === activeThreadId;
            return (
              <div key={t.id}
                   className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer whitespace-nowrap transition-all ${isActive ? 'shadow-sm' : ''}`}
                   onClick={() => onSelectThread(t.id)}
                   style={{
                     backgroundColor: isActive ? 'rgba(44,62,80,0.1)' : 'transparent',
                     border: '1px solid var(--border-color)',
                     color: 'var(--text-primary)'
                   }}>
                <span className="text-sm font-medium max-w-[160px] truncate">{t.title || 'New Chat'}</span>
                {onCloseThread && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCloseThread(t.id); }}
                    className="p-1 rounded hover:bg-black/5"
                    title="Close thread"
                    aria-label="Close thread"
                    style={{ color: 'var(--text-secondary)' }}>
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={onNewThread}
            className="ml-1 px-2 py-1.5 rounded-lg border text-sm flex items-center gap-1 hover:bg-black/5"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            title="New chat"
            aria-label="Create new chat thread"
          >
            <span className="text-base leading-none">＋</span>
            <span className="hidden sm:inline">New</span>
          </button>
        </div>

        <div
          ref={chatContainerRef}
          onScroll={handleScrollContainer}
          onWheel={handleUserInteraction}
          onMouseDown={handleUserInteraction}
          onTouchStart={handleUserInteraction}
          onKeyDownCapture={(e) => {
            const keys = ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'Space'];
            if (keys.includes(e.key)) setAutoStickToBottom(false);
          }}
          className="flex-grow p-6 overflow-y-auto space-y-6"
        >
          {chatHistory.map((msg, index) => (
            (msg.role === 'assistant' && index === chatHistory.length - 1 && (!msg.content || msg.content.length === 0) && isAiThinking && !hasStreamStarted)
              ? null :
            <AnimatedMessage
              key={index}
              delay={index === chatHistory.length - 1 ? 50 : 0}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} ${msg.role === 'user' && index === chatHistory.length - 1 && messageReceived ? 'message-received' : ''}`}
            >
              <div className={`w-full px-5 py-4 rounded-2xl message-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                {msg.role === 'user' ? (
                  editingIndex === index ? (
                    <div className="group/edit relative edit-area">
                      <div className="flex items-center justify-between mb-2 edit-toolbar">
                        <span className="text-[11px] px-2 py-0.5 rounded-full edit-badge">正在编辑</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={onCancelEdit}
                            className="icon-btn"
                            aria-label="取消编辑"
                            title="Esc 取消"
                          >
                            <CloseIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            disabled={!inputValue.trim() || isAiThinking}
                            onClick={() => onResendEdited(inputValue.trim())}
                            className="icon-btn primary"
                            aria-label="保存并重发"
                            title="Ctrl/⌘ + Enter 重发"
                          >
                            <SendIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={inputValue}
                        onChange={(e) => onInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault();
                            if (inputValue.trim()) onResendEdited(inputValue.trim());
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            onCancelEdit();
                          }
                        }}
                        className="w-full rounded-xl px-4 py-3 text-[15px] edit-textarea"
                        rows={Math.min(8, Math.max(2, Math.ceil((inputValue?.length || 0) / 40)))}
                        placeholder="编辑此消息…"
                        autoFocus
                      />
                      <div className="mt-1 text-[11px] opacity-70 text-right edit-hint">Ctrl/⌘ + Enter 重发 · Esc 取消</div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="whitespace-pre-wrap text-[15px] leading-relaxed font-medium">{msg.content}</div>
                      <div className="absolute -top-2 -right-2">
                        <button
                          disabled={isAiThinking}
                          onClick={() => onStartEditMessage(index, msg.content)}
                          className="icon-btn"
                          style={{ cursor: isAiThinking ? 'not-allowed' : 'pointer' }}
                          title="编辑并重发"
                          aria-label="Edit and resend"
                        >
                          <EditIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="prose-light">
                    <MessageWithProcess message={msg} onNavigateToPage={onNavigateToPage} />
                  </div>
                )}
              </div>
            </AnimatedMessage>
          ))}
          {isAiThinking && !hasStreamStarted && (
            <AnimatedMessage delay={0} className="flex justify-start">
              <div className="w-full">
                <ThinkingIndicator
                  thoughts={currentThoughts}
                  toolUses={currentToolUses}
                  messageReceived={messageReceived}
                  progress={currentProgress || ''}
                />
              </div>
            </AnimatedMessage>
          )}
          <div ref={endOfMessagesRef} />
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
                placeholder={editingIndex !== null ? "编辑消息后回车重发..." : "Ask about the book... (Press Enter to send)"}
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
          {/* Inline editing provides its own toolbar; bottom banner removed for cleaner design */}
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

// Icons are imported from './icons/Icons'

// Minimal, Codex-like step timeline for reasoning
const ReasoningSteps: React.FC<{ thoughts: ThoughtProcess[]; activeIndex?: number }> = ({ thoughts, activeIndex }) => {
  const last = typeof activeIndex === 'number' ? activeIndex : thoughts.length - 1;
  return (
    <div className="steps">
      {thoughts.map((t, idx) => (
        <div
          key={idx}
          className={`step-item ${idx === last ? 'active' : idx < last ? 'complete' : ''}`}
          style={{ animationDelay: `${idx * 80}ms` }}
        >
          <div>
            <div className="step-dot" />
            {idx < thoughts.length - 1 && (
              <div className="step-line" style={{ height: 22 }} />
            )}
          </div>
          <div>
            <div className="step-title text-sm">{`${idx + 1}. ${t.stage}`}</div>
            <div className="step-sub text-sm">{t.thought}</div>
          </div>
        </div>
      ))}
    </div>
  );
};
