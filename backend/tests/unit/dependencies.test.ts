import { describe, expect, it } from 'vitest';
import { blockingDependencies, wouldCreateCycle } from '../../src/domain/dependencies';

describe('dependencias y ciclos', () => {
  // 1 depende de 2, 2 depende de 3
  const edges = [
    { taskId: 1, dependsOnId: 2 },
    { taskId: 2, dependsOnId: 3 },
  ];

  it('una tarea no puede depender de sí misma', () => {
    expect(wouldCreateCycle([], 5, 5)).toBe(true);
  });

  it('detecta un ciclo directo (A→B y B→A)', () => {
    expect(wouldCreateCycle([{ taskId: 1, dependsOnId: 2 }], 2, 1)).toBe(true);
  });

  it('detecta un ciclo transitivo (3→1 cuando 1→2→3)', () => {
    expect(wouldCreateCycle(edges, 3, 1)).toBe(true);
  });

  it('permite dependencias que no cierran un ciclo', () => {
    expect(wouldCreateCycle(edges, 1, 3)).toBe(false);
    expect(wouldCreateCycle(edges, 4, 1)).toBe(false);
  });

  it('maneja grafos con diamantes sin falsos positivos', () => {
    const diamond = [
      { taskId: 1, dependsOnId: 2 },
      { taskId: 1, dependsOnId: 3 },
      { taskId: 2, dependsOnId: 4 },
      { taskId: 3, dependsOnId: 4 },
    ];
    expect(wouldCreateCycle(diamond, 5, 1)).toBe(false);
    expect(wouldCreateCycle(diamond, 4, 1)).toBe(true);
  });

  it('las dependencias no terminadas bloquean el cierre', () => {
    const deps = [
      { id: 1, title: 'A', status: 'hecha' as const },
      { id: 2, title: 'B', status: 'en_revision' as const },
    ];
    expect(blockingDependencies(deps)).toEqual([{ id: 2, title: 'B', status: 'en_revision' }]);
    expect(blockingDependencies([deps[0]])).toEqual([]);
  });
});
