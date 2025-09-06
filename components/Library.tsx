import React, { useState, useRef } from 'react';
import { Book, Chunk } from '../types';
import { BookIcon, DeleteIcon, UploadIcon } from './icons/Icons';
import Spinner from './ui/Spinner';
import { generateEmbeddingsBatch } from '../services/geminiService';

declare const pdfjsLib: any;

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

    try {
      setProcessingStatus('Reading PDF...');
      const fileBuffer = await file.arrayBuffer();
      
      // Create a copy for PDF.js to consume. This prevents the original buffer
      // from being "detached" when passed to the worker, which would prevent it
      // from being stored in IndexedDB.
      const pdfJsBuffer = fileBuffer.slice(0);

      const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(pdfJsBuffer),
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/cmaps/',
        cMapPacked: true,
      }).promise;
      const numPages = pdf.numPages;
      const fullText: string[] = [];
      const chunksWithoutEmbedding: Omit<Chunk, 'embedding'>[] = [];
      let chunkIdCounter = 0;

      const CHUNK_TARGET_SIZE = 1000; // chars
      const CHUNK_OVERLAP = 150; // chars

      for (let i = 1; i <= numPages; i++) {
        setProcessingStatus(`Processing page ${i}/${numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText.push(pageText);

        // Advanced chunking logic
        const sentences = pageText.replace(/([.?!])\s*(?=[A-Z])/g, "$1|").split("|");
        let currentChunkText = "";
        for (const sentence of sentences) {
            const trimmedSentence = sentence.trim();
            if (!trimmedSentence) continue;

            if (currentChunkText.length + trimmedSentence.length > CHUNK_TARGET_SIZE) {
                chunksWithoutEmbedding.push({ id: chunkIdCounter++, text: currentChunkText, page: i });
                // Create overlap
                currentChunkText = currentChunkText.slice(-CHUNK_OVERLAP) + " " + trimmedSentence;
            } else {
                currentChunkText += " " + trimmedSentence;
            }
        }
        if (currentChunkText.trim()) {
            chunksWithoutEmbedding.push({ id: chunkIdCounter++, text: currentChunkText.trim(), page: i });
        }
      }
      
      const chunksToEmbed = chunksWithoutEmbedding.map(c => c.text);
      setProcessingStatus(`Embedding ${chunksToEmbed.length} text chunks...`);

      const embeddings = await generateEmbeddingsBatch(chunksToEmbed);
      
      const embeddedChunks: Chunk[] = chunksWithoutEmbedding.map((chunk, i) => ({
        ...chunk,
        embedding: embeddings[i] || [], // Use generated embedding, or empty array on failure
      }));

      const newBook: Book = {
        id: `book-${Date.now()}`,
        title: file.name.replace(/\.pdf$/i, ''),
        fileBuffer,
        fullText,
        chunks: embeddedChunks,
      };

      onAddBook(newBook);
    } catch (err) {
      console.error("Error processing PDF:", err);
      setError("Failed to process PDF. Please ensure it's a valid file and try again.");
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
    <div className="container mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <header className="flex flex-col sm:flex-row items-center justify-between mb-12 border-b border-zinc-700 pb-6">
        <div>
            <h1 className="text-4xl font-bold tracking-tight text-white">My Library</h1>
            <p className="mt-2 text-zinc-400">Your personal collection of books, enhanced by AI.</p>
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
          className="mt-6 sm:mt-0 flex items-center justify-center gap-3 px-5 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-500 disabled:bg-zinc-600 disabled:cursor-not-allowed transition-all duration-200 w-60"
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
      
      {error && <div className="mb-6 p-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg">{error}</div>}

      {books.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {books.map(book => (
            <div key={book.id} className="group relative bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg hover:shadow-indigo-500/20 transition-all duration-300 transform hover:-translate-y-1">
              <div onClick={() => onSelectBook(book)} className="p-5 cursor-pointer flex flex-col items-start h-full">
                <div className="mb-4 p-3 bg-zinc-700 rounded-md">
                    <BookIcon className="w-8 h-8 text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-white flex-grow">{book.title}</h3>
                <p className="text-sm text-zinc-400 mt-1">{book.fullText.length} pages</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); onDeleteBook(book.id); }} 
                className="absolute top-2 right-2 p-1.5 rounded-full bg-zinc-700 text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all duration-200"
                aria-label="Delete book"
              >
                <DeleteIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border-2 border-dashed border-zinc-700 rounded-lg">
          <BookIcon className="mx-auto h-16 w-16 text-zinc-600" />
          <h2 className="mt-4 text-xl font-semibold text-zinc-300">Your library is empty</h2>
          <p className="mt-2 text-zinc-500">Upload your first PDF book to get started.</p>
        </div>
      )}
    </div>
  );
};

export default Library;