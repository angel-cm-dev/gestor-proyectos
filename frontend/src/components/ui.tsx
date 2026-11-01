import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import type { Priority, ProjectStatus, TaskStatus } from '../api/types';
import { cn, initials, PRIORITY_LABEL, PROJECT_STATUS_LABEL, STATUS_LABEL } from '../lib/format';
import { errorMessage } from '../context/ToastContext';

// ---------- Botones y campos ----------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500',
  secondary:
    'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
};

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-900',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

const fieldClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700';

export function Field({ label, error, htmlFor, children, hint }: { label: string; error?: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} aria-invalid={invalid || undefined} className={cn(fieldClass, invalid && 'ring-rose-500', className)} />;
}

export function Select({ className, invalid, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select {...props} aria-invalid={invalid || undefined} className={cn(fieldClass, 'pr-8', invalid && 'ring-rose-500', className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(fieldClass, className)} />;
}

// ---------- Contenedores ----------
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800', className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('w-full rounded-xl bg-white shadow-xl dark:bg-slate-900', wide ? 'max-w-4xl' : 'max-w-lg')}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------- Estados de carga / vacío / error ----------
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin text-current', className ?? 'h-6 w-6')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Loading({ label = 'Cargando...' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-12 text-slate-500">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 px-6 py-12 text-center dark:border-slate-800">
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl bg-rose-50 p-6 text-center text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900">
      <p className="font-medium">No se pudo cargar la información</p>
      <p className="mt-1 text-sm">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

// ---------- Datos ----------
export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-2 pt-4 text-sm">
      <span className="text-slate-500">
        {total} resultado{total === 1 ? '' : 's'} · página {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Siguiente
        </Button>
      </div>
    </nav>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
    </div>
  );
}

const STATUS_STYLE: Record<TaskStatus, string> = {
  pendiente: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  en_progreso: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  en_revision: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  hecha: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
};
const PRIORITY_STYLE: Record<Priority, string> = {
  baja: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  media: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  alta: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  critica: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
};
const PROJECT_STYLE: Record<ProjectStatus, string> = {
  planificado: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  activo: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  pausado: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  cerrado: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', className)}>{children}</span>;
}
export const StatusBadge = ({ status }: { status: TaskStatus }) => <Badge className={STATUS_STYLE[status]}>{STATUS_LABEL[status]}</Badge>;
export const PriorityBadge = ({ priority }: { priority: Priority }) => <Badge className={PRIORITY_STYLE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => (
  <Badge className={PROJECT_STYLE[status]}>{PROJECT_STATUS_LABEL[status]}</Badge>
);

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200',
        size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs',
      )}
    >
      {initials(name)}
    </span>
  );
}

export function KpiCard({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: string; tone?: 'default' | 'warn' | 'good' }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-2 text-3xl font-semibold tabular-nums',
          tone === 'warn' && 'text-rose-600 dark:text-rose-400',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto sm:mx-0">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cn('whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', className)}>
    {children}
  </th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cn('whitespace-nowrap px-3 py-2.5', className)}>{children}</td>
);
