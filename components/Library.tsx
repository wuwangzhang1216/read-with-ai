import React, { useState, useRef } from 'react';
import { Book } from '../types';
import { BookIcon, DeleteIcon, UploadIcon } from './icons/Icons';
import Spinner from './ui/Spinner';

interface LibraryProps {
  books: Book[];
  onAddBook: (book: Book) => void;
  onSelectBook: (book: Book) => void;
  onDeleteBook: (bookId: string) => void;
}

const Library: React.FC<LibraryProps> = ({ books, onAddBook, onSelectBook, onDeleteBook }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setProcessingStatus('Processing...');

    try {
      const fileBuffer = await file.arrayBuffer();

      const newBook: Book = {
        id: `book-${Date.now()}`,
        title: file.name.replace(/\.pdf$/i, ''),
        fileBuffer,
      };

      onAddBook(newBook);
    } catch (err) {
      console.error("Error processing file:", err);
      setError("Failed to process file. Please ensure it's a valid PDF and try again.");
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-12 sm:py-16">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-12 pb-6 border-b" style={{ borderColor: 'var(--border-color)'}}>
        <div>
            <h1 className="text-5xl font-bold tracking-tight" style={{ color: 'var(--text-primary)'}}>Library</h1>
            <p className="mt-2 text-lg" style={{ color: 'var(--text-secondary)'}}>Your personal collection of books.</p>
        </div>
        <input
          type="file"
          accept=".pdf"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          disabled={isProcessing}
        />
        <button
          onClick={triggerFileUpload}
          disabled={isProcessing}
          className="mt-6 sm:mt-0 flex items-center justify-center gap-3 px-6 py-3 font-semibold rounded-md transition-all duration-200 w-60 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ 
              backgroundColor: isProcessing ? 'var(--hover-color)' : 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              border: `1px solid ${isProcessing ? 'transparent' : 'var(--border-color)'}`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
          onMouseOver={(e) => !isProcessing && (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
          onMouseOut={(e) => !isProcessing && (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
        >
          {isProcessing ? (
            <>
              <Spinner />
              <span className="truncate">{processingStatus || 'Processing...'}</span>
            </>
          ) : (
            <>
              <UploadIcon />
              Upload Book
            </>
          )}
        </button>
      </header>
      
      {error && <div className="mb-6 p-4 border rounded-lg" style={{ backgroundColor: '#fff2f2', borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>{error}</div>}

      {books.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-10">
          {books.map(book => (
            <div key={book.id} className="group relative text-center cursor-pointer">
              <div 
                onClick={() => onSelectBook(book)} 
                className="relative h-64 w-full rounded-md transition-all duration-300 transform group-hover:-translate-y-1"
                style={{ 
                    backgroundColor: 'var(--bg-secondary)', 
                    boxShadow: 'var(--card-shadow)',
                    border: '1px solid var(--border-color)'
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-md"></div>
                <div className="absolute right-2 top-2 bottom-2 w-6 bg-white/70 rounded-sm" style={{ writingMode: 'vertical-rl' }}>
                  <span className="text-sm font-semibold tracking-wider text-center" style={{ color: 'var(--text-secondary)'}}>{book.title}</span>
                </div>
              </div>
              <h3 className="text-base font-semibold mt-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-serif)'}}>{book.title}</h3>
              
              <button 
                onClick={(e) => { e.stopPropagation(); onDeleteBook(book.id); }} 
                className="absolute top-0 right-0 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-100 scale-90"
                style={{ backgroundColor: 'var(--accent-red)'}}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-red-hover)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-red)'}
                aria-label="Delete book"
              >
                <DeleteIcon className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border-2 border-dashed rounded-lg" style={{ borderColor: 'var(--border-color)'}}>
          <BookIcon className="mx-auto h-16 w-16" style={{ color: 'var(--border-color)'}} />
          <h2 className="mt-4 text-2xl" style={{ color: 'var(--text-primary)'}}>Your library is empty</h2>
          <p className="mt-2 text-lg" style={{ color: 'var(--text-secondary)'}}>Upload your first book to get started.</p>
        </div>
      )}
    </div>
  );
};

export default Library;