import { Book, ChatMessage } from '../types';

const DB_NAME = 'ReadingAgentDB';
const DB_VERSION = 2;
const STORE_NAME = 'books';
const CHAT_STORE = 'chatThreads';

export interface ChatThreadRecord {
  id: string;
  bookId: string;
  title: string;
  messages: (ChatMessage & { thoughts?: any[]; toolUses?: any[] })[];
  createdAt: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      // Chat threads store (per book)
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        const store = db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
        store.createIndex('bookId', 'bookId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
  return dbPromise;
}

export async function saveBook(book: Book): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(book);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getBooks(): Promise<Book[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteBook(bookId: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(bookId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Chat threads API
export async function saveChatThread(thread: ChatThreadRecord): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_STORE, 'readwrite');
    const store = tx.objectStore(CHAT_STORE);
    const record = { ...thread, updatedAt: Date.now() } as ChatThreadRecord;
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getChatThreads(bookId: string): Promise<ChatThreadRecord[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_STORE, 'readonly');
    const store = tx.objectStore(CHAT_STORE);
    const index = store.index('bookId');
    const request = index.getAll(IDBKeyRange.only(bookId));
    request.onsuccess = () => {
      const threads = (request.result || []).sort((a, b) => (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt));
      resolve(threads);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteChatThread(threadId: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_STORE, 'readwrite');
    const store = tx.objectStore(CHAT_STORE);
    store.delete(threadId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteChatThreadsForBook(bookId: string): Promise<void> {
  const threads = await getChatThreads(bookId);
  if (!threads.length) return;
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CHAT_STORE, 'readwrite');
    const store = tx.objectStore(CHAT_STORE);
    for (const t of threads) {
      store.delete(t.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
