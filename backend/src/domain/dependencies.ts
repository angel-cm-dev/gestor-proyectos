import type { DependencyEdge, TaskStatus } from './types';

/**
 * Reglas de dependencias entre tareas ("A depende de B" = B debe terminar antes que A).
 *
 * Las dependencias forman un grafo dirigido. Si permitiéramos ciclos (A→B→A),
 * ninguna tarea del ciclo podría cerrarse jamás; por eso se rechazan al crearlas.
 */

/**
 * ¿Agregar la arista `taskId → dependsOnId` crearía un ciclo?
 * Hay ciclo si desde `dependsOnId` ya se llega a `taskId` siguiendo las
 * dependencias existentes (búsqueda en profundidad iterativa, O(V + E)).
 */
export function wouldCreateCycle(edges: DependencyEdge[], taskId: number, dependsOnId: number): boolean {
  if (taskId === dependsOnId) return true;

  const adjacency = new Map<number, number[]>();
  for (const e of edges) {
    const list = adjacency.get(e.taskId) ?? [];
    list.push(e.dependsOnId);
    adjacency.set(e.taskId, list);
  }

  const stack: number[] = [dependsOnId];
  const visited = new Set<number>();
  while (stack.length > 0) {
    const current = stack.pop() as number;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}

export interface DependencyInfo {
  id: number;
  title: string;
  status: TaskStatus;
}

/** Dependencias que impiden cerrar una tarea (las que aún no están "hecha"). */
export function blockingDependencies(deps: DependencyInfo[]): DependencyInfo[] {
  return deps.filter((d) => d.status !== 'hecha');
}
