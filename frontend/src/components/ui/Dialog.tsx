import { type ReactNode } from 'react';

export default function Dialog({ title, onClose, children, width = 520 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: width, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.25)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--c-border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--c-text-muted)', lineHeight: 1 }}>
            ×
          </button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}
