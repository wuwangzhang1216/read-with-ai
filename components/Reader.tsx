import React, { useState, useEffect, useRef } from 'react';
import { Book, ChatMessage } from '../types';
import { BackIcon, ChatIcon } from './icons/Icons';
import ChatPanel from './ChatPanel';
import * as geminiService from '../services/geminiService';
import SelectionPopup from './SelectionPopup';

declare const PDFObject: any;

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
  const viewerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [selectionPopup, setSelectionPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
  }>({ visible: false, x: 0, y: 0, text: '' });

  useEffect(() => {
    if (book && viewerRef.current) {
      // Clear previous embed to avoid issues
      viewerRef.current.innerHTML = '';
      
      const blob = new Blob([book.fileBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob) + (currentPage ? `#page=${currentPage}` : '');
      
      PDFObject.embed(url, viewerRef.current);
      
      // Clean up the object URL to avoid memory leaks when the component unmounts
      // or the book changes. The re-rendering for page change is handled by the effect dependency array.
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [book, currentPage]);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Don't do anything if we are clicking on the popup itself
      if (popupRef.current?.contains(e.target as Node)) {
        return;
      }

      // We need a small delay for the browser to register the selection
      setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim() ?? '';

        if (selectedText.length > 5 && selection && selection.rangeCount > 0) {
          try {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const viewerRect = viewerRef.current?.getBoundingClientRect();

            // Check if the selection is visible and inside the viewer bounds.
            if (viewerRect && rect.width > 0 && 
                rect.top >= viewerRect.top && 
                rect.bottom <= viewerRect.bottom &&
                rect.left >= viewerRect.left &&
                rect.right <= viewerRect.right) 
            {
              setSelectionPopup({
                visible: true,
                x: rect.left + rect.width / 2,
                y: rect.top,
                text: selectedText,
              });
            } else {
              setSelectionPopup(prev => ({ ...prev, visible: false }));
            }
          } catch (err) {
            console.warn("Could not get range from selection", err);
            setSelectionPopup(prev => ({ ...prev, visible: false }));
          }
        } else {
          // If no text is selected, or we clicked away, hide the popup.
          setSelectionPopup(prev => ({ ...prev, visible: false }));
        }
      }, 10);
    };

    // Attach to the document to capture all mouseup events
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

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

  const handleSelectionAction = async (action: SelectionAction) => {
    if (!selectionPopup.text) return;
    
    const selectedText = selectionPopup.text;
    setSelectionPopup({ visible: false, x: 0, y: 0, text: '' }); 
    setIsChatOpen(true);

    if (action === 'ask') {
        const quotedText = `Regarding the text:\n\n> ${selectedText.replace(/^/gm, '> ')}\n\n`;
        setChatInputValue(prev => prev ? `${prev.trim()}\n\n${quotedText}` : quotedText);
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
        <div className="flex items-center">
          <button onClick={() => setIsChatOpen(true)} className="p-2 rounded-full hover:bg-gray-200/60 transition-colors" aria-label="Open AI assistant" style={{ color: 'var(--text-secondary)' }}>
            <ChatIcon className="w-6 h-6" />
          </button>
        </div>
      </header>
      
      <div className="flex-grow relative min-h-0 overflow-hidden">
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
          className="w-full h-full" 
          style={{ transform: 'translateZ(0)' }} // Promote to its own rendering layer to prevent flicker
        />
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
  );
};

export default Reader;