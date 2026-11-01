import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { cn } from '../lib/format';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  info: (message: string) => void;
  /** Muestra un error; si es ApiError usa el "detail" del Problem Details. */
  error: (error: unknown) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado';
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // Objeto estable: los componentes pueden usarlo en dependencias de efectos sin re-ejecutarlos.
  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      info: (m) => push('info', m),
      error: (e) => push('error', errorMessage(e)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto rounded-lg px-4 py-3 text-sm shadow-lg ring-1',
              t.kind === 'success' && 'bg-emerald-600 text-white ring-emerald-700',
              t.kind === 'error' && 'bg-rose-600 text-white ring-rose-700',
              t.kind === 'info' && 'bg-slate-800 text-white ring-slate-900',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
