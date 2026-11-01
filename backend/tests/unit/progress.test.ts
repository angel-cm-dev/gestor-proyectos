import { describe, expect, it } from 'vitest';
import { computeProgress, taskProgress, toPercent, weightOf, type ProgressNode } from '../../src/domain/progress';

const node = (id: number, status: ProgressNode['status'], estimatedHours = 0, parentId: number | null = null): ProgressNode => ({
  id,
  status,
  estimatedHours,
  parentId,
});

describe('avance (%)', () => {
  it('una tarea hoja vale según su estado', () => {
    expect(taskProgress(node(1, 'pendiente'), [])).toBe(0);
    expect(taskProgress(node(1, 'en_progreso'), [])).toBe(0.5);
    expect(taskProgress(node(1, 'en_revision'), [])).toBe(0.8);
    expect(taskProgress(node(1, 'hecha'), [])).toBe(1);
  });

  it('las tareas sin estimar pesan 1', () => {
    expect(weightOf({ estimatedHours: 0 })).toBe(1);
    expect(weightOf({ estimatedHours: 12 })).toBe(12);
  });

  it('una tarea con subtareas promedia el avance de sus subtareas ponderado por horas', () => {
    const parent = node(1, 'en_progreso', 10);
    const children = [node(2, 'hecha', 3, 1), node(3, 'pendiente', 1, 1)];
    // (1*3 + 0*1) / 4 = 0.75
    expect(taskProgress(parent, children)).toBe(0.75);
  });

  it('una tarea padre "hecha" vale 100 % aunque sus hijos no estén cargados', () => {
    expect(taskProgress(node(1, 'hecha'), [node(2, 'pendiente', 1, 1)])).toBe(1);
  });

  it('el proyecto pondera sus tareas de primer nivel por horas estimadas', () => {
    const tasks = [node(1, 'hecha', 30), node(2, 'pendiente', 10)];
    expect(computeProgress(tasks).project).toBe(75);
  });

  it('combina subtareas y tareas simples', () => {
    const tasks = [
      node(1, 'en_progreso', 8), // con subtareas → (1*2 + 0.5*2)/4 = 0.75
      node(2, 'hecha', 2, 1),
      node(3, 'en_progreso', 2, 1),
      node(4, 'en_revision', 0), // hoja sin estimar → 0.8, peso 1
    ];
    const result = computeProgress(tasks);
    expect(result.byTask.get(1)).toBe(75);
    expect(result.byTask.get(3)).toBe(50);
    // (0.75*8 + 0.8*1) / 9 = 0.7556 → 75.6 %
    expect(result.project).toBe(75.6);
  });

  it('un proyecto sin tareas tiene 0 %', () => {
    expect(computeProgress([]).project).toBe(0);
  });

  it('toPercent redondea a un decimal', () => {
    expect(toPercent(1 / 3)).toBe(33.3);
  });
});
