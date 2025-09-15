import React, { useState, useEffect } from 'react';
import { Book } from './types';
import Library from './components/Library';
import Reader from './components/Reader';
import * as dbService from './services/dbService';

const App: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    const loadBooks = async () => {
      try {
        const storedBooks = await dbService.getBooks();
        setBooks(storedBooks);
      } catch (error) {
        console.error("Failed to load books from IndexedDB:", error);
      } finally {
        setIsInitializing(false);
      }
    };
    loadBooks();
  }, []);

  const handleAddBook = async (newBook: Book) => {
    try {
      await dbService.saveBook(newBook);
      const updatedBooks = [...books, newBook];
      setBooks(updatedBooks);
      setSelectedBook(newBook);
    } catch (error) {
      console.error("Failed to save book:", error);
    }
  };

  const handleUpdateBooks = async () => {
    try {
      const storedBooks = await dbService.getBooks();
      setBooks(storedBooks);
    } catch (error) {
      console.error("Failed to reload books:", error);
    }
  };

  const handleDeleteBook = async (bookId: string) => {
    try {
      await dbService.deleteBook(bookId);
      try { await dbService.deleteChatThreadsForBook(bookId); } catch {}
      const updatedBooks = books.filter(book => book.id !== bookId);
      setBooks(updatedBooks);
    } catch (error) {
      console.error("Failed to delete book:", error);
    }
  };

  const handleSelectBook = (book: Book) => {
    setSelectedBook(book);
  };

  const handleBackToLibrary = () => {
    setSelectedBook(null);
  };
  
  if (isInitializing) {
    return (
        <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--bg-primary)'}}>
            <h1 className="text-2xl font-medium" style={{ color: 'var(--text-secondary)'}}>Loading Library...</h1>
        </div>
    );
  }

  return (
    <div className="min-h-screen">
      {selectedBook ? (
        <Reader
          book={selectedBook}
          onBackToLibrary={handleBackToLibrary}
          onSelectTranslatedBook={async (translatedBook: Book) => {
            // Refresh the books list first
            await handleUpdateBooks();

            // Load the translated book from database to ensure we have a fresh copy
            const freshBook = await dbService.getBook(translatedBook.id);
            if (freshBook) {
              setSelectedBook(freshBook);
            } else {
              // Fallback to the provided book if not found
              setSelectedBook(translatedBook);
            }
          }}
        />
      ) : (
        <Library
          books={books}
          onAddBook={handleAddBook}
          onSelectBook={handleSelectBook}
          onDeleteBook={handleDeleteBook}
        />
      )}
    </div>
  );
};

export default App;
