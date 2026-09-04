import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface ToastItem { id: string; kind: ToastKind; title: string; description?: string }

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const styles: Record<ToastKind, { cls: string; Icon: typeof Info }> = {
  success: { cls: 'border-ok/30 bg-ok/10 text-ok', Icon: CheckCircle2 },
  error: { cls: 'border-danger/30 bg-danger/10 text-danger', Icon: XCircle },
  warning: { cls: 'border-warn/30 bg-warn/10 text-warn', Icon: AlertTriangle },
  info: { cls: 'border-info/30 bg-info/10 text-info', Icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const push = useCallback((kind: ToastKind, title: string, description?: string) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, kind, title, description }]);
    window.setTimeout(() => remove(id), kind === 'error' ? 8000 : 4500);
  }, [remove]);

  const api = useMemo<ToastApi>(() => ({
    success: (t, d) => push('success', t, d),
    error: (t, d) => push('error', t, d),
    warning: (t, d) => push('warning', t, d),
    info: (t, d) => push('info', t, d),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
          {items.map(({ id, kind, title, description }) => {
            const { cls, Icon } = styles[kind];
            return (
              <div
                key={id}
                role="status"
                className={cn(
                  'pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-pop backdrop-blur',
                  'bg-surface animate-slide-up', cls,
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{title}</p>
                  {description && <p className="mt-0.5 text-xs text-muted break-words">{description}</p>}
                </div>
                <button onClick={() => remove(id)} className="text-muted hover:text-fg focus-ring rounded" aria-label="Fechar">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return ctx;
}
