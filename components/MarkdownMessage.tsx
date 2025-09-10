import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

const MarkdownMessage: React.FC<MarkdownMessageProps> = ({
  content,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const cleanContent = content
    .replace(/\[Source:[^\]]+\]/gi, '')
    .replace(/\[p\.\s*\d+\]/gi, '')
    .replace(/\[pp\.\s*\d+-\d+\]/gi, '')
    .trim();

  useEffect(() => {
    // Force enable text selection after component mounts
    const container = containerRef.current;
    if (container) {
      // Remove any conflicting styles
      container.style.userSelect = 'text';
      container.style.webkitUserSelect = 'text';
      
      // Apply to all children
      const allElements = container.querySelectorAll('*');
      allElements.forEach((el: Element) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.userSelect = 'text';
        htmlEl.style.webkitUserSelect = 'text';
      });
    }

    // Debug selection changes specifically for this component
    let lastSelectionText = '';
    const debugSelectionChange = () => {
      const sel = window.getSelection();
      if (sel && container && container.contains(sel.anchorNode)) {
        const currentText = sel.toString();
        if (currentText !== lastSelectionText) {
          lastSelectionText = currentText;
        }
      }
    };

    document.addEventListener('selectionchange', debugSelectionChange);
    
    return () => {
      document.removeEventListener('selectionchange', debugSelectionChange);
    };
  }, [content]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't prevent default behavior for text selection
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Check selection after mouse up
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        // Selection exists, handle as needed
      }
    }, 50);
  };

  return (
    <>
      <style>{`
        .markdown-message.max-w-none,
        .markdown-message.max-w-none *,
        .markdown-message.max-w-none *::before,
        .markdown-message.max-w-none *::after {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
          pointer-events: auto !important;
          /* Disable any animations or transitions that might interfere */
          animation: none !important;
          transition: none !important;
          transform: none !important;
        }
        .markdown-message.max-w-none * {
          -webkit-touch-callout: default !important;
          /* Ensure no CSS can interfere with selection */
          will-change: auto !important;
        }
        /* Prevent any global selection modifications */
        .markdown-message.max-w-none::selection,
        .markdown-message.max-w-none *::selection {
          background: #3390ff !important;
          color: white !important;
        }
      `}</style>
      <div
        ref={containerRef}
        className={`markdown-message max-w-none ${className}`}
        role="article"
        aria-label="AI response message"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={{
          userSelect: 'text' as const,
          WebkitUserSelect: 'text' as const,
          MozUserSelect: 'text' as const,
          msUserSelect: 'text' as const
        }}
      >
        <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { node, className, children, ref, ...restProps } = props;
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : 'text';
            const codeContent = String(children).replace(/\n$/, '');

            // Heuristic to fix parser incorrectly identifying inline code as a block,
            // which often happens with indented code in list items.
            const isLikelyInline = (props as any).inline || !codeContent.includes('\n');

            if (isLikelyInline) {
              return (
                <code
                  className="bg-[rgba(248,250,252,0.95)] px-1.5 py-1 rounded-md text-sm font-mono text-[#1e293b] border border-[rgba(44,62,80,0.2)] mx-0.5 shadow-sm"
                  {...restProps}
                >
                  {codeContent}
                </code>
              );
            }

            return (
              <div className="my-4 rounded-lg overflow-hidden border border-[var(--border-color)]" role="region" aria-label={`Code block in ${language}`}>
                <div className="flex justify-between items-center px-4 py-1.5 bg-[var(--bg-secondary)]">
                  <span className="text-xs font-sans text-[var(--text-secondary)] font-medium">{language}</span>
                </div>
                <SyntaxHighlighter
                  language={language}
                  style={oneDark as any}
                  showLineNumbers={codeContent.split('\n').length > 5}
                  wrapLines={true}
                  {...restProps}
                >
                  {codeContent}
                </SyntaxHighlighter>
              </div>
            );
          },
          h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-3 mt-5 first:mt-0" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0" {...props} />,
          p: ({node, ...props}) => <p className="mb-4 last:mb-0 leading-relaxed" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc list-outside my-4 space-y-2 pl-6" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal list-outside my-4 space-y-2 pl-6" {...props} />,
          li: ({node, ...props}) => <li className="mb-1 pl-2" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-4 py-2 my-4 italic bg-gray-50 rounded-r-lg" {...props} />,
          hr: ({node, ...props}) => <hr className="my-6 border-gray-200" {...props} />,
          a: ({node, ...props}) => <a className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer" {...props} />,
        }}
        >
          {cleanContent}
        </ReactMarkdown>
      </div>
    </>
  );
};

export default MarkdownMessage;
