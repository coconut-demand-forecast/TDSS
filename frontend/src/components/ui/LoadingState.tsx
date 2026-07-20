import { type ReactNode } from 'react';
import Spinner from './Spinner';
import Card from './Card';

export default function LoadingState({ label = 'กำลังโหลด...', card = false }: { label?: ReactNode; card?: boolean }) {
  const inner = (
    <div style={{ padding: 40, color: 'var(--c-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <Spinner size={16} color="var(--c-accent)" />
      {label}
    </div>
  );
  return card ? <Card>{inner}</Card> : inner;
}
