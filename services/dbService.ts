import { Book, ChatMessage, Chunk } from '../types';

const DB_NAME = 'ReadingAgentDB';
const DB_VERSION = 3; // Incremented for new schema
const BOOKS_STORE = 'books';
const CHUNKS_STORE = 'chunks';
const CHAT_STORE = 'chatThreads';

export interface BookRecord {
  id: string;
  title: string;
  uploadedAt: string;
  totalPages: number;
  fileBuffer?: ArrayBuffer;
  pageCount?: number;
  fullText?: string;
  metadata?: any;
}

export interface ChunkRecord {
  id: string;
  bookId: string;
  pageNumber: number;
  content: string;
  embedding: number[];
  metadata?: any;
}

export interface ChatThreadRecord {
  id: string;
  bookId: string;
  title: string;
  messages: (ChatMessage & { thoughts?: any[]; toolUses?: any[] })[];
  createdAt: number;
  updatedAt: number;
}

class Database {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(new Error('Failed to open database.'));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Books store
        if (!db.objectStoreNames.contains(BOOKS_STORE)) {
          const bookStore = db.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
          bookStore.createIndex('uploadedAt', 'uploadedAt', { unique: false });
        }

        // Chunks store
        if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
          const chunkStore = db.createObjectStore(CHUNKS_STORE, { keyPath: 'id' });
          chunkStore.createIndex('bookId', 'bookId', { unique: false });
          chunkStore.createIndex('pageNumber', 'pageNumber', { unique: false });
          chunkStore.createIndex('bookId_pageNumber', ['bookId', 'pageNumber'], { unique: false });
        }

        // Chat threads store
        if (!db.objectStoreNames.contains(CHAT_STORE)) {
          const chatStore = db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
          chatStore.createIndex('bookId', 'bookId', { unique: false });
          chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  // Books operations
  books = {
    put: async (book: BookRecord): Promise<void> => {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(BOOKS_STORE, 'readwrite');
        const store = transaction.objectStore(BOOKS_STORE);
        store.put(book);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    },

    get: async (id: string): Promise<BookRecord | undefined> => {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(BOOKS_STORE, 'readonly');
        const store = transaction.objectStore(BOOKS_STORE);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    toArray: async (): Promise<BookRecord[]> => {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(BOOKS_STORE, 'readonly');
        const store = transaction.objectStore(BOOKS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    },

    delete: async (id: string): Promise<void> => {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(BOOKS_STORE, 'readwrite');
        const store = transaction.objectStore(BOOKS_STORE);
        store.delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
  };

  // Chunks operations
  chunks = {
    put: async (chunk: ChunkRecord): Promise<void> => {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHUNKS_STORE, 'readwrite');
        const store = transaction.objectStore(CHUNKS_STORE);
        store.put(chunk);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    },

    bulkPut: async (chunks: ChunkRecord[]): Promise<void> => {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHUNKS_STORE, 'readwrite');
        const store = transaction.objectStore(CHUNKS_STORE);

        chunks.forEach(chunk => store.put(chunk));

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    },

    where: (field: string) => ({
      equals: async (value: any): Promise<{ toArray: () => Promise<ChunkRecord[]> }> => {
        const db = await this.getDb();
        return {
          toArray: async () => {
            return new Promise((resolve, reject) => {
              const transaction = db.transaction(CHUNKS_STORE, 'readonly');
              const store = transaction.objectStore(CHUNKS_STORE);
              const index = store.index(field);
              const request = index.getAll(IDBKeyRange.only(value));
              request.onsuccess = () => resolve(request.result || []);
              request.onerror = () => reject(request.error);
            });
          }
        };
      }
    }),

    deleteByBookId: async (bookId: string): Promise<void> => {
      const db = await this.getDb();
      const chunks = await (await this.chunks.where('bookId').equals(bookId)).toArray();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHUNKS_STORE, 'readwrite');
        const store = transaction.objectStore(CHUNKS_STORE);

        chunks.forEach(chunk => store.delete(chunk.id));

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
  };

  // Chat threads operations (keeping backwards compatibility)
  chatThreads = {
    save: async (thread: ChatThreadRecord): Promise<void> => {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CHAT_STORE, 'readwrite');
        const store = tx.objectStore(CHAT_STORE);
        const record = { ...thread, updatedAt: Date.now() } as ChatThreadRecord;
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    getByBookId: async (bookId: string): Promise<ChatThreadRecord[]> => {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CHAT_STORE, 'readonly');
        const store = tx.objectStore(CHAT_STORE);
        const index = store.index('bookId');
        const request = index.getAll(IDBKeyRange.only(bookId));
        request.onsuccess = () => {
          const threads = (request.result || []).sort((a, b) =>
            (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt)
          );
          resolve(threads);
        };
        request.onerror = () => reject(request.error);
      });
    },

    delete: async (threadId: string): Promise<void> => {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CHAT_STORE, 'readwrite');
        const store = tx.objectStore(CHAT_STORE);
        store.delete(threadId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    deleteByBookId: async (bookId: string): Promise<void> => {
      const threads = await this.chatThreads.getByBookId(bookId);
      if (!threads.length) return;

      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CHAT_STORE, 'readwrite');
        const store = tx.objectStore(CHAT_STORE);
        threads.forEach(t => store.delete(t.id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  };
}

// Create database instance
export const db = new Database();

// Legacy functions for backward compatibility
export async function saveBook(book: Book): Promise<void> {
  // Save book metadata
  await db.books.put({
    id: book.id,
    title: book.title,
    uploadedAt: new Date().toISOString(),
    totalPages: book.totalPages || book.chunks.length,
    fileBuffer: book.fileBuffer,
    pageCount: book.pageCount,
    fullText: book.fullText,
    metadata: book.metadata
  });

  // Save chunks
  const chunkRecords: ChunkRecord[] = book.chunks.map(chunk => ({
    id: chunk.id,
    bookId: book.id,
    pageNumber: chunk.pageNumber,
    content: chunk.content,
    embedding: chunk.embedding,
    metadata: chunk.metadata
  }));

  await db.chunks.bulkPut(chunkRecords);
}

export async function getBooks(): Promise<Book[]> {
  const bookRecords = await db.books.toArray();
  console.log('Loading books from database, count:', bookRecords.length);

  // Create a map of original books for fileBuffer fallback
  const originalBooksMap = new Map<string, ArrayBuffer>();
  bookRecords.forEach(book => {
    if (book.fileBuffer && !book.metadata?.originalBookId) {
      // This is an original book (not a translation)
      originalBooksMap.set(book.id, book.fileBuffer);
    }
  });

  // Load chunks for each book
  const books = await Promise.all(
    bookRecords.map(async (bookRecord) => {
      const chunks = await (await db.chunks.where('bookId').equals(bookRecord.id)).toArray();

      // Try to get fileBuffer, fallback to original book's buffer if this is a translation
      let fileBuffer = bookRecord.fileBuffer;
      if (!fileBuffer && bookRecord.metadata?.originalBookId) {
        fileBuffer = originalBooksMap.get(bookRecord.metadata.originalBookId);
        if (fileBuffer) {
          console.log(`Using original book's fileBuffer for translation ${bookRecord.id}`);
        }
      }

      console.log(`Book ${bookRecord.id}: fileBuffer exists:`, !!fileBuffer,
                  fileBuffer ? `size: ${fileBuffer.byteLength}` : 'no buffer');

      return {
        id: bookRecord.id,
        title: bookRecord.title,
        chunks: chunks,
        totalPages: bookRecord.totalPages,
        fileBuffer: fileBuffer,
        pageCount: bookRecord.pageCount,
        fullText: bookRecord.fullText,
        metadata: bookRecord.metadata
      } as Book;
    })
  );

  return books;
}

export async function getBook(bookId: string): Promise<Book | null> {
  const bookRecord = await db.books.get(bookId);

  if (!bookRecord) {
    return null;
  }

  // Get chunks for this book
  const chunks = await (await db.chunks.where('bookId').equals(bookId)).toArray();

  // Make a safe copy of fileBuffer if it exists
  let fileBuffer: ArrayBuffer | undefined;
  if (bookRecord.fileBuffer) {
    try {
      // Create a fresh copy of the ArrayBuffer
      fileBuffer = bookRecord.fileBuffer.slice(0);
    } catch (error) {
      console.warn('Could not clone fileBuffer for book:', bookId, error);
      fileBuffer = bookRecord.fileBuffer;
    }
  }

  console.log(`Book ${bookId}: fileBuffer exists:`, !!fileBuffer,
              fileBuffer ? `size: ${fileBuffer.byteLength}` : 'no buffer');

  return {
    id: bookRecord.id,
    title: bookRecord.title,
    chunks: chunks,
    totalPages: bookRecord.totalPages,
    fileBuffer: fileBuffer,
    pageCount: bookRecord.pageCount,
    fullText: bookRecord.fullText,
    metadata: bookRecord.metadata
  } as Book;
}

export async function deleteBook(bookId: string): Promise<void> {
  // Delete chunks first
  await db.chunks.deleteByBookId(bookId);
  // Then delete the book
  await db.books.delete(bookId);
  // Also delete related chat threads
  await db.chatThreads.deleteByBookId(bookId);
}

// Export legacy chat functions
export const saveChatThread = db.chatThreads.save;
export const getChatThreads = db.chatThreads.getByBookId;
export const deleteChatThread = db.chatThreads.delete;
export const deleteChatThreadsForBook = db.chatThreads.deleteByBookId;