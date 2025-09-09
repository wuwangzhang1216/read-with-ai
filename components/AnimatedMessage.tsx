import React, { useEffect, useState } from 'react';

interface AnimatedMessageProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

const AnimatedMessage: React.FC<AnimatedMessageProps> = ({
  children,
  delay = 0,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`animated-message ${isVisible ? 'animate-in' : 'animate-out'} ${className}`}
      style={{
        animation: isVisible
          ? `slideInFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both`
          : 'none'
      }}
    >
      {children}
      <style jsx>{`
        @keyframes slideInFade {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .animated-message {
          will-change: opacity, transform;
        }

        .animate-out {
          opacity: 0;
          transform: translateY(12px) scale(0.98);
        }
      `}</style>
    </div>
  );
};

export default AnimatedMessage;
