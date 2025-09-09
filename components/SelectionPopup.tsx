import React from 'react';
import { ChatIcon, ExplainIcon, SummarizeIcon } from './icons/Icons';

type SelectionAction = 'ask' | 'summarize' | 'explain';

interface SelectionPopupProps {
  x: number;
  y: number;
  onAction: (action: SelectionAction) => void;
}

const ActionButton: React.FC<{
    onClick: () => void;
    children: React.ReactNode;
    ariaLabel: string;
}> = ({ onClick, children, ariaLabel }) => (
    <button
        onClick={onClick}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors duration-200 hover:bg-[var(--sidebar-bg-lighter)] focus:outline-none focus:bg-[var(--sidebar-bg-lighter)]"
        style={{ color: 'var(--text-light)' }}
        aria-label={ariaLabel}
    >
        {children}
    </button>
);


const SelectionPopup: React.FC<SelectionPopupProps> = ({ x, y, onAction }) => {
  return (
    <div
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -120%)',
        zIndex: 80,
        willChange: 'transform, opacity',
        backgroundColor: 'var(--sidebar-bg)',
      }}
      className="flex items-center rounded-full shadow-lg transition-all duration-150 ease-out overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()} // Prevent closing popup when clicking it
    >
        <ActionButton onClick={() => onAction('ask')} ariaLabel="Add selected text as reference in chat">
            <ChatIcon className="w-5 h-5" />
            <span>Add Reference</span>
        </ActionButton>
        <div className="w-px h-5 self-center" style={{backgroundColor: 'rgba(250, 248, 243, 0.2)'}}></div>
        <ActionButton onClick={() => onAction('summarize')} ariaLabel="Summarize selected text">
            <SummarizeIcon className="w-5 h-5" />
            <span>Summarize</span>
        </ActionButton>
        <div className="w-px h-5 self-center" style={{backgroundColor: 'rgba(250, 248, 243, 0.2)'}}></div>
        <ActionButton onClick={() => onAction('explain')} ariaLabel="Explain selected text">
            <ExplainIcon className="w-5 h-5" />
            <span>Explain</span>
        </ActionButton>
    </div>
  );
};

export default SelectionPopup;
