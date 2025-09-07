import React, { useEffect, useRef, useState } from 'react';
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
  const renderTaskRef = useRef<any>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopupState>({ visible: false, top: 0, left: 0, text: '' });

  // Effect to load and cleanup a PDF document
  useEffect(() => {
    let pdfDocInstance: any = null;
    
    setPdfDoc(null);
    setIsLoading(true);
    setError(null);
    
    const loadingTask = pdfjsLib.getDocument({ data: book.fileBuffer.slice(0) });

    loadingTask.promise.then((doc) => {
      pdfDocInstance = doc;
      setPdfDoc(doc);
    }).catch((err: Error) => {
      if (err.name !== 'AbortException' && !err.message.includes('Worker was destroyed')) {
        console.error("Failed to load PDF document:", err);
        setError("Could not load PDF. The file might be corrupted or unsupported.");
      }
    });

    return () => {
      loadingTask.destroy();
      if (pdfDocInstance) {
        pdfDocInstance.destroy();
      }
    };
  }, [book.id, book.fileBuffer]);

  // Effect to render the current page
  useEffect(() => {
    if (!pdfDoc) return;
    
    let isCancelled = false;
    
    const render = async () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      
      setIsLoading(true);
      
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: window.devicePixelRatio || 2 });
        const canvas = canvasRef.current;
        const textLayerDiv = textLayerRef.current;
        if (!canvas || !textLayerDiv) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const canvasContext = canvas.getContext('2d');
        if(!canvasContext) return;

        const renderContext = { canvasContext, viewport };
        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        
        await renderTask.promise;

        if (isCancelled) return;

        const textContent = await page.getTextContent();
        if (isCancelled) return;

        textLayerDiv.innerHTML = '';
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

        textLayerDiv.style.width = `${canvas.clientWidth}px`;
        textLayerDiv.style.height = `${canvas.clientHeight}px`;
        
        if (typeof pdfjsViewer === 'undefined' || !pdfjsViewer.TextLayerBuilder) {
          console.error("pdf_viewer.js is not loaded.");
          setError("Could not render text layer, text selection is unavailable.");
          return;
        }

        const textLayer = new pdfjsViewer.TextLayerBuilder({
          textLayerDiv: textLayerDiv,
          pageIndex: page.pageIndex,
          viewport: viewport,
        });

        textLayer.setTextContentSource(textContent);
        textLayer.render();
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException' && err.message !== 'cancelled') {
          console.error(`Failed to render page ${currentPage}:`, err);
          setError(`Could not render page ${currentPage}.`);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };
    
    render();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, currentPage]);

  // Effect for handling text selection popup
  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !containerRef.current?.contains(selection.anchorNode)) {
        setSelectionPopup((s) => s.visible ? { ...s, visible: false } : s);
        return;
      }

      const selectedText = selection.toString().trim();
      if (selectedText.length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        
        setSelectionPopup({
          visible: true,
          top: rect.top - containerRect.top - 45,
          left: (rect.left + rect.right) / 2 - containerRect.left,
          text: selectedText,
        });
      }
    };
    
    const textLayerElement = textLayerRef.current;
    if (textLayerElement) {
      textLayerElement.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      if (textLayerElement) {
        textLayerElement.removeEventListener('mouseup', handleMouseUp);
      }
      setSelectionPopup(s => ({ ...s, visible: false }));
    };
  }, [currentPage, pdfDoc]);

  const handleAskClick = () => {
    onAskAboutSelection(selectionPopup.text);
    setSelectionPopup({ visible: false, top: 0, left: 0, text: '' });
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-y-auto flex justify-center items-start p-4" style={{ backgroundColor: 'var(--bg-secondary)'}}>
        {error && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 p-4 text-white rounded-lg shadow-lg" style={{ backgroundColor: 'var(--accent-red)' }}>{error}</div>}
        
        <div className="relative w-full max-w-4xl" style={{ boxShadow: 'var(--card-shadow)'}}>
          {(isLoading || !pdfDoc) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm z-20">
                  <Spinner />
                  <p className="mt-2" style={{ color: 'var(--text-secondary)'}}>{!pdfDoc ? 'Loading document...' : 'Rendering page...'}</p>
              </div>
          )}
          
          <div className="relative leading-none">
            <canvas ref={canvasRef} />
            <div ref={textLayerRef} className="textLayer absolute top-0 left-0" />
          </div>
          
          {selectionPopup.visible && (
            <div 
              className="absolute z-30 -translate-x-1/2"
              style={{ top: `${selectionPopup.top}px`, left: `${selectionPopup.left}px` }}
            >
              <button
                onClick={handleAskClick}
                className="flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all duration-200"
                style={{ backgroundColor: 'var(--sidebar-bg)', color: 'var(--text-light)'}}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--sidebar-bg-lighter)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--sidebar-bg)'}
              >
                <ChatIcon className="w-4 h-4" />
                Ask AI
              </button>
            </div>
          )}
        </div>
        <style>{`
          .textLayer > span { position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; }
          .textLayer ::selection { background: rgba(92, 162, 248, 0.4); }
        `}</style>
    </div>
  );
};

export default BookViewer;