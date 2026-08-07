import type { ReactNode } from 'react';

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`rounded-lg border border-border bg-surface p-5 shadow-token-1 ${className}`}>
      {children}
    </div>
  );
}
