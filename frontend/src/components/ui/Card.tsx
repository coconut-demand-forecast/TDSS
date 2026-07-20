import { type CSSProperties, type ReactNode } from 'react';

export default function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--c-border)',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,.05)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
