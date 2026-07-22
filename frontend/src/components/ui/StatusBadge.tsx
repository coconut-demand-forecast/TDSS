import { type ReactNode } from 'react';

type Tone = 'success' | 'danger' | 'warning' | 'neutral' | 'info';

const TONE_STYLES: Record<Tone, { background: string; color: string }> = {
  success: { background: '#f0fdf4', color: '#166534' },
  danger: { background: '#fef2f2', color: '#991b1b' },
  warning: { background: '#fffbeb', color: '#92400e' },
  neutral: { background: '#f4f4f5', color: '#52525b' },
  info: { background: '#eff6ff', color: '#1e40af' },
};

const STATUS_TONE: Record<string, Tone> = {
  active: 'success',
  approved: 'success',
  completed: 'success',
  ready: 'info',
  recommended: 'info',
  planning: 'warning',
  draft: 'neutral',
  inactive: 'neutral',
  pending: 'warning',
  suspended: 'danger',
  disabled: 'danger',
  cancelled: 'danger',
  high: 'warning',
  urgent: 'danger',
  low: 'neutral',
  normal: 'info',
  medium: 'warning',
};

export default function StatusBadge({ tone, status, children }: { tone?: Tone; status?: string; children?: ReactNode }) {
  const resolvedTone = tone ?? (status ? STATUS_TONE[status] ?? 'neutral' : 'neutral');
  const s = TONE_STYLES[resolvedTone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 20,
        background: s.background,
        color: s.color,
        whiteSpace: 'nowrap',
      }}
    >
      {children ?? status}
    </span>
  );
}
