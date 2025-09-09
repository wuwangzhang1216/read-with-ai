import React, { useState, useEffect, useRef } from 'react';
import { Book, ChatMessage } from '../types';
import { BackIcon, ChatIcon } from './icons/Icons';
import EnhancedChatPanel, { EnhancedChatMessage } from './EnhancedChatPanel';
import * as enhancedRagService from '../services/enhancedRagService';
import * as dbService from '../services/dbService';
import SelectionPopup from './SelectionPopup';
import PdfJsViewer from './PdfJsViewer';
import { createPortal } from 'react-dom';
import { ThoughtProcess, ToolUse } from '../services/enhancedRagService';

interface ReaderProps {
  book: Book;
  onBackToLibrary: () => void;
}

type SelectionAction = 'ask' | 'summarize' | 'explain';

interface ChatThread {
  id: string;
  title: string;
  messages: EnhancedChatMessage[];
  createdAt: number;
  bookId: string;
}

type ThreadEphemeralState = {
  inputValue: string;
  isAiThinking: boolean;
  currentThoughts: ThoughtProcess[];
  currentToolUses: ToolUse[];
  currentProgress: string;
  messageReceived: boolean;
  editingIndex: number | null;
};

const Reader: React.FC<ReaderProps> = ({ book, onBackToLibrary }) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [threadStates, setThreadStates] = useState<Record<string, ThreadEphemeralState>>({});
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  // Per-thread ephemeral state is tracked in threadStates
  const viewerRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const selectedTextRef = useRef('');
  const [selectionPopup, setSelectionPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
  }>({ visible: false, x: 0, y: 0, text: '' });

  // Normalize selected text to better match visual selection
  const normalizeSelectedText = (s: string) => {
    if (!s) return s;
    let t = s.replace(/\r/g, '');
    // Join hyphenated line-breaks like "exam-\nple" -> "example"
    t = t.replace(/([A-Za-z])-[\t\x0B\f\v ]*\n[\t\x0B\f\v ]*([A-Za-z])/g, '$1$2');
    // Collapse other line breaks to spaces
    t = t.replace(/[\t\x0B\f\v ]*\n[\t\x0B\f\v ]*/g, ' ');
    // Collapse multiple spaces
    t = t.replace(/\s{2,}/g, ' ').trim();
    return t;
  };

  // Thread management helpers and persistence
  const keyForBook = (b: Book) => `chatThreads:${b.id}`;

  const ensureThreadState = (threadId: string) => {
    setThreadStates(prev => {
      if (prev[threadId]) return prev;
      return {
        ...prev,
        [threadId]: {
          inputValue: '',
          isAiThinking: false,
          currentThoughts: [],
          currentToolUses: [],
          currentProgress: '',
          messageReceived: false,
          editingIndex: null,
        }
      };
    });
  };

  const createNewThread = (title: string = 'New Chat'): string => {
    const id = `thread-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const newThread: ChatThread = { id, title, messages: [], createdAt: Date.now(), bookId: book.id };
    setThreads(prev => [...prev, newThread]);
    ensureThreadState(id);
    setActiveThreadId(id);
    return id;
  };

  const selectThread = (id: string) => {
    setActiveThreadId(id);
    ensureThreadState(id);
  };

  const closeThread = async (id: string) => {
    setThreads(prev => prev.filter(t => t.id !== id));
    setThreadStates(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
    try { await dbService.deleteChatThread(id); } catch {}
    if (activeThreadId === id) {
      setTimeout(() => {
        setThreads(curr => {
          if (curr.length > 0) {
            const fallback = curr[curr.length - 1].id;
            setActiveThreadId(fallback);
            return curr;
          }
          const newId = `thread-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          setActiveThreadId(newId);
          return [{ id: newId, title: 'New Chat', messages: [], createdAt: Date.now(), bookId: book.id }];
        });
      }, 0);
    }
  };

  // Load threads for this book from IndexedDB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await dbService.getChatThreads(book.id);
        if (cancelled) return;
        if (existing && existing.length > 0) {
          const normalized: ChatThread[] = existing.map(t => ({
            id: t.id,
            title: t.title,
            messages: t.messages as EnhancedChatMessage[],
            createdAt: t.createdAt,
            bookId: t.bookId,
          }));
          setThreads(normalized);
          const last = normalized[normalized.length - 1];
          setActiveThreadId(last.id);
          ensureThreadState(last.id);
        } else {
          const id = createNewThread();
          setActiveThreadId(id);
        }
      } catch {
        const id = createNewThread();
        setActiveThreadId(id);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Persist threads when they change (IndexedDB)
  useEffect(() => {
    if (!book?.id) return;
    (async () => {
      try {
        await Promise.all(threads.filter(t => t.bookId === book.id).map(t => dbService.saveChatThread({
          id: t.id,
          bookId: t.bookId,
          title: t.title,
          messages: t.messages as any,
          createdAt: t.createdAt,
          updatedAt: Date.now(),
        })));
      } catch {
        // ignore persistence errors
      }
    })();
  }, [book, threads]);

  const activeThread = threads.find(t => t.id === activeThreadId) || null;
  const activeState: ThreadEphemeralState = activeThreadId && threadStates[activeThreadId]
    ? threadStates[activeThreadId]
    : { inputValue: '', isAiThinking: false, currentThoughts: [], currentToolUses: [], currentProgress: '', messageReceived: false, editingIndex: null };

  // Handle text selection within the PDF.js viewer to show our popup
  useEffect(() => {
    const root = viewerRef.current;
    if (!root) return;
    // The scrollable element is the inner PDF.js container
    const scrollEl: HTMLElement | null = root.querySelector('.pdfViewerContainer');

    const isNodeInside = (node: Node | null, rootEl: HTMLElement) => {
      if (!node) return false;
      let cur: Node | null = node;
      while (cur) {
        if (cur === rootEl) return true;
        cur = (cur as HTMLElement).parentNode;
      }
      return false;
    };

    const handleMouseUp = () => {
      // Delay a tick to allow selection to finalize
      setTimeout(() => {
        try {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
            setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
            return;
          }
          const anchorNode = sel.anchorNode;
          if (!anchorNode || !isNodeInside(anchorNode, root)) {
            setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
            return;
          }
          // Limit to textLayer selection for best accuracy
          const textLayer = (anchorNode as HTMLElement).closest?.('.textLayer');
          if (!textLayer) {
            setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
            return;
          }
          const text = normalizeSelectedText(sel.toString());
          if (!text || !text.trim()) {
            setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
            return;
          }
          selectedTextRef.current = text;
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          // Position in viewport coordinates; popup uses fixed positioning
          const x = rect.left + rect.width / 2;
          const y = rect.top;
          setSelectionPopup({ visible: true, x, y, text });
        } catch {
          setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
        }
      }, 0);
    };

    const handleScroll = () => {
      setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
    };

    const handleGlobalMouseDown = (e: MouseEvent) => {
      // Don't hide if clicking inside the popup
      const pop = popupRef.current;
      if (pop && pop.contains(e.target as Node)) return;
      setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
      }
    };

    // Attach listeners
    root.addEventListener('mouseup', handleMouseUp);
    scrollEl?.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousedown', handleGlobalMouseDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      root.removeEventListener('mouseup', handleMouseUp);
      scrollEl?.removeEventListener('scroll', handleScroll as any);
      window.removeEventListener('mousedown', handleGlobalMouseDown as any);
      window.removeEventListener('keydown', handleKeyDown as any);
    };
  }, [viewerRef]);

  // Trigger a layout update after the chat panel animates, so PDF.js fits width
  useEffect(() => {
    const timeout = setTimeout(() => {
      try { window.dispatchEvent(new Event('resize')); } catch {}
    }, 300);
    return () => clearTimeout(timeout);
  }, [isChatOpen]);

  /* 
    This useEffect is now disabled. We keep it here for reference.
    It handled the custom selection popup. Now we use the native PDFTron popup.
  */
  // useEffect(() => {
  //   if (!webViewerInstance) return;

  //   const Core = webViewerInstance.Core;
  //   const documentViewer = Core.documentViewer;

  //   const handleTextSelection = () => {
  //     // We are now using the native PDFTron popup
  //   };

  //   documentViewer.addEventListener('textSelected', handleTextSelection);

  //   return () => {
  //     documentViewer.removeEventListener('textSelected', handleTextSelection);
  //   };
  // }, [webViewerInstance]);

  const handleNavigateToPage = (page: number) => {
    setCurrentPage(page);
  };

  const handleSendMessage = async (message: string) => {
    if (!activeThread) return;
    const threadId = activeThread.id;
    const userMessage: EnhancedChatMessage = { role: 'user', content: message };
    // Append user message and a streaming assistant placeholder
    setThreads(prev => prev.map(t => t.id === threadId ? {
      ...t,
      messages: [...t.messages, userMessage, { role: 'assistant', content: '', thoughts: [], toolUses: [] }]
    } : t));
    // If first message, set title
    if ((activeThread.messages?.length || 0) === 0) {
      const newTitle = message.trim().split('\n')[0].slice(0, 40) + (message.length > 40 ? '…' : '');
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title: newTitle || 'New Chat' } : t));
    }
    // Set ephemeral state for this thread
    setThreadStates(prev => ({
      ...prev,
      [threadId]: {
        ...(prev[threadId] || activeState),
        inputValue: '',
        isAiThinking: true,
        messageReceived: true,
        currentThoughts: [],
        currentToolUses: [],
        currentProgress: '',
      }
    }));

    try {
      // Use enhanced RAG service with real-time callbacks
      const result = await enhancedRagService.generateAnswer(book, message, {
        onThought: (thought) => {
          setThreadStates(prev => ({
            ...prev,
            [threadId]: {
              ...(prev[threadId] || activeState),
              ...prev[threadId],
              currentThoughts: [ ...(prev[threadId]?.currentThoughts || []), thought ],
            }
          }));
          // Also mirror into the last assistant message
          setThreads(prev => prev.map(t => {
            if (t.id !== threadId) return t;
            const msgs = [...t.messages];
            const lastIdx = msgs.length - 1;
            if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
              const last = msgs[lastIdx] as EnhancedChatMessage;
              msgs[lastIdx] = { ...last, thoughts: [ ...(last.thoughts || []), thought ] };
            }
            return { ...t, messages: msgs };
          }));
        },
        onToolUse: (tool) => {
          setThreadStates(prev => ({
            ...prev,
            [threadId]: {
              ...(prev[threadId] || activeState),
              ...prev[threadId],
              currentToolUses: [ ...(prev[threadId]?.currentToolUses || []), tool ],
            }
          }));
          // Mirror into last assistant message as metadata
          setThreads(prev => prev.map(t => {
            if (t.id !== threadId) return t;
            const msgs = [...t.messages];
            const lastIdx = msgs.length - 1;
            if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
              const last = msgs[lastIdx] as EnhancedChatMessage;
              msgs[lastIdx] = { ...last, toolUses: [ ...(last.toolUses || []), tool ] } as any;
            }
            return { ...t, messages: msgs };
          }));
        },
        onProgress: (progress) => {
          setThreadStates(prev => ({
            ...prev,
            [threadId]: {
              ...(prev[threadId] || activeState),
              ...prev[threadId],
              currentProgress: progress,
            }
          }));
        },
        onToken: (token) => {
          // Append streaming token to the last assistant message
          setThreads(prev => prev.map(t => {
            if (t.id !== threadId) return t;
            const msgs = [...t.messages];
            const lastIdx = msgs.length - 1;
            if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
              const last = msgs[lastIdx] as EnhancedChatMessage;
              msgs[lastIdx] = { ...last, content: (last.content || '') + token };
            }
            return { ...t, messages: msgs };
          }));
        },
        onDone: () => {
          // no-op here; finalization below will set toolUses/thoughts
        }
      });

      // Update last assistant message with final metadata; content already streamed
      setThreads(prev => prev.map(t => {
        if (t.id !== threadId) return t;
        const msgs = [...t.messages];
        const lastIdx = msgs.length - 1;
        if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
          const last = msgs[lastIdx] as EnhancedChatMessage;
          msgs[lastIdx] = { ...last, thoughts: result.thoughts, toolUses: result.toolUses };
        }
        return { ...t, messages: msgs };
      }));
    } catch (error) {
      console.error("Failed to get answer from AI:", error);
      const errorMessage: EnhancedChatMessage = {
        role: 'assistant',
        content: "Sorry, I couldn't process that. Please try again.",
        thoughts: [{
          stage: "Error",
          thought: "An error occurred while processing your request",
          timestamp: Date.now()
        }]
      };
      // Replace last assistant placeholder with error
      setThreads(prev => prev.map(t => {
        if (t.id !== threadId) return t;
        const msgs = [...t.messages];
        const lastIdx = msgs.length - 1;
        if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
          msgs[lastIdx] = errorMessage;
        } else {
          msgs.push(errorMessage);
        }
        return { ...t, messages: msgs };
      }));
    } finally {
      setThreadStates(prev => ({
        ...prev,
        [threadId]: {
          ...(prev[threadId] || activeState),
          ...prev[threadId],
          isAiThinking: false,
          messageReceived: false,
          // keep progress/thoughts/toolUses to show in UI until next message
        }
      }));
    }
  };

  const handleResendEdited = async (newMessage: string) => {
    if (!activeThread) return;
    const threadId = activeThread.id;
    const editIndex = activeState.editingIndex ?? -1;
    if (editIndex < 0) return;

    // Replace the target user message and trim conversation after it
    setThreads(prev => prev.map(t => {
      if (t.id !== threadId) return t;
      const msgs = [...t.messages];
      if (msgs[editIndex]?.role === 'user') {
        msgs[editIndex] = { role: 'user', content: newMessage } as EnhancedChatMessage;
      }
      const trimmed = msgs.slice(0, editIndex + 1);
      // Add assistant placeholder for streaming
      trimmed.push({ role: 'assistant', content: '', thoughts: [], toolUses: [] } as EnhancedChatMessage);
      return { ...t, messages: trimmed };
    }));

    // If edited the first message, update title
    if (editIndex === 0) {
      const newTitle = newMessage.trim().split('\n')[0].slice(0, 40) + (newMessage.length > 40 ? '…' : '');
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title: newTitle || 'New Chat' } : t));
    }

    // Reset ephemeral state and start thinking
    setThreadStates(prev => ({
      ...prev,
      [threadId]: {
        ...(prev[threadId] || activeState),
        inputValue: '',
        isAiThinking: true,
        messageReceived: true,
        currentThoughts: [],
        currentToolUses: [],
        currentProgress: '',
        editingIndex: null,
      }
    }));

    try {
      const result = await enhancedRagService.generateAnswer(book, newMessage, {
        onThought: (thought) => {
          setThreadStates(prev => ({
            ...prev,
            [threadId]: {
              ...(prev[threadId] || activeState),
              ...prev[threadId],
              currentThoughts: [ ...(prev[threadId]?.currentThoughts || []), thought ],
            }
          }));
          // Mirror into last assistant message
          setThreads(prev => prev.map(t => {
            if (t.id !== threadId) return t;
            const msgs = [...t.messages];
            const lastIdx = msgs.length - 1;
            if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
              const last = msgs[lastIdx] as EnhancedChatMessage;
              msgs[lastIdx] = { ...last, thoughts: [ ...(last.thoughts || []), thought ] };
            }
            return { ...t, messages: msgs };
          }));
        },
        onToolUse: (tool) => {
          setThreadStates(prev => ({
            ...prev,
            [threadId]: {
              ...(prev[threadId] || activeState),
              ...prev[threadId],
              currentToolUses: [ ...(prev[threadId]?.currentToolUses || []), tool ],
            }
          }));
          setThreads(prev => prev.map(t => {
            if (t.id !== threadId) return t;
            const msgs = [...t.messages];
            const lastIdx = msgs.length - 1;
            if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
              const last = msgs[lastIdx] as EnhancedChatMessage;
              msgs[lastIdx] = { ...last, toolUses: [ ...(last.toolUses || []), tool ] } as any;
            }
            return { ...t, messages: msgs };
          }));
        },
        onProgress: (progress) => {
          setThreadStates(prev => ({
            ...prev,
            [threadId]: {
              ...(prev[threadId] || activeState),
              ...prev[threadId],
              currentProgress: progress,
            }
          }));
        },
        onToken: (token) => {
          setThreads(prev => prev.map(t => {
            if (t.id !== threadId) return t;
            const msgs = [...t.messages];
            const lastIdx = msgs.length - 1;
            if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
              const last = msgs[lastIdx] as EnhancedChatMessage;
              msgs[lastIdx] = { ...last, content: (last.content || '') + token };
            }
            return { ...t, messages: msgs };
          }));
        },
        onDone: () => {}
      });

      // Finalize last assistant message
      setThreads(prev => prev.map(t => {
        if (t.id !== threadId) return t;
        const msgs = [...t.messages];
        const lastIdx = msgs.length - 1;
        if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
          const last = msgs[lastIdx] as EnhancedChatMessage;
          msgs[lastIdx] = { ...last, thoughts: result.thoughts, toolUses: result.toolUses };
        }
        return { ...t, messages: msgs };
      }));
    } catch (error) {
      console.error('Failed to regenerate after edit:', error);
      const errorMessage: EnhancedChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error while reprocessing your edited message.',
        thoughts: [{ stage: 'Error', thought: 'Error during edited resend', timestamp: Date.now() }]
      };
      setThreads(prev => prev.map(t => {
        if (t.id !== threadId) return t;
        const msgs = [...t.messages];
        const lastIdx = msgs.length - 1;
        if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
          msgs[lastIdx] = errorMessage;
        } else {
          msgs.push(errorMessage);
        }
        return { ...t, messages: msgs };
      }));
    } finally {
      setThreadStates(prev => ({
        ...prev,
        [threadId]: {
          ...(prev[threadId] || activeState),
          ...prev[threadId],
          isAiThinking: false,
          messageReceived: false,
        }
      }));
    }
  };

  const handleSelectionAction = async (action: SelectionAction, text?: string) => {
    const selectedText = text || selectedTextRef.current;

    if (!selectedText) return;
    
    setSelectionPopup({ visible: false, x: 0, y: 0, text: '' }); 
    setIsChatOpen(true);

    if (action === 'ask') {
      // Add selected text as a quoted reference into current thread input
      const quotedBlock = selectedText.replace(/^/gm, '> ');
      const toInsert = `Regarding this passage from the book:\n\n${quotedBlock}\n\n`;
      setThreadStates(prev => ({
        ...prev,
        [activeThreadId]: {
          ...(prev[activeThreadId] || { inputValue: '', isAiThinking: false, currentThoughts: [], currentToolUses: [], currentProgress: '', messageReceived: false }),
          ...prev[activeThreadId],
          inputValue: (prev[activeThreadId]?.inputValue ? `${prev[activeThreadId]!.inputValue.trim()}\n\n${toInsert}` : toInsert)
        }
      }));
    } else {
      let prompt = '';
      if (action === 'summarize') {
        prompt = `Please provide a comprehensive summary of the following passage from the book. Include the main ideas, key points, and any important details:\n\n"${selectedText}"`;
      } else if (action === 'explain') {
        prompt = `Please explain the following passage from the book in simple, clear terms. Break down any complex concepts and provide context where helpful:\n\n"${selectedText}"`;
      }

      if (prompt) {
        setThreadStates(prev => ({
          ...prev,
          [activeThreadId]: {
            ...(prev[activeThreadId] || { inputValue: '', isAiThinking: false, currentThoughts: [], currentToolUses: [], currentProgress: '', messageReceived: false }),
            ...prev[activeThreadId],
            inputValue: ''
          }
        }));
        await handleSendMessage(prompt);
      } else {
        setThreadStates(prev => ({
          ...prev,
          [activeThreadId]: {
            ...(prev[activeThreadId] || { inputValue: '', isAiThinking: false, currentThoughts: [], currentToolUses: [], currentProgress: '', messageReceived: false }),
            ...prev[activeThreadId],
            isAiThinking: false
          }
        }));
      }
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
        <div className="flex items-center gap-2" />
      </header>
      
      <div className="flex-grow relative min-h-0 overflow-hidden flex">
        {selectionPopup.visible && (
            <div ref={popupRef}>
                <SelectionPopup
                    x={selectionPopup.x}
                    y={selectionPopup.y}
                    onAction={handleSelectionAction}
                />
            </div>
        )}
        <div 
          ref={viewerRef} 
          className="h-full"
          style={{ 
            flex: 1, 
            overflow: 'hidden',
            position: 'relative',
            transition: 'width 300ms ease-in-out',
            width: isChatOpen ? 'calc(100% - 520px)' : '100%'
          }}
        >
          {/* Embed PDF.js viewer */}
          <PdfJsViewer
            fileBuffer={book.fileBuffer}
            title={book.title}
            currentPage={currentPage}
            onPageChange={(p) => setCurrentPage(p)}
            initialScale={'page-fit'}
          />
        </div>
        {/* Fallback floating chat button inside the viewer container */}
        {!isChatOpen && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="absolute bottom-6 right-6 p-4 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-110 hover:-translate-y-1"
            style={{
              background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
              color: 'white',
              zIndex: 60,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 10px 25px rgba(44, 62, 80, 0.3), 0 4px 10px rgba(0, 0, 0, 0.1)'
            }}
            aria-label="Open AI assistant"
            title="Open Enhanced AI Assistant"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm font-medium hidden sm:inline">AI Assistant</span>
            </div>
          </button>
        )}
        <div
            ref={chatPanelRef}
            className="transition-all duration-300 ease-in-out"
            style={{
                width: isChatOpen ? '520px' : '0px',
                overflow: 'hidden',
                flexShrink: 0,
                height: '100%',
                backgroundColor: 'var(--bg-primary)',
                borderLeft: isChatOpen ? '1px solid var(--border-color)' : 'none',
                boxShadow: isChatOpen ? '-4px 0 15px rgba(0,0,0,0.05)' : 'none'
            }}
        >
            <EnhancedChatPanel
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                chatHistory={activeThread?.messages || []}
                onSendMessage={handleSendMessage}
                onResendEdited={handleResendEdited}
                isAiThinking={activeState.isAiThinking}
                inputValue={activeState.inputValue}
                onInputChange={(v) => setThreadStates(prev => ({
                  ...prev,
                  [activeThreadId]: {
                    ...(prev[activeThreadId] || { inputValue: '', isAiThinking: false, currentThoughts: [], currentToolUses: [], currentProgress: '', messageReceived: false }),
                    ...prev[activeThreadId],
                    inputValue: v,
                  }
                }))}
                onNavigateToPage={handleNavigateToPage}
                currentThoughts={activeState.currentThoughts}
                currentToolUses={activeState.currentToolUses}
                messageReceived={activeState.messageReceived}
                currentProgress={activeState.currentProgress}
                threads={threads.map(t => ({ id: t.id, title: t.title }))}
                activeThreadId={activeThreadId}
                onSelectThread={selectThread}
                onNewThread={() => createNewThread()}
                onCloseThread={closeThread}
                editingIndex={activeState.editingIndex ?? null}
                onStartEditMessage={(index, content) => setThreadStates(prev => ({
                  ...prev,
                  [activeThreadId]: {
                    ...(prev[activeThreadId] || activeState),
                    ...prev[activeThreadId],
                    editingIndex: index,
                    inputValue: content,
                  }
                }))}
                onCancelEdit={() => setThreadStates(prev => ({
                  ...prev,
                  [activeThreadId]: {
                    ...(prev[activeThreadId] || activeState),
                    ...prev[activeThreadId],
                    editingIndex: null,
                    inputValue: '',
                  }
                }))}
            />
        </div>
      </div>
    </div>
  );
};

export default Reader;
