import type { BoardTask, TaskStatus } from '../api/types';

export type Columns = Record<TaskStatus, BoardTask[]>;

/** Encuentra en qué columna está una tarjeta. */
export function findColumn(columns: Columns, taskId: number): TaskStatus | null {
  for (const status of Object.keys(columns) as TaskStatus[]) {
    if (columns[status].some((t) => t.id === taskId)) return status;
  }
  return null;
}

/**
 * Mueve una tarjeta a `toStatus` en la posición `toIndex` (función pura).
 * Se usa para la actualización OPTIMISTA del kanban: la UI responde al instante
 * y, si el backend rechaza el movimiento (p. ej. dependencias pendientes), se
 * restaura el estado anterior.
 */
export function moveCard(columns: Columns, taskId: number, toStatus: TaskStatus, toIndex: number): Columns {
  const from = findColumn(columns, taskId);
  if (!from) return columns;
  const card = columns[from].find((t) => t.id === taskId) as BoardTask;

  const next: Columns = { ...columns, [from]: columns[from].filter((t) => t.id !== taskId) };
  const target = [...next[toStatus]];
  const index = Math.max(0, Math.min(toIndex, target.length));
  target.splice(index, 0, { ...card, status: toStatus });
  next[toStatus] = target.map((t, i) => ({ ...t, position: i }));
  if (from !== toStatus) next[from] = next[from].map((t, i) => ({ ...t, position: i }));
  return next;
}
