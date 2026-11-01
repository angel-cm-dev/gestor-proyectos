import { describe, expect, it } from 'vitest';
import type { BoardTask, TaskStatus } from '../api/types';
import { moveCard, type Columns } from './board';
import { formatMinutes, isOverdue, toHours, todayISO } from './format';
import { currentMentionQuery, splitMentions } from './mentions';
import { validateLogin, validateProject, validateTask, validateTimeEntry, validateUser } from './validation';
import { addDays, weekDays, weekStart } from './week';

const card = (id: number, status: TaskStatus): BoardTask =>
  ({ id, status, position: 0, title: `T${id}`, labels: [], dependsOn: [], progress: 0, blocked: false }) as unknown as BoardTask;

const cols = (): Columns => ({
  pendiente: [card(1, 'pendiente'), card(2, 'pendiente'), card(3, 'pendiente')],
  en_progreso: [card(4, 'en_progreso')],
  en_revision: [],
  hecha: [],
});

describe('moveCard (kanban optimista)', () => {
  it('reordena dentro de la misma columna', () => {
    const next = moveCard(cols(), 1, 'pendiente', 2);
    expect(next.pendiente.map((t) => t.id)).toEqual([2, 3, 1]);
    expect(next.pendiente.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it('mueve a otra columna, actualiza estado y renumera ambas', () => {
    const next = moveCard(cols(), 2, 'en_progreso', 0);
    expect(next.pendiente.map((t) => t.id)).toEqual([1, 3]);
    expect(next.en_progreso.map((t) => [t.id, t.status, t.position])).toEqual([
      [2, 'en_progreso', 0],
      [4, 'en_progreso', 1],
    ]);
  });

  it('acota el índice y no muta el estado original', () => {
    const original = cols();
    const next = moveCard(original, 1, 'hecha', 99);
    expect(next.hecha.map((t) => t.id)).toEqual([1]);
    expect(original.pendiente).toHaveLength(3);
  });

  it('ignora tarjetas inexistentes', () => {
    const original = cols();
    expect(moveCard(original, 999, 'hecha', 0)).toBe(original);
  });
});

describe('formato', () => {
  it('formatea minutos de forma legible', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(150)).toBe('2 h 30 min');
    expect(toHours(150)).toBe(2.5);
  });

  it('detecta tareas vencidas solo si siguen abiertas', () => {
    expect(isOverdue('2026-03-01', 'pendiente', '2026-03-18')).toBe(true);
    expect(isOverdue('2026-03-01', 'hecha', '2026-03-18')).toBe(false);
    expect(isOverdue(null, 'pendiente', '2026-03-18')).toBe(false);
    expect(isOverdue('2026-03-18', 'pendiente', '2026-03-18')).toBe(false);
  });

  it('todayISO devuelve la fecha local', () => {
    expect(todayISO(new Date(2026, 2, 18, 23, 30))).toBe('2026-03-18');
  });
});

describe('menciones', () => {
  it('separa texto y menciones, ignorando correos', () => {
    expect(splitMentions('Hola @carla, escribe a ops@demo.pe')).toEqual([
      { type: 'text', value: 'Hola ' },
      { type: 'mention', value: 'carla' },
      { type: 'text', value: ', escribe a ops@demo.pe' },
    ]);
  });

  it('detecta la mención en curso para autocompletar', () => {
    expect(currentMentionQuery('revisa esto @ma')).toBe('ma');
    expect(currentMentionQuery('@')).toBe('');
    expect(currentMentionQuery('correo a@b')).toBeNull();
  });
});

describe('validación de formularios', () => {
  it('login', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({ email: 'Ingresa tu correo', password: 'Ingresa tu contraseña' });
    expect(validateLogin({ email: 'x@demo.pe', password: 'a' })).toEqual({});
  });

  it('proyecto con fechas invertidas', () => {
    const e = validateProject({ name: 'Ok', description: '', status: 'activo', startDate: '2026-05-01', endDate: '2026-04-01' });
    expect(e.name).toBeDefined();
    expect(e.endDate).toBeDefined();
  });

  it('tarea con horas inválidas', () => {
    const e = validateTask({ title: 'Tarea', description: '', status: 'pendiente', priority: 'media', assigneeId: '', estimatedHours: '-1', startDate: '', dueDate: '', labelIds: [] });
    expect(e).toEqual({ estimatedHours: 'Entre 0 y 9999 horas' });
  });

  it('registro de horas a futuro o fuera de rango', () => {
    expect(validateTimeEntry({ workDate: '2026-03-19', hours: '1' }, '2026-03-18').workDate).toBeDefined();
    expect(validateTimeEntry({ workDate: '2026-03-18', hours: '25' }, '2026-03-18').hours).toBeDefined();
    expect(validateTimeEntry({ workDate: '2026-03-18', hours: '1.5' }, '2026-03-18')).toEqual({});
  });

  it('usuario con contraseña débil', () => {
    const e = validateUser({ name: 'Rosa', email: 'rosa@demo.pe', username: 'Rosa!', password: 'abc', role: 'miembro' });
    expect(Object.keys(e).sort()).toEqual(['password', 'username']);
  });
});

describe('semana', () => {
  it('calcula lunes y días de la semana', () => {
    expect(weekStart('2026-03-22')).toBe('2026-03-16');
    expect(addDays('2026-03-16', 6)).toBe('2026-03-22');
    expect(weekDays('2026-03-16')[0]).toEqual({ date: '2026-03-16', label: 'Lun 16' });
  });
});
