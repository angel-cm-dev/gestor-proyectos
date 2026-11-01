import type { GlobalRole, Priority, ProjectRole, ProjectStatus, TaskStatus } from '../api/types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  en_revision: 'En revisión',
  hecha: 'Hecha',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planificado: 'Planificado',
  activo: 'Activo',
  pausado: 'Pausado',
  cerrado: 'Cerrado',
};

export const ROLE_LABEL: Record<GlobalRole | ProjectRole, string> = {
  admin: 'Administrador',
  lider: 'Líder',
  miembro: 'Miembro',
  gestor: 'Gestor',
  colaborador: 'Colaborador',
  observador: 'Observador',
};

/** 150 → "2 h 30 min"; 60 → "1 h"; 45 → "45 min". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Minutos → horas decimales con 2 decimales como máximo (150 → 2.5). */
export function toHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** '2026-03-18' → '18 mar 2026' sin desfases de zona horaria. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Fecha local de hoy en formato YYYY-MM-DD (para inputs type="date"). */
export function todayISO(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** ¿La fecha límite ya pasó y la tarea sigue abierta? */
export function isOverdue(dueDate: string | null, status: TaskStatus, today: string = todayISO()): boolean {
  return Boolean(dueDate) && status !== 'hecha' && (dueDate as string) < today;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
