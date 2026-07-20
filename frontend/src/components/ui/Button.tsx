import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import Spinner from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANT_STYLE: Record<Variant, { background: string; color: string; border: string }> = {
  primary: { background: 'var(--c-accent)', color: '#fff', border: 'none' },
  secondary: { background: '#fff', color: 'var(--c-text)', border: '1px solid var(--c-border)' },
  ghost: { background: 'transparent', color: 'var(--c-text-muted)', border: 'none' },
  danger: { background: '#fff', color: 'var(--c-accent)', border: '1px solid var(--c-accent)' },
};
const SIZE_PADDING: Record<Size, string> = { sm: '7px 12px', md: '10px 18px' };
const SIZE_FONT: Record<Size, number> = { sm: 12.5, md: 13.5 };

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  style,
  disabled,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = VARIANT_STYLE[variant];
  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'inherit',
        fontWeight: 600,
        borderRadius: 9,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontSize: SIZE_FONT[size],
        padding: SIZE_PADDING[size],
        whiteSpace: 'nowrap',
        ...v,
        ...style,
      }}
      {...rest}
    >
      {loading && <Spinner size={size === 'sm' ? 12 : 13} color={variant === 'primary' ? '#fff' : 'var(--c-accent)'} />}
      {children}
    </button>
  );
}
