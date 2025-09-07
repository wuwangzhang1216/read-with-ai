import React, { useEffect, useRef } from 'react';
import { Book } from '../types';
import { BackIcon } from './icons/Icons';

declare const PDFObject: any;

interface ReaderProps {
  book: Book;
  onBackToLibrary: () => void;
}

const Reader: React.FC<ReaderProps> = ({ book, onBackToLibrary }) => {
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!book || !viewerRef.current) {
      return;
    }

    // PDFObject can't handle ArrayBuffer directly, so we create a Blob URL.
    const blob = new Blob([book.fileBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    // Ensure the container is empty before embedding
    viewerRef.current.innerHTML = "";

    const options = {
        pdfOpenParams: {
            navpanes: 1,
            toolbar: 1,
            statusbar: 1,
            view: "FitV"
        },
        attributes: {
            style: "border: none;"
        }
    };

    PDFObject.embed(url, viewerRef.current, options);

    // Clean up the Blob URL when the component unmounts or the book changes.
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [book]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--bg-secondary)'}}>
      <header className="flex items-center justify-between p-4 border-b z-10 flex-shrink-0" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)'}}>
        <div className="flex items-center">
            <button onClick={onBackToLibrary} className="p-2 rounded-full hover:bg-gray-200/60 transition-colors" style={{ color: 'var(--text-secondary)' }}>
              <BackIcon className="w-6 h-6" />
            </button>
            <h1 className="ml-4 text-xl font-semibold truncate" style={{ color: 'var(--text-primary)'}}>{book.title}</h1>
        </div>
        {/* The chat panel toggle has been removed as chat functionality is no longer available. */}
      </header>
      <div className="flex-grow relative min-h-0" ref={viewerRef}>
        {/* PDFObject will embed the PDF viewer here. */}
      </div>
       {/* The custom footer with page navigation has been removed. The embedded viewer has its own controls. */}
    </div>
  );
};

export default Reader;