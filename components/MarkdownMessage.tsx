import React from 'react';
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
  const cleanContent = content
    .replace(/\[Source:[^\]]+\]/gi, '')
    .replace(/\[p\.\s*\d+\]/gi, '')
    .replace(/\[pp\.\s*\d+-\d+\]/gi, '')
    .trim();

  return (
    <div className={`markdown-message max-w-none ${className}`} role="article" aria-label="AI response message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : 'text';
            const codeContent = String(children).replace(/\n$/, '');
            
            // Heuristic to fix parser incorrectly identifying inline code as a block,
            // which often happens with indented code in list items.
            const isLikelyInline = inline || !codeContent.includes('\n');

            if (isLikelyInline) {
              return (
                <code 
                  className="bg-[rgba(44,62,80,0.08)] px-1.5 py-1 rounded-md text-sm font-mono text-[var(--text-primary)] border border-transparent mx-0.5" 
                  {...props}
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
                  style={oneDark}
                  customStyle={{
                    margin: 0,
                    fontSize: '13px',
                    lineHeight: '1.5',
                    padding: '1em',
                    backgroundColor: '#2d2d2d'
                  }}
                  showLineNumbers={codeContent.split('\n').length > 5}
                  wrapLines={true}
                  {...props}
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
  );
};

export default MarkdownMessage;
