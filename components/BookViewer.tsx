import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Book } from '../types';
import Spinner from './ui/Spinner';

declare const PDFObject: any;

interface BookViewerProps {
  book: Book;
  currentPage: number;
}

// Helper function to convert ArrayBuffer to a Base64 string for the data URL
function arrayBufferToDataURL(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = window.btoa(binary);
  return `data:application/pdf;base64,${base64}`;
}


const BookViewer: React.FC<BookViewerProps> = ({ book, currentPage }) => {
  const embedTargetRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize the data URL conversion to avoid re-computing on every render
  const pdfDataUrl = useMemo(() => {
    if (!book.fileBuffer || book.fileBuffer.byteLength === 0) {
        setError("Book file is empty or invalid.");
        return null;
    }
    try {
        return arrayBufferToDataURL(book.fileBuffer);
    } catch (e) {
        console.error("Failed to convert ArrayBuffer to Data URL:", e);
        setError("Could not process the book file.");
        return null;
    }
  }, [book.fileBuffer]);
  
  useEffect(() => {
    if (!embedTargetRef.current) return;
    
    // Clear previous content
    embedTargetRef.current.innerHTML = '';
    setIsLoading(true);
    setError(null);

    if (pdfDataUrl) {
      const urlWithOptions = `${pdfDataUrl}#page=${currentPage}`;
      
      const options = {
        pdfOpenParams: {
          view: 'FitV', // Fit the page vertically
        },
        // Styling the embed to ensure it fills the container
        attributes: {
            style: 'width: 100%; height: 100%; border: none;'
        }
      };

      const success = PDFObject.embed(urlWithOptions, embedTargetRef.current, options);
      if (!success) {
        setError("Failed to embed PDF. The browser may not support it or the file is corrupted.");
      }
    }

    // A small timeout to let the PDF viewer render before hiding the spinner
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);

  }, [pdfDataUrl, currentPage]);

  return (
    <div className="flex justify-center items-center h-full w-full bg-zinc-800 p-2 sm:p-4">
      {error && (
        <div className="text-red-400 p-4 text-center">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
        </div>
      )}
      <div 
        ref={embedTargetRef} 
        className="h-full w-full shadow-2xl" 
        style={{ display: error ? 'none' : 'block' }}
      />
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 bg-zinc-800">
          <Spinner className="w-10 h-10 mb-4" />
          <p>Loading PDF Viewer...</p>
        </div>
      )}
    </div>
  );
};

export default BookViewer;