import { type ReactNode } from 'react';
import Card from './Card';

export default function EmptyState({ message, action }: { message: ReactNode; action?: ReactNode }) {
  return (
    <Card style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: 'var(--c-text-muted)', marginBottom: action ? 16 : 0, fontSize: 13.5 }}>{message}</p>
      {action}
    </Card>
  );
}
