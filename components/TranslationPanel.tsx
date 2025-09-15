import React, { useState, useEffect } from 'react';
import { Book } from '../types';
import { translationService, TranslationProgress } from '../services/translationService';
import { getBooks } from '../services/dbService';

interface TranslationPanelProps {
  book: Book;
  isOpen: boolean;
  onClose: () => void;
  onTranslationComplete?: (translatedBook: Book) => void;
}

const TranslationPanel: React.FC<TranslationPanelProps> = ({
  book,
  isOpen,
  onClose,
  onTranslationComplete
}) => {
  const [targetLanguage, setTargetLanguage] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableLanguages] = useState(translationService.getAvailableLanguages());
  const [existingTranslations, setExistingTranslations] = useState<string[]>([]);
  const [detectedLanguage, setDetectedLanguage] = useState<string>('');
  const [useLayoutPreservation, setUseLayoutPreservation] = useState(true);

  useEffect(() => {
    if (isOpen && book) {
      // Load existing translations
      loadExistingTranslations();
      // Detect source language
      detectSourceLanguage();
    }
  }, [isOpen, book]);

  const loadExistingTranslations = async () => {
    try {
      const translations = await translationService.getBookTranslations(book.id);
      const langs = translations.map(t => t.metadata?.translatedTo).filter(Boolean);
      setExistingTranslations(langs);
    } catch (err) {
      console.error('Error loading translations:', err);
    }
  };

  const detectSourceLanguage = async () => {
    if (book.chunks.length > 0) {
      const sampleText = book.chunks[0].content.substring(0, 500);
      const detected = await translationService.detectLanguage(sampleText);
      setDetectedLanguage(detected);
    }
  };

  const handleTranslate = async () => {
    if (!targetLanguage || isTranslating) return;

    setIsTranslating(true);
    setError(null);
    setProgress({ current: 0, total: 100, status: 'Starting translation...' });

    try {
      // Always use Python translation for better layout preservation
      const result = await translationService.translateBookWithPython(
        book,
        { targetLanguage },
        (progress) => setProgress(progress)
      );

      if (result.success && result.book) {
        setProgress({
          current: 100,
          total: 100,
          status: '✅ Translation completed! Opening translated version...'
        });

        // Wait a moment to show success message
        setTimeout(() => {
          // Notify parent component
          if (onTranslationComplete) {
            onTranslationComplete(result.book);
          }

          // Reset state
          setTargetLanguage('');
          setProgress(null);
        }, 1500);

        // Refresh existing translations
        await loadExistingTranslations();
      } else {
        setError(result.error || 'Translation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  };

  const estimatedTime = () => {
    const estimate = translationService.estimateTranslationTime(book);
    if (estimate.minutes > 0) {
      return `~${estimate.minutes}m ${estimate.seconds}s`;
    }
    return `~${estimate.seconds}s`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Translate Book
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            disabled={isTranslating}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Book Info */}
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Book:</p>
            <p className="text-gray-900 dark:text-white">{book.title}</p>
            {detectedLanguage && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Detected language: {detectedLanguage}
              </p>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Pages: {book.totalPages || book.chunks.length}
            </p>
          </div>

          {/* Existing Translations */}
          {existingTranslations.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                Available translations:
              </p>
              <div className="flex flex-wrap gap-2">
                {existingTranslations.map(lang => (
                  <span
                    key={lang}
                    className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded text-sm"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Language Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Translate to:
            </label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              disabled={isTranslating}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a language</option>
              {availableLanguages.map(lang => (
                <option
                  key={lang}
                  value={lang}
                  disabled={existingTranslations.includes(lang) || lang === detectedLanguage}
                >
                  {lang}
                  {existingTranslations.includes(lang) && ' (Already translated)'}
                  {lang === detectedLanguage && ' (Source language)'}
                </option>
              ))}
            </select>
          </div>


          {/* Estimated Time */}
          {targetLanguage && !isTranslating && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Estimated time: ~30-60 seconds per page (with layout preservation)
            </div>
          )}

          {/* Progress */}
          {isTranslating && progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{progress.status}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 relative overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`
                  }}
                >
                  {/* Animated shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
                {progress.currentPage && (
                  <span className="text-gray-500 dark:text-gray-400">
                    Page {progress.currentPage} of {book.totalPages || book.pageCount}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleTranslate}
              disabled={!targetLanguage || isTranslating}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-500 transition-colors"
            >
              {isTranslating ? 'Translating...' : 'Start Translation'}
            </button>
            <button
              onClick={onClose}
              disabled={isTranslating}
              className="px-4 py-2 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Info Note */}
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-4">
            <p>• Translation will create a new version of the book</p>
            <p>• The translated book will be saved in your library</p>
            <p>• You can switch between versions anytime</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranslationPanel;