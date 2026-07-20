import { type ReactNode } from 'react';

export default function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{actions}</div>}
    </div>
  );
}
