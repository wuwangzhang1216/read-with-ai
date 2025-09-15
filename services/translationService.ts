import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Document } from "@langchain/core/documents";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { Book, Chunk } from "../types";
import { generateEmbeddingsBatch } from "./enhancedRagService";
import { db } from "./dbService";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

export interface TranslationOptions {
  targetLanguage: string;
  sourceLanguage?: string;
  batchSize?: number;
  maxWorkers?: number;
  preserveFormatting?: boolean;
}

export interface TranslationProgress {
  current: number;
  total: number;
  status: string;
  currentPage?: number;
}

export interface TranslationResult {
  success: boolean;
  book?: Book;
  error?: string;
  translatedPages: number;
}

export type TranslationCallback = (progress: TranslationProgress) => void;

class PDFTranslationService {
  private llm: ChatGoogleGenerativeAI;
  private maxConcurrentTranslations: number = 10; // Increased for better parallelization
  private batchSize: number = 5; // Number of chunks to translate together

  constructor() {
    // Use gemini-2.0-flash-lite for faster translation
    this.llm = new ChatGoogleGenerativeAI({
      apiKey: process.env.API_KEY!,
      model: "gemini-2.0-flash-lite", // Use gemini-2.0-flash-lite as requested
      temperature: 0.1, // Lower temperature for more consistent translations
      maxOutputTokens: 8000, // Increased for batch translations
    });
  }

  /**
   * Translate multiple texts in a single API call for efficiency
   */
  private async translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage: string = "auto"
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    // Filter out empty texts but keep track of indices
    const nonEmptyIndices: number[] = [];
    const nonEmptyTexts: string[] = [];

    texts.forEach((text, index) => {
      if (text && text.trim()) {
        nonEmptyIndices.push(index);
        nonEmptyTexts.push(text);
      }
    });

    if (nonEmptyTexts.length === 0) {
      return texts; // Return original if all empty
    }

    const batchPrompt = PromptTemplate.fromTemplate(`
You are a professional translator. Translate the following {count} text segments from {sourceLanguage} to {targetLanguage}.

CRITICAL REQUIREMENTS:
1. Translate each segment independently
2. Maintain exact formatting for each segment (line breaks, spacing, indentation)
3. Preserve technical terms, code snippets, URLs, emails appropriately
4. Return EXACTLY {count} translations, separated by the delimiter: <<<TRANSLATION_BOUNDARY>>>
5. Do not add any explanations, notes, or extra text
6. Keep the same order as the input

Text segments to translate:
{segments}

Translated segments (separated by <<<TRANSLATION_BOUNDARY>>>):
`);

    try {
      const segmentsText = nonEmptyTexts.map((text, i) =>
        `[SEGMENT ${i + 1}]\n${text}\n[END SEGMENT ${i + 1}]`
      ).join('\n\n');

      const chain = batchPrompt.pipe(this.llm).pipe(new StringOutputParser());
      const response = await chain.invoke({
        sourceLanguage: sourceLanguage === "auto" ? "the source language" : sourceLanguage,
        targetLanguage,
        count: nonEmptyTexts.length,
        segments: segmentsText
      });

      // Parse the response
      console.log('Translation API response length:', response.length);
      console.log('Response preview:', response.substring(0, 300));

      const translations = response.split('<<<TRANSLATION_BOUNDARY>>>').map(t => {
        // Remove SEGMENT markers from each translation
        let cleaned = t.trim();
        // Remove [SEGMENT X] and [END SEGMENT X] markers
        cleaned = cleaned.replace(/\[SEGMENT \d+\]\s*/g, '');
        cleaned = cleaned.replace(/\s*\[END SEGMENT \d+\]/g, '');
        return cleaned.trim();
      });
      console.log(`Parsed ${translations.length} translations from response`);

      // Reconstruct the full array with translated texts at correct positions
      const result = [...texts];
      nonEmptyIndices.forEach((originalIndex, i) => {
        if (i < translations.length) {
          result[originalIndex] = translations[i];
          console.log(`Translation ${i}: "${texts[originalIndex].substring(0, 30)}" -> "${translations[i].substring(0, 30)}"`);
        }
      });

      return result;
    } catch (error) {
      console.error("Batch translation error:", error);
      // Fallback to returning original texts
      return texts;
    }
  }

  /**
   * Process chunks in parallel batches for maximum speed
   */
  private async translateChunksParallel(
    chunks: Chunk[],
    targetLanguage: string,
    sourceLanguage: string = "auto",
    onProgress?: TranslationCallback
  ): Promise<Chunk[]> {
    const totalChunks = chunks.length;
    let processedChunks = 0;

    // Group chunks into batches
    const batches: Chunk[][] = [];
    for (let i = 0; i < chunks.length; i += this.batchSize) {
      batches.push(chunks.slice(i, Math.min(i + this.batchSize, chunks.length)));
    }

    onProgress?.({
      current: 0,
      total: totalChunks,
      status: `Preparing ${batches.length} translation batches...`,
    });

    // Process multiple batches in parallel
    const translatedChunks: Chunk[] = new Array(chunks.length);
    const batchPromises: Promise<void>[] = [];

    // Use a semaphore to limit concurrent requests
    let activeBatches = 0;
    const maxConcurrent = this.maxConcurrentTranslations;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      // Wait if we've reached max concurrent batches
      while (activeBatches >= maxConcurrent) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      activeBatches++;

      const batch = batches[batchIndex];
      const startIdx = batchIndex * this.batchSize;

      const batchPromise = (async () => {
        try {
          // Extract texts from chunks
          const texts = batch.map(chunk => chunk.content);

          // Translate the batch
          const translatedTexts = await this.translateBatch(
            texts,
            targetLanguage,
            sourceLanguage
          );

          // Create translated chunks
          batch.forEach((chunk, i) => {
            const globalIdx = startIdx + i;
            const originalContent = chunk.content;
            const translatedContent = translatedTexts[i];

            console.log(`Chunk ${globalIdx} translation:`,
              {
                original: originalContent.substring(0, 50),
                translated: translatedContent.substring(0, 50),
                isChanged: originalContent !== translatedContent
              }
            );

            translatedChunks[globalIdx] = {
              ...chunk,
              content: translatedContent,
              metadata: {
                ...chunk.metadata,
                originalLanguage: sourceLanguage,
                translatedTo: targetLanguage,
                translatedAt: new Date().toISOString(),
                originalContent: originalContent // Store original for comparison
              }
            };
          });

          // Update progress
          processedChunks += batch.length;
          onProgress?.({
            current: processedChunks,
            total: totalChunks,
            status: `Translated ${processedChunks}/${totalChunks} chunks (batch ${batchIndex + 1}/${batches.length})`,
            currentPage: batch[batch.length - 1].pageNumber
          });
        } finally {
          activeBatches--;
        }
      })();

      batchPromises.push(batchPromise);
    }

    // Wait for all batches to complete
    await Promise.all(batchPromises);

    return translatedChunks;
  }

  /**
   * Generate translated PDF on server (legacy method)
   */
  async generateTranslatedPDF(
    book: Book,
    targetLanguage: string,
    chunks: Chunk[],
    method: 'overlay' | 'redaction' = 'overlay'
  ): Promise<ArrayBuffer> {
    try {
      // Create FormData with PDF and chunks
      const formData = new FormData();

      // Add the PDF file
      const pdfBlob = new Blob([book.fileBuffer!], { type: 'application/pdf' });
      formData.append('pdf', pdfBlob, 'document.pdf');

      // Add chunks data
      formData.append('chunks', JSON.stringify(chunks));
      formData.append('targetLanguage', targetLanguage);
      formData.append('method', method);

      // Send to server
      const response = await fetch('http://localhost:3001/api/translate-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      // Get the translated PDF buffer
      const pdfBuffer = await response.arrayBuffer();
      return pdfBuffer;

    } catch (error) {
      console.error('Failed to generate translated PDF:', error);
      throw error;
    }
  }

  /**
   * Generate translated PDF using Python service with layout preservation
   */
  async generateTranslatedPDFPython(
    book: Book,
    targetLanguage: string,
    method: 'overlay' | 'redaction' | 'auto' = 'auto'
  ): Promise<ArrayBuffer> {
    try {
      // Create FormData with PDF
      const formData = new FormData();

      // Add the PDF file
      const pdfBlob = new Blob([book.fileBuffer!], { type: 'application/pdf' });
      formData.append('pdf', pdfBlob, 'document.pdf');

      // Add parameters
      formData.append('targetLanguage', targetLanguage);
      formData.append('method', method);
      formData.append('apiKey', process.env.API_KEY || '');

      console.log(`Sending PDF for Python translation: ${targetLanguage}, method: ${method}`);

      // Send to Python translation endpoint
      const response = await fetch('http://localhost:3001/api/translate-pdf-python', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Server error: ${response.statusText} - ${error}`);
      }

      // Get the translated PDF buffer
      const pdfBuffer = await response.arrayBuffer();
      console.log('Received translated PDF from Python service, size:', pdfBuffer.byteLength);

      return pdfBuffer;

    } catch (error) {
      console.error('Failed to generate translated PDF with Python:', error);
      // Fall back to legacy method
      console.log('Falling back to legacy translation method...');
      throw error;
    }
  }

  /**
   * Translate an entire book with optimized parallel processing
   */
  async translateBook(
    book: Book,
    options: TranslationOptions,
    onProgress?: TranslationCallback
  ): Promise<TranslationResult> {
    try {
      const {
        targetLanguage,
        sourceLanguage = "auto",
        batchSize = 5,
        maxWorkers = 10
      } = options;

      // Update settings if provided
      if (batchSize) this.batchSize = batchSize;
      if (maxWorkers) this.maxConcurrentTranslations = maxWorkers;

      // Validate input
      if (!book || !book.chunks || book.chunks.length === 0) {
        throw new Error("Invalid book or no content to translate");
      }

      const startTime = Date.now();

      onProgress?.({
        current: 0,
        total: book.chunks.length,
        status: `Starting parallel translation to ${targetLanguage}...`,
      });

      // Translate chunks in parallel
      const translatedChunks = await this.translateChunksParallel(
        book.chunks,
        targetLanguage,
        sourceLanguage,
        onProgress
      );

      const translationTime = (Date.now() - startTime) / 1000;
      console.log(`Translation completed in ${translationTime.toFixed(1)} seconds`);

      onProgress?.({
        current: translatedChunks.length,
        total: translatedChunks.length,
        status: "Generating embeddings for translated content...",
      });

      // Generate embeddings in batches for efficiency
      const embeddingBatchSize = 20;
      const allEmbeddings: number[][] = [];

      for (let i = 0; i < translatedChunks.length; i += embeddingBatchSize) {
        const batch = translatedChunks.slice(i, Math.min(i + embeddingBatchSize, translatedChunks.length));
        const batchTexts = batch.map(chunk => chunk.content);
        const batchEmbeddings = await generateEmbeddingsBatch(batchTexts);
        allEmbeddings.push(...batchEmbeddings);

        onProgress?.({
          current: translatedChunks.length,
          total: translatedChunks.length,
          status: `Generating embeddings... ${Math.min(i + embeddingBatchSize, translatedChunks.length)}/${translatedChunks.length}`,
        });
      }

      // Update chunks with embeddings
      const chunksWithEmbeddings = translatedChunks.map((chunk, index) => ({
        ...chunk,
        embedding: allEmbeddings[index]
      }));

      // Generate the translated PDF on server
      let translatedPdfBuffer: ArrayBuffer | undefined;

      onProgress?.({
        current: translatedChunks.length,
        total: translatedChunks.length,
        status: "Generating translated PDF...",
      });

      try {
        translatedPdfBuffer = await this.generateTranslatedPDF(
          book,
          targetLanguage,
          chunksWithEmbeddings,
          'overlay' // Use overlay method to preserve original format
        );
        console.log('Generated translated PDF, size:', translatedPdfBuffer.byteLength);
      } catch (error) {
        console.error('Failed to generate translated PDF, using original:', error);
        // Fall back to original PDF if generation fails
        if (book.fileBuffer) {
          try {
            translatedPdfBuffer = book.fileBuffer.slice(0);
          } catch (e) {
            console.warn('Could not clone original fileBuffer:', e);
          }
        }
      }

      const translatedBook: Book = {
        ...book,
        id: `${book.id}_${targetLanguage}_${Date.now()}`,
        title: `${book.title} (${targetLanguage})`,
        fileBuffer: translatedPdfBuffer, // Use the generated translated PDF
        pageCount: book.pageCount,
        totalPages: book.totalPages || book.pageCount,
        chunks: chunksWithEmbeddings,
        metadata: {
          ...book.metadata,
          originalBookId: book.id,
          originalTitle: book.title,
          translatedTo: targetLanguage,
          translatedFrom: sourceLanguage,
          translationDate: new Date().toISOString(),
          translationTimeSeconds: translationTime,
          totalPages: book.totalPages || book.pageCount,
          chunkCount: chunksWithEmbeddings.length
        }
      };

      onProgress?.({
        current: translatedChunks.length,
        total: translatedChunks.length,
        status: "Saving translated book to database...",
      });

      // Save to database
      await this.saveTranslatedBook(translatedBook);

      onProgress?.({
        current: translatedChunks.length,
        total: translatedChunks.length,
        status: `Translation completed in ${translationTime.toFixed(1)}s!`,
      });

      return {
        success: true,
        book: translatedBook,
        translatedPages: book.totalPages || translatedChunks.length
      };

    } catch (error) {
      console.error("Book translation error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Translation failed",
        translatedPages: 0
      };
    }
  }

  /**
   * Save translated book to database
   */
  private async saveTranslatedBook(book: Book): Promise<void> {
    try {
      // Clone ArrayBuffer if it exists to avoid detached buffer issues
      let safeFileBuffer: ArrayBuffer | undefined;
      if (book.fileBuffer) {
        console.log('Book has fileBuffer before save, size:', book.fileBuffer.byteLength);
        try {
          // Attempt to clone the buffer
          safeFileBuffer = book.fileBuffer.slice(0);
          console.log('Cloned fileBuffer for save, size:', safeFileBuffer.byteLength);
        } catch (error) {
          console.warn('Could not clone fileBuffer for database save:', error);
          safeFileBuffer = undefined;
        }
      } else {
        console.warn('Book does not have fileBuffer to save!');
      }

      // Save book metadata
      await db.books.put({
        id: book.id,
        title: book.title,
        uploadedAt: new Date().toISOString(),
        totalPages: book.totalPages || book.chunks.length,
        fileBuffer: safeFileBuffer,
        pageCount: book.pageCount,
        fullText: book.fullText,
        metadata: book.metadata
      });

      // Save chunks in batches for better performance
      const chunkBatchSize = 50;
      for (let i = 0; i < book.chunks.length; i += chunkBatchSize) {
        const batch = book.chunks.slice(i, Math.min(i + chunkBatchSize, book.chunks.length));
        const chunkPromises = batch.map(chunk =>
          db.chunks.put({
            id: chunk.id,
            bookId: book.id,
            pageNumber: chunk.pageNumber,
            content: chunk.content,
            embedding: chunk.embedding,
            metadata: chunk.metadata
          })
        );
        await Promise.all(chunkPromises);
      }
    } catch (error) {
      console.error("Error saving translated book:", error);
      throw new Error("Failed to save translated book to database");
    }
  }

  /**
   * Get available languages for translation
   */
  getAvailableLanguages(): string[] {
    return [
      "English",
      "Spanish",
      "French",
      "German",
      "Italian",
      "Portuguese",
      "Dutch",
      "Russian",
      "Chinese (Simplified)",
      "Chinese (Traditional)",
      "Japanese",
      "Korean",
      "Arabic",
      "Hindi",
      "Turkish",
      "Polish",
      "Swedish",
      "Norwegian",
      "Danish",
      "Finnish",
      "Greek",
      "Czech",
      "Hungarian",
      "Romanian",
      "Thai",
      "Vietnamese",
      "Indonesian",
      "Malay",
      "Hebrew",
      "Ukrainian"
    ];
  }

  /**
   * Detect language of text using the fast model
   */
  async detectLanguage(text: string): Promise<string> {
    const detectPrompt = PromptTemplate.fromTemplate(`
Detect the language of the following text. Return only the language name in English (e.g., "English", "Spanish", "Chinese").

Text:
"""
{text}
"""

Language:
`);

    try {
      const chain = detectPrompt.pipe(this.llm).pipe(new StringOutputParser());
      const language = await chain.invoke({ text: text.substring(0, 500) });
      return language.trim();
    } catch (error) {
      console.error("Language detection error:", error);
      return "Unknown";
    }
  }

  /**
   * Translate a specific page range with parallel processing
   */
  async translatePageRange(
    book: Book,
    startPage: number,
    endPage: number,
    targetLanguage: string,
    onProgress?: TranslationCallback
  ): Promise<Chunk[]> {
    const chunksToTranslate = book.chunks.filter(
      chunk => chunk.pageNumber >= startPage && chunk.pageNumber <= endPage
    );

    if (chunksToTranslate.length === 0) {
      throw new Error(`No content found in page range ${startPage}-${endPage}`);
    }

    return this.translateChunksParallel(
      chunksToTranslate,
      targetLanguage,
      "auto",
      onProgress
    );
  }

  /**
   * Check if a book has been translated to a specific language
   */
  async hasTranslation(bookId: string, targetLanguage: string): Promise<boolean> {
    try {
      const books = await db.books.toArray();
      return books.some(book =>
        book.metadata?.originalBookId === bookId &&
        book.metadata?.translatedTo === targetLanguage
      );
    } catch (error) {
      console.error("Error checking translation:", error);
      return false;
    }
  }

  /**
   * Get all translations of a book
   */
  async getBookTranslations(bookId: string): Promise<Book[]> {
    try {
      const books = await db.books.toArray();
      const translations = books.filter(book =>
        book.metadata?.originalBookId === bookId
      );

      console.log(`Found ${translations.length} translations for book ${bookId}`);

      // Find the original book's fileBuffer for fallback
      const originalBook = books.find(book => book.id === bookId);
      const originalFileBuffer = originalBook?.fileBuffer;

      // Load chunks for each translation in parallel
      const translatedBooks = await Promise.all(
        translations.map(async (bookMeta) => {
          const chunks = await (await db.chunks.where('bookId').equals(bookMeta.id)).toArray();

          // Use translation's fileBuffer if available, otherwise fallback to original
          let fileBuffer = bookMeta.fileBuffer || originalFileBuffer;

          console.log(`Translation ${bookMeta.id}: fileBuffer exists:`, !!fileBuffer,
                      fileBuffer ? `size: ${fileBuffer.byteLength}` : 'no buffer',
                      !bookMeta.fileBuffer && fileBuffer ? '(using original)' : '');

          return {
            id: bookMeta.id,
            title: bookMeta.title,
            chunks: chunks,
            totalPages: bookMeta.totalPages,
            fileBuffer: fileBuffer,
            pageCount: bookMeta.pageCount,
            fullText: bookMeta.fullText,
            metadata: bookMeta.metadata
          } as Book;
        })
      );

      return translatedBooks;
    } catch (error) {
      console.error("Error getting translations:", error);
      return [];
    }
  }

  /**
   * Estimate translation time based on content size and parallel processing
   */
  estimateTranslationTime(book: Book): { minutes: number; seconds: number } {
    const totalChunks = book.chunks.length;
    const batchCount = Math.ceil(totalChunks / this.batchSize);
    const parallelBatches = Math.ceil(batchCount / this.maxConcurrentTranslations);

    // Estimate ~1.5 seconds per batch with gemini-2.0-flash-lite
    const estimatedSeconds = Math.ceil(parallelBatches * 1.5);

    return {
      minutes: Math.floor(estimatedSeconds / 60),
      seconds: estimatedSeconds % 60
    };
  }

  /**
   * Translate book with Python service for better layout preservation
   */
  async translateBookWithPython(
    book: Book,
    options: TranslationOptions,
    onProgress?: TranslationCallback
  ): Promise<TranslationResult> {
    try {
      const { targetLanguage } = options;

      if (!book || !book.fileBuffer) {
        throw new Error("Invalid book or no PDF file to translate");
      }

      const startTime = Date.now();
      const totalPages = book.totalPages || book.pageCount || 1;

      onProgress?.({
        current: 0,
        total: 100,
        status: `Starting translation to ${targetLanguage}...`,
      });

      // Simulate progress updates based on estimated time
      let progressInterval: NodeJS.Timeout | null = null;
      let currentProgress = 0;

      // Estimate time per page (2-3 seconds per page typically)
      const estimatedSecondsPerPage = 2.5;
      const estimatedTotalTime = totalPages * estimatedSecondsPerPage * 1000; // in ms
      const updateInterval = 1000; // Update every second
      const progressIncrement = (updateInterval / estimatedTotalTime) * 90; // Max 90% from simulation

      // Start progress simulation
      progressInterval = setInterval(() => {
        currentProgress = Math.min(currentProgress + progressIncrement * 100, 90); // Max 90% until actual completion
        const currentPageEstimate = Math.ceil((currentProgress / 100) * totalPages);
        onProgress?.({
          current: currentProgress,
          total: 100,
          status: `Translating page ${currentPageEstimate} of ${totalPages}...`,
          currentPage: currentPageEstimate
        });
      }, updateInterval);

      // Use Python service for translation
      const translatedPdfBuffer = await this.generateTranslatedPDFPython(
        book,
        targetLanguage,
        'auto' // Auto-detect best method
      ).finally(() => {
        // Clear the progress interval
        if (progressInterval) {
          clearInterval(progressInterval);
        }
      });

      const translationTime = (Date.now() - startTime) / 1000;
      console.log(`Python translation completed in ${translationTime.toFixed(1)} seconds`);

      // Create translated book object with a fresh copy of the buffer
      const translatedBook: Book = {
        ...book,
        id: `${book.id}_${targetLanguage}_python_${Date.now()}`,
        title: `${book.title} (${targetLanguage})`,
        fileBuffer: translatedPdfBuffer.slice(0), // Create a copy to avoid detachment
        pageCount: book.pageCount,
        totalPages: book.totalPages || book.pageCount,
        chunks: book.chunks, // Keep original chunks for now
        metadata: {
          ...book.metadata,
          originalBookId: book.id,
          originalTitle: book.title,
          translatedTo: targetLanguage,
          translatedFrom: 'auto',
          translationDate: new Date().toISOString(),
          translationTimeSeconds: translationTime,
          translationMethod: 'python-pymupdf',
          totalPages: book.totalPages || book.pageCount,
        }
      };

      onProgress?.({
        current: 95,
        total: 100,
        status: "Saving translated book to library...",
      });

      // Save to database
      await this.saveTranslatedBook(translatedBook);

      onProgress?.({
        current: 100,
        total: 100,
        status: `Translation completed! ${totalPages} pages in ${translationTime.toFixed(1)}s`,
      });

      return {
        success: true,
        book: translatedBook,
        translatedPages: book.totalPages || book.pageCount
      };

    } catch (error) {
      console.error("Python translation error:", error);

      // Fall back to chunk-based translation
      console.log("Falling back to chunk-based translation...");
      return this.translateBook(book, options, onProgress);
    }
  }
}

// Export singleton instance
export const translationService = new PDFTranslationService();

// Export types and functions for use in components
export type { TranslationOptions, TranslationProgress, TranslationResult };