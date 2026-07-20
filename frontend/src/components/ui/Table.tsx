import { type ReactNode } from 'react';

export function Table({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth }}>{children}</table>
    </div>
  );
}

export function Th({ children, align = 'left' }: { children?: ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: 11.5, color: 'var(--c-text-muted)', textAlign: align, borderBottom: '1px solid var(--c-border)' }}>
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', colSpan }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ padding: '11px 14px', textAlign: align, borderBottom: '1px solid #f3f4f6' }}>
      {children}
    </td>
  );
}
