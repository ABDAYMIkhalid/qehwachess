import { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`bg-surface-900 border border-surface-700/60 rounded-2xl ${hover ? 'transition-all duration-300 hover:border-brand-500/40 hover:shadow-xl hover:shadow-brand-500/5 hover:-translate-y-1' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
