import type { TaskStatus } from './types';

/**
 * Avance (%) de tareas y proyectos.
 *
 * Fórmula (documentada también en docs/arquitectura.md):
 * 1. Tarea hoja (sin subtareas): su avance depende del estado
 *    pendiente = 0, en_progreso = 0.5, en_revision = 0.8, hecha = 1.
 *    Un estado intermedio vale "algo" porque ya hubo esfuerzo, pero nunca llega
 *    a 1 hasta que la tarea se cierra.
 * 2. Tarea con subtareas: promedio ponderado del avance de sus subtareas.
 *    Si la tarea padre está "hecha" vale 1 (la regla de negocio impide cerrarla
 *    con subtareas abiertas, así que ambos criterios coinciden).
 * 3. Proyecto: promedio ponderado del avance de sus tareas de primer nivel.
 *
 * Peso = horas estimadas (si son > 0) o 1. Así una tarea de 40 h pesa más que
 * una de 2 h, y las tareas sin estimar siguen contando como una unidad mínima.
 */
export const STATUS_PROGRESS: Record<TaskStatus, number> = {
  pendiente: 0,
  en_progreso: 0.5,
  en_revision: 0.8,
  hecha: 1,
};

export interface ProgressNode {
  id: number;
  parentId: number | null;
  status: TaskStatus;
  estimatedHours: number;
}

export function weightOf(task: Pick<ProgressNode, 'estimatedHours'>): number {
  return task.estimatedHours > 0 ? task.estimatedHours : 1;
}

function weightedAverage(items: Array<{ value: number; weight: number }>): number {
  const totalWeight = items.reduce((acc, i) => acc + i.weight, 0);
  if (totalWeight === 0) return 0;
  return items.reduce((acc, i) => acc + i.value * i.weight, 0) / totalWeight;
}

/** Avance de una tarea (0..1) dados sus hijos directos. */
export function taskProgress(task: ProgressNode, children: ProgressNode[]): number {
  if (task.status === 'hecha') return 1;
  if (children.length === 0) return STATUS_PROGRESS[task.status];
  return weightedAverage(children.map((c) => ({ value: STATUS_PROGRESS[c.status], weight: weightOf(c) })));
}

/** Convierte una razón 0..1 a porcentaje con un decimal (0..100). */
export function toPercent(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}

export interface ProgressResult {
  /** Avance del proyecto en % (0..100). */
  project: number;
  /** Avance de cada tarea en % (0..100). */
  byTask: Map<number, number>;
}

export function computeProgress(tasks: ProgressNode[]): ProgressResult {
  const childrenOf = new Map<number, ProgressNode[]>();
  for (const t of tasks) {
    if (t.parentId !== null) {
      const list = childrenOf.get(t.parentId) ?? [];
      list.push(t);
      childrenOf.set(t.parentId, list);
    }
  }

  const byTask = new Map<number, number>();
  for (const t of tasks) {
    byTask.set(t.id, toPercent(taskProgress(t, childrenOf.get(t.id) ?? [])));
  }

  const topLevel = tasks.filter((t) => t.parentId === null);
  const project = weightedAverage(
    topLevel.map((t) => ({ value: taskProgress(t, childrenOf.get(t.id) ?? []), weight: weightOf(t) })),
  );
  return { project: toPercent(project), byTask };
}
