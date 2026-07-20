import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid var(--c-border)',
  fontFamily: 'inherit',
  fontSize: 13.5,
  color: 'var(--c-text)',
  background: '#fff',
};

export function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 6 }}>
        {label} {required && <span style={{ color: 'var(--c-accent)' }}>*</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: 11.5, color: 'var(--c-accent)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...inputStyle, resize: 'vertical', minHeight: 70, ...props.style }} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{ ...inputStyle, cursor: 'pointer', ...props.style }}>
      {props.children}
    </select>
  );
}
