import React, { useState, useEffect, useRef } from 'react';
import { Book, ChatMessage } from '../types';
import { BackIcon, ChatIcon } from './icons/Icons';
import ChatPanel from './ChatPanel';
import * as geminiService from '../services/geminiService';
import SelectionPopup from './SelectionPopup';
import WebViewer from '@pdftron/webviewer';
import { createPortal } from 'react-dom';

interface ReaderProps {
  book: Book;
  onBackToLibrary: () => void;
}

type SelectionAction = 'ask' | 'summarize' | 'explain';

const Reader: React.FC<ReaderProps> = ({ book, onBackToLibrary }) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatInputValue, setChatInputValue] = useState("");
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [webViewerInstance, setWebViewerInstance] = useState<any>(null);
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
                  title: 'AI Assistant',
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

  const handleSelectionAction = async (action: SelectionAction, text?: string) => {
    const selectedText = text || selectedTextRef.current;

    if (!selectedText) return;
    
    setSelectionPopup({ visible: false, x: 0, y: 0, text: '' }); 
    setIsChatOpen(true);

    if (action === 'ask') {
        // Add selected text as a quoted reference in the chat input
        const quotedBlock = selectedText.replace(/^/gm, '> ');
        const toInsert = `${quotedBlock}`;
        setChatInputValue(prev => prev ? `${prev.trim()}\n\n${toInsert}` : toInsert);
    } else {
        setIsAiThinking(true);
        let prompt = '';
        if (action === 'summarize') {
            prompt = `Summarize the following text from the book:\n\n> ${selectedText.replace(/^/gm, '> ')}`;
        } else if (action === 'explain') {
            prompt = `Explain the following text from the book in simple terms:\n\n> ${selectedText.replace(/^/gm, '> ')}`;
        }
        
        if (prompt) {
            setChatInputValue(''); // Clear input for automated messages
            await handleSendMessage(prompt);
        } else {
            setIsAiThinking(false); // Should not happen, but for safety
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
        {/* Chat toggle moved into WebViewer header; keeping right side minimal */}
        <div className="flex items-center" />
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
            width: isChatOpen ? 'calc(100% - 480px)' : '100%'
          }}
        />
        {/* Fallback floating chat button inside the viewer container */}
        {!isChatOpen && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="absolute bottom-6 right-6 p-3 rounded-full shadow-lg hover:opacity-90 transition"
            style={{ backgroundColor: '#3b82f6', color: 'white', zIndex: 60 }}
            aria-label="Open AI assistant"
            title="Open AI assistant"
          >
            <ChatIcon className="w-6 h-6" />
          </button>
        )}
        <div 
            ref={chatPanelRef}
            className="transition-all duration-300 ease-in-out"
            style={{
                width: isChatOpen ? '480px' : '0px',
                overflow: 'hidden',
                flexShrink: 0,
                height: '100%',
                backgroundColor: 'var(--bg-primary)',
                borderLeft: isChatOpen ? '1px solid var(--border-color)' : 'none'
            }}
        >
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
    </div>
  );
};

export default Reader;
