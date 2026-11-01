import { describe, expect, it } from 'vitest';
import { addDays, isValidDate, startOfMonth, startOfWeek } from '../../src/domain/dates';
import { can, canCreateProject, canManageUsers, canViewWorkload, PROJECT_ACTIONS } from '../../src/domain/permissions';
import { workloadLevel, workloadRatio } from '../../src/domain/workload';

describe('permisos', () => {
  it('admin puede todo, incluso sin ser miembro', () => {
    for (const action of PROJECT_ACTIONS) expect(can('admin', null, action)).toBe(true);
  });

  it('sin membresía no hay acceso al proyecto', () => {
    expect(can('lider', null, 'project:view')).toBe(false);
    expect(can('miembro', null, 'project:view')).toBe(false);
  });

  it('gestor administra todo salvo eliminar el proyecto', () => {
    expect(can('miembro', 'gestor', 'members:manage')).toBe(true);
    expect(can('miembro', 'gestor', 'report:view')).toBe(true);
    expect(can('lider', 'gestor', 'project:delete')).toBe(false);
  });

  it('colaborador trabaja tareas pero no administra', () => {
    expect(can('miembro', 'colaborador', 'task:update')).toBe(true);
    expect(can('miembro', 'colaborador', 'time:log')).toBe(true);
    expect(can('miembro', 'colaborador', 'task:delete')).toBe(false);
    expect(can('miembro', 'colaborador', 'members:manage')).toBe(false);
    expect(can('miembro', 'colaborador', 'report:view')).toBe(false);
  });

  it('observador solo ve y comenta', () => {
    expect(can('miembro', 'observador', 'project:view')).toBe(true);
    expect(can('miembro', 'observador', 'task:comment')).toBe(true);
    expect(can('miembro', 'observador', 'task:update')).toBe(false);
    expect(can('miembro', 'observador', 'time:log')).toBe(false);
  });

  it('roles globales', () => {
    expect(canCreateProject('lider')).toBe(true);
    expect(canCreateProject('miembro')).toBe(false);
    expect(canManageUsers('lider')).toBe(false);
    expect(canViewWorkload('lider')).toBe(true);
    expect(canViewWorkload('miembro')).toBe(false);
  });
});

describe('fechas y carga de trabajo', () => {
  it('valida fechas de calendario reales', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('28/02/2026')).toBe(false);
  });

  it('calcula inicio de semana (lunes) y de mes', () => {
    expect(startOfWeek('2026-03-18')).toBe('2026-03-16'); // miércoles → lunes
    expect(startOfWeek('2026-03-22')).toBe('2026-03-16'); // domingo → lunes anterior
    expect(startOfMonth('2026-03-18')).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('clasifica el nivel de carga contra 40 h semanales', () => {
    expect(workloadRatio(20)).toBe(50);
    expect(workloadLevel(10)).toBe('baja');
    expect(workloadLevel(40)).toBe('normal');
    expect(workloadLevel(55)).toBe('alta');
    expect(workloadLevel(70)).toBe('sobrecarga');
  });
});
