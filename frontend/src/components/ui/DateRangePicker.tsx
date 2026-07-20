import { useState } from 'react';
import Button from './Button';

export interface DateRange {
  label: string;
  date_from?: string;
  date_to?: string;
}

const PRESETS: { key: string; label: string; days: number | null }[] = [
  { key: '7d', label: '7 วัน', days: 7 },
  { key: '30d', label: '30 วัน', days: 30 },
  { key: '90d', label: '90 วัน', days: 90 },
  { key: 'all', label: 'ทั้งหมด', days: null },
];

function presetToRange(days: number | null): DateRange {
  if (days === null) return { label: 'ทั้งหมด' };
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { label: `${days} วัน`, date_from: from.toISOString(), date_to: to.toISOString() };
}

export default function DateRangePicker({ onChange }: { onChange: (range: DateRange) => void }) {
  const [activePreset, setActivePreset] = useState('30d');

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {PRESETS.map((p) => (
        <Button
          key={p.key}
          size="sm"
          variant={activePreset === p.key ? 'primary' : 'secondary'}
          onClick={() => {
            setActivePreset(p.key);
            onChange(presetToRange(p.days));
          }}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}

export { presetToRange };
