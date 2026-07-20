import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const COLORS: Record<ToastType, { bg: string; fg: string; icon: string }> = {
  success: { bg: '#f0fdf4', fg: '#166534', icon: '#16a34a' },
  error: { bg: '#fef2f2', fg: '#991b1b', icon: '#d71920' },
  info: { bg: '#eff6ff', fg: '#1e40af', icon: '#3b82c4' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const showSuccess = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const showError = useCallback((message: string) => showToast(message, 'error'), [showToast]);
  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError }}>
      {children}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 3000, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 }}>
        {toasts.map((t) => {
          const c = COLORS[t.type];
          return (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              style={{
                background: '#fff',
                borderLeft: `4px solid ${c.icon}`,
                borderRadius: 10,
                padding: '12px 14px',
                boxShadow: '0 8px 24px rgba(0,0,0,.14)',
                cursor: 'pointer',
                fontSize: 13,
                color: c.fg,
                whiteSpace: 'pre-line',
              }}
            >
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
