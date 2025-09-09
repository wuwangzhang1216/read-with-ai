import React, { useState, useEffect, useRef } from 'react';
import { Book, ChatMessage } from '../types';
import { BackIcon, ChatIcon } from './icons/Icons';
import EnhancedChatPanel, { EnhancedChatMessage } from './EnhancedChatPanel';
import * as enhancedRagService from '../services/enhancedRagService';
import SelectionPopup from './SelectionPopup';
import WebViewer from '@pdftron/webviewer';
import { createPortal } from 'react-dom';
import { ThoughtProcess, ToolUse } from '../services/enhancedRagService';

interface ReaderProps {
  book: Book;
  onBackToLibrary: () => void;
}

type SelectionAction = 'ask' | 'summarize' | 'explain';

const Reader: React.FC<ReaderProps> = ({ book, onBackToLibrary }) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<EnhancedChatMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatInputValue, setChatInputValue] = useState("");
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [webViewerInstance, setWebViewerInstance] = useState<any>(null);
  const [currentThoughts, setCurrentThoughts] = useState<ThoughtProcess[]>([]);
  const [currentToolUses, setCurrentToolUses] = useState<ToolUse[]>([]);
  const [currentProgress, setCurrentProgress] = useState<string>("");
  const [messageReceived, setMessageReceived] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const aiButtonAddedRef = useRef<boolean>(false);
  const selectedTextRef = useRef('');
  const [selectionPopup, setSelectionPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
  }>({ visible: false, x: 0, y: 0, text: '' });

  useEffect(() => {
    if (book && viewerRef.current && !webViewerInstance) {
      // Initialize PDFtron WebViewer
      WebViewer({
        path: '/node_modules/@pdftron/webviewer/public/',
        initialDoc: '',
        licenseKey: undefined, // Add your license key if you have one
      }, viewerRef.current).then(instance => {
        setWebViewerInstance(instance);

        // Load the PDF document
        const blob = new Blob([book.fileBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        instance.UI.loadDocument(url, { filename: book.title });

        // Register a WebViewer header button when UI is ready
        const addHeaderButton = () => {
          try {
            if (aiButtonAddedRef.current) return;
            if (instance && instance.UI && typeof instance.UI.setHeaderItems === 'function') {
              const svg = `<?xml version="1.0" encoding="UTF-8"?>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 5.75A2.75 2.75 0 016.75 3h10.5A2.75 2.75 0 0120 5.75v7.5A2.75 2.75 0 0117.25 16H9.5l-4 3v-3.25A2.75 2.75 0 014 13.25v-7.5z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                <circle cx="8.5" cy="9.5" r="1" fill="currentColor"/>
                <circle cx="12" cy="9.5" r="1" fill="currentColor"/>
                <circle cx="15.5" cy="9.5" r="1" fill="currentColor"/>
                </svg>`;
              instance.UI.setHeaderItems((header: any) => {
                header.push({
                  type: 'actionButton',
                  img: svg,
                  title: 'AI Assistant (Enhanced RAG)',
                  dataElement: 'ai-chat-toggle',
                  onClick: () => setIsChatOpen((prev: boolean) => !prev),
                });
              });
              aiButtonAddedRef.current = true;
            }
          } catch (e) {
            console.warn('Unable to register WebViewer header button for AI chat:', e);
          }
        };

        // In some builds, UI isn't ready immediately; wait for viewerLoaded
        try {
          if (instance && instance.UI && typeof instance.UI.addEventListener === 'function') {
            instance.UI.addEventListener('viewerLoaded', () => {
              addHeaderButton();
              
              instance.UI.textPopup.add({
                type: 'actionButton',
                title: 'Ask AI',
                // Clean AI robot icon
                img: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="18" height="10" x="3" y="11" rx="2"/>
                  <circle cx="12" cy="5" r="2"/>
                  <path d="m9 16 2-2 2 2"/>
                  <circle cx="8" cy="14" r="1"/>
                  <circle cx="16" cy="14" r="1"/>
                </svg>`,
                onClick: () => {
                  try {
                    const selectedText = instance.Core.documentViewer.getSelectedText();
                    if (selectedText && selectedText.trim()) {
                      handleSelectionAction('ask', selectedText);
                    }
                  } catch (e) {
                    console.warn('Could not get selected text on button click:', e);
                  }
                }
              }, 'copy');

              instance.UI.textPopup.add({
                type: 'actionButton',
                title: 'Summarize',
                img: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"/>
                </svg>`,
                onClick: () => {
                  try {
                    const selectedText = instance.Core.documentViewer.getSelectedText();
                    if (selectedText && selectedText.trim()) {
                      handleSelectionAction('summarize', selectedText);
                    }
                  } catch (e) {
                    console.warn('Could not get selected text on button click:', e);
                  }
                }
              });

              instance.UI.textPopup.add({
                type: 'actionButton',
                title: 'Explain',
                img: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>`,
                onClick: () => {
                  try {
                    const selectedText = instance.Core.documentViewer.getSelectedText();
                    if (selectedText && selectedText.trim()) {
                      handleSelectionAction('explain', selectedText);
                    }
                  } catch (e) {
                    console.warn('Could not get selected text on button click:', e);
                  }
                }
              });

            });
          }
        } catch {}

        // Also attempt immediately once
        addHeaderButton();

        // Navigate to specific page if currentPage is set
        if (currentPage) {
          instance.Core.documentViewer.setCurrentPage(currentPage);
        }

        // Clean up function
        return () => {
          URL.revokeObjectURL(url);
        };
      }).catch(error => {
        console.error('Failed to initialize PDFtron WebViewer:', error);
      });
    } else if (webViewerInstance && currentPage) {
      // Handle page navigation
      webViewerInstance.Core.documentViewer.setCurrentPage(currentPage);
    }
  }, [book, currentPage, webViewerInstance]);

  useEffect(() => {
    if (!webViewerInstance) return;

    const { Core } = webViewerInstance;
    const { documentViewer } = Core;

    const handleTextSelection = () => {
      try {
        const newSelection = documentViewer.getSelectedText();
        // Only update the ref if the new selection is a non-empty, non-whitespace string
        if (newSelection && newSelection.trim()) {
          selectedTextRef.current = newSelection;
        }
      } catch (e) {
        console.warn('Could not get selected text:', e);
        selectedTextRef.current = '';
      }
    };

    documentViewer.addEventListener('textSelected', handleTextSelection);

    return () => {
      documentViewer.removeEventListener('textSelected', handleTextSelection);
    };
  }, [webViewerInstance]);

  useEffect(() => {
    if (webViewerInstance) {
      // Give the animations time to complete
      setTimeout(() => {
        webViewerInstance.UI.resize();
      }, 300);
    }
  }, [isChatOpen, webViewerInstance]);

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
    const userMessage: EnhancedChatMessage = { role: 'user', content: message };
    setChatHistory(prev => [...prev, userMessage]);
    setIsAiThinking(true);
    setMessageReceived(true);
    setCurrentThoughts([]);
    setCurrentToolUses([]);
    setCurrentProgress("");

    try {
      // Use enhanced RAG service with real-time callbacks
      const result = await enhancedRagService.generateAnswer(book, message, {
        onThought: (thought) => {
          setCurrentThoughts(prev => [...prev, thought]);
        },
        onToolUse: (tool) => {
          setCurrentToolUses(prev => [...prev, tool]);
        },
        onProgress: (progress) => {
          setCurrentProgress(progress);
        }
      });

      const aiMessage: EnhancedChatMessage = {
        role: 'assistant',
        content: result.answer,
        thoughts: result.thoughts,
        toolUses: result.toolUses
      };

      setChatHistory(prev => [...prev, aiMessage]);
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
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsAiThinking(false);
      setMessageReceived(false);
      setCurrentThoughts([]);
      setCurrentToolUses([]);
      setCurrentProgress("");
    }
  };

  const handleSelectionAction = async (action: SelectionAction, text?: string) => {
    const selectedText = text || selectedTextRef.current;

    if (!selectedText) return;
    
    setSelectionPopup({ visible: false, x: 0, y: 0, text: '' }); 
    setIsChatOpen(true);

    if (action === 'ask') {
      // Add selected text as a quoted reference
      const quotedBlock = selectedText.replace(/^/gm, '> ');
      const toInsert = `Regarding this passage from the book:\n\n${quotedBlock}\n\n`;
      setChatInputValue(prev => prev ? `${prev.trim()}\n\n${toInsert}` : toInsert);
    } else {
      setIsAiThinking(true);
      setMessageReceived(true);
      setCurrentThoughts([]);
      setCurrentToolUses([]);
      setCurrentProgress("");
      let prompt = '';
      if (action === 'summarize') {
        prompt = `Please provide a comprehensive summary of the following passage from the book. Include the main ideas, key points, and any important details:\n\n"${selectedText}"`;
      } else if (action === 'explain') {
        prompt = `Please explain the following passage from the book in simple, clear terms. Break down any complex concepts and provide context where helpful:\n\n"${selectedText}"`;
      }

      if (prompt) {
        setChatInputValue('');
        await handleSendMessage(prompt);
      } else {
        setIsAiThinking(false);
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
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1 rounded-full"
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.2)'
                }}>
            Enhanced RAG Active
          </span>
        </div>
      </header>
      
      <div className="flex-grow relative min-h-0 overflow-hidden flex">
        {/* The custom selection popup is now disabled in favor of the native one */}
        {/* {selectionPopup.visible && (
            <div ref={popupRef}>
                <SelectionPopup
                    x={selectionPopup.x}
                    y={selectionPopup.y}
                    onAction={handleSelectionAction}
                />
            </div>
        )} */}
        <div 
          ref={viewerRef} 
          className="h-full"
          style={{ 
            transform: 'translateZ(0)', 
            flex: 1, 
            overflow: 'hidden',
            transition: 'width 300ms ease-in-out',
            width: isChatOpen ? 'calc(100% - 520px)' : '100%'
          }}
        />
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
                chatHistory={chatHistory}
                onSendMessage={handleSendMessage}
                isAiThinking={isAiThinking}
                inputValue={chatInputValue}
                onInputChange={setChatInputValue}
                onNavigateToPage={handleNavigateToPage}
                currentThoughts={currentThoughts}
                currentToolUses={currentToolUses}
                messageReceived={messageReceived}
                currentProgress={currentProgress}
            />
        </div>
      </div>
    </div>
  );
};

export default Reader;
