import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Book } from '../types';
import Spinner from './ui/Spinner';
import { ChatIcon } from './icons/Icons';

declare const pdfjsLib: any;
declare const pdfjsViewer: any;

interface BookViewerProps {
  book: Book;
  currentPage: number;
  onAskAboutSelection: (selectedText: string) => void;
}

interface SelectionPopupState {
  visible: boolean;
  top: number;
  left: number;
  text: string;
}

const BookViewer: React.FC<BookViewerProps> = ({ book, currentPage, onAskAboutSelection }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopupState>({ visible: false, top: 0, left: 0, text: '' });
  
  const bookId = book.id;
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const loadingTask = pdfjsLib.getDocument({ data: book.fileBuffer.slice(0) });
    loadingTask.promise.then((doc: any) => {
      setPdfDoc(doc);
    }).catch((err: Error) => {
      console.error("Failed to load PDF document:", err);
      setError("Could not load the book file.");
    });
  }, [bookId, book.fileBuffer]);

  useEffect(() => {
    if (!pdfDoc) return;

    let isCancelled = false;
    const renderPage = async () => {
      setIsLoading(true);
      if (selectionPopup.visible) {
        setSelectionPopup({ ...selectionPopup, visible: false });
      }

      try {
        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;
        
        const canvas = canvasRef.current;
        const textLayer = textLayerRef.current;
        const container = containerRef.current;
        if (!canvas || !textLayer || !container) return;
        
        const viewport = page.getViewport({ scale: 2 });
        const outputScale = window.devicePixelRatio || 1;
        
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        await page.render({ canvasContext: context, transform, viewport }).promise;
        if (isCancelled) return;

        textLayer.innerHTML = '';
        textLayer.style.width = canvas.style.width;
        textLayer.style.height = canvas.style.height;
        
        const textContent = await page.getTextContent();
        if (isCancelled) return;

        const textLayerRenderer = new pdfjsViewer.TextLayerBuilder({
            textLayerDiv: textLayer,
            pageIndex: page.pageIndex,
            viewport: viewport,
        });
        textLayerRenderer.setTextContent(textContent);
        textLayerRenderer.render();
        
      } catch (err) {
        console.error(`Failed to render page ${currentPage}:`, err);
        setError("Could not display this page.");
      } finally {
        setIsLoading(false);
      }
    };
    
    renderPage();
    
    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPage, selectionPopup.visible]);
  
  const handleMouseUp = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    
    if (selectedText && containerRef.current) {
      const range = selection!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      setSelectionPopup({
        visible: true,
        top: rect.top - containerRect.top + rect.height,
        left: rect.left - containerRect.top + rect.width / 2,
        text: selectedText
      });
    } else {
      if (selectionPopup.visible) {
         setSelectionPopup({ ...selectionPopup, visible: false });
      }
    }
  };

  return (
    <div className="flex justify-center items-start h-full w-full p-2 sm:p-8 overflow-auto custom-scrollbar" onMouseUp={handleMouseUp} style={{ backgroundColor: 'var(--bg-secondary)'}}>
      {error && (
        <div className="p-4 text-center m-auto" style={{ color: 'var(--accent-red)'}}>
            <p className="font-semibold">Error</p>
            <p>{error}</p>
        </div>
      )}
      <div 
        ref={containerRef}
        className="relative rounded-md" 
        style={{ 
            display: error ? 'none' : 'block',
            backgroundColor: 'var(--bg-primary)',
            boxShadow: 'var(--card-shadow)'
        }}
      >
        <canvas ref={canvasRef} className="rounded-md" />
        <div ref={textLayerRef} className="textLayer" />
         {selectionPopup.visible && (
          <button
            onClick={() => onAskAboutSelection(selectionPopup.text)}
            className="absolute z-10 flex items-center gap-2 px-3 py-1.5 text-white font-semibold rounded-md shadow-lg text-sm transition-all"
            style={{ 
              top: `${selectionPopup.top + 8}px`, 
              left: `${selectionPopup.left}px`, 
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--accent-red)'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-red-hover)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-red)'}
          >
            <ChatIcon className="w-4 h-4" />
            Ask about this
          </button>
        )}
      </div>
      {(isLoading || !pdfDoc) && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-200/20 z-20">
          <Spinner className="w-10 h-10 mb-4" />
          <p style={{ color: 'var(--text-secondary)'}}>{!pdfDoc ? "Loading Book..." : `Rendering Page ${currentPage}...`}</p>
        </div>
      )}
       <style>{`
          .textLayer ::selection { background: rgba(192, 57, 43, 0.3); }
          .custom-scrollbar::-webkit-scrollbar { width: 8px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--hover-color); border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }
      `}</style>
    </div>
  );
};

export default BookViewer;