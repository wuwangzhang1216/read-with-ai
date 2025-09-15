import React from 'react';
import { Book } from '../types';
import PdfJsViewer from './PdfJsViewer';

interface TranslatedPdfViewerProps {
  book: Book;
  title?: string;
  currentPage?: number | null;
  onPageChange?: (page: number) => void;
  initialScale?: number | 'auto' | 'page-fit' | 'page-width';
  targetPosition?: { page: number; yPercent?: number };
}

const TranslatedPdfViewer: React.FC<TranslatedPdfViewerProps> = ({
  book,
  title,
  currentPage,
  onPageChange,
  initialScale = 'page-fit',
  targetPosition
}) => {
  // Check if this is a translated book
  const isTranslated = !!(book.metadata?.translatedTo && book.metadata?.originalBookId);

  // Simply display the PDF using PdfJsViewer
  // The translated PDF already contains the translated content with proper formatting
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Show translation info if it's a translated book */}
      {isTranslated && (
        <div style={{
          padding: '8px 16px',
          backgroundColor: '#e8f5e9',
          borderBottom: '2px solid #4caf50',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{
            color: '#2e7d32',
            fontSize: '14px',
            fontWeight: 500
          }}>
            ✅ Translated: {book.metadata?.translatedFrom || 'Original'} → {book.metadata?.translatedTo || 'Unknown'}
          </span>
          {book.metadata?.translationMethod === 'python-pymupdf' && (
            <span style={{
              marginLeft: 'auto',
              fontSize: '12px',
              color: '#558b2f',
              backgroundColor: '#f1f8e9',
              padding: '2px 8px',
              borderRadius: '4px'
            }}>
              Layout Preserved
            </span>
          )}
        </div>
      )}

      {/* Display the PDF */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {book.fileBuffer ? (
          <PdfJsViewer
            key={book.id} // Force remount when book changes to avoid ArrayBuffer comparison
            fileBuffer={book.fileBuffer}
            title={title || book.title}
            currentPage={currentPage}
            onPageChange={onPageChange}
            initialScale={initialScale}
            targetPosition={targetPosition}
          />
        ) : (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: '#666'
          }}>
            <p>No PDF available for display</p>
            <p style={{ fontSize: '14px', marginTop: '8px', color: '#999' }}>
              The translated PDF may not have been generated properly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranslatedPdfViewer;