import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageProps {
  content: string;
  className?: string;
  onNavigatePage?: (page: number, yPercent?: number) => void;
}

const MarkdownMessage: React.FC<MarkdownMessageProps> = ({
  content,
  className = '',
  onNavigatePage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Transform page references like [p. 242, 26] or [p. 242] into internal links
  const transformedContent = content
    // Remove generic Source tags
    .replace(/\[Source:[^\]]+\]/gi, '')
    // [p. 242, 26] -> markdown link with internal scheme
    .replace(/\[\s*p\.?\s*(\d+)\s*,\s*(\d+)\s*\]/gi, (_m, p, y) => `[[p. ${p}, ${y}]](page://${p}?y=${y})`)
    // [p. 242] -> markdown link
    .replace(/\[\s*p\.?\s*(\d+)\s*\]/gi, (_m, p) => `[[p. ${p}]](page://${p})`)
    // Remove page range references (optional)
    .replace(/\[\s*pp\.?\s*\d+\s*-\s*\d+\s*\]/gi, '')
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
          a: ({node, href, children, ...props}) => {
            const isPageLink = typeof href === 'string' && href.startsWith('page://');
            const getText = (nodes: any): string => {
              if (!nodes) return '';
              if (typeof nodes === 'string') return nodes;
              if (Array.isArray(nodes)) return nodes.map(getText).join('');
              if (typeof nodes === 'object' && nodes && 'props' in nodes && (nodes as any).props?.children) {
                return getText((nodes as any).props.children);
              }
              return '';
            };
            const label = getText(children).trim();

            const parseLabel = (s: string): { page: number; y?: number } | null => {
              const m = s.match(/^\[?\s*p\.?\s*(\d+)\s*(?:,\s*(\d+))?\s*\]?$/i);
              if (!m) return null;
              const page = Number(m[1]);
              const y = m[2] ? Number(m[2]) : undefined;
              if (!page || page < 1) return null;
              return { page, y };
            };

            if (isPageLink) {
              return (
                <a
                  href={href}
                  className="text-blue-600 hover:text-blue-800 underline"
                  onClick={(e) => {
                    e.preventDefault();
                    try {
                      if (!onNavigatePage) return;
                      const url = new URL(href!);
                      const page = Number(url.hostname || url.pathname.replace(/\//g, ''));
                      const yRaw = url.searchParams.get('y');
                      let yPercent: number | undefined = undefined;
                      if (yRaw !== null) {
                        const yNum = Number(yRaw);
                        if (!isNaN(yNum)) {
                          yPercent = yNum > 1 ? Math.max(0, Math.min(100, yNum)) : Math.max(0, Math.min(1, yNum));
                          // Normalize to 0..1
                          if (yPercent > 1) yPercent = yPercent / 100;
                        }
                      }
                      if (!isNaN(page) && page > 0) onNavigatePage(page, yPercent);
                    } catch {}
                  }}
                  {...props}
                >
                  {children}
                </a>
              );
            }
            // Handle cases like [p. 18]() or <a href="">p. 18</a>
            const parsed = parseLabel(label);
            if (parsed && onNavigatePage) {
              return (
                <a
                  href="#"
                  className="text-blue-600 hover:text-blue-800 underline"
                  onClick={(e) => {
                    e.preventDefault();
                    const yPercent = typeof parsed.y === 'number' ? (parsed.y > 1 ? parsed.y / 100 : parsed.y) : undefined;
                    onNavigatePage(parsed.page, yPercent);
                  }}
                  {...props}
                >
                  {children}
                </a>
              );
            }
            return <a className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer" href={href} {...props}>{children}</a>;
          },
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
        }}
        >
          {transformedContent}
        </ReactMarkdown>
      </div>
    </>
  );
};

export default MarkdownMessage;
