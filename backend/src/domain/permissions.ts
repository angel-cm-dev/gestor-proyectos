import type { GlobalRole, ProjectRole } from './types';

/**
 * Autorización en dos niveles:
 * 1. Rol global (admin, lider, miembro): qué puede hacer en el sistema.
 * 2. Rol por proyecto (gestor, colaborador, observador): qué puede hacer dentro
 *    de un proyecto concreto. Un "miembro" global puede ser "gestor" de un proyecto.
 *
 * Es una función pura: fácil de probar, y la tabla sirve como documentación.
 */
export const PROJECT_ACTIONS = [
  'project:view',
  'project:update',
  'project:delete',
  'members:manage',
  'labels:manage',
  'task:create',
  'task:update',
  'task:delete',
  'task:comment',
  'time:log',
  'time:manage',
  'report:view',
] as const;
export type ProjectAction = (typeof PROJECT_ACTIONS)[number];

export const PROJECT_PERMISSIONS: Record<ProjectRole, readonly ProjectAction[]> = {
  // El gestor administra todo el proyecto salvo eliminarlo (decisión reservada a admin).
  gestor: PROJECT_ACTIONS.filter((a) => a !== 'project:delete'),
  // El colaborador trabaja las tareas y registra sus horas, pero no administra.
  colaborador: ['project:view', 'task:create', 'task:update', 'task:comment', 'time:log'],
  // El observador (cliente, auditor) solo mira y puede comentar.
  observador: ['project:view', 'task:comment'],
};

export function can(globalRole: GlobalRole, projectRole: ProjectRole | null, action: ProjectAction): boolean {
  if (globalRole === 'admin') return true;
  if (projectRole === null) return false;
  return PROJECT_PERMISSIONS[projectRole].includes(action);
}

/** Crear proyectos: admin y lider. El creador queda como gestor del proyecto. */
export function canCreateProject(role: GlobalRole): boolean {
  return role === 'admin' || role === 'lider';
}

/** Gestionar usuarios del sistema: solo admin. */
export function canManageUsers(role: GlobalRole): boolean {
  return role === 'admin';
}

/** Ver la carga de trabajo del equipo: admin (todo) y lider (sus proyectos). */
export function canViewWorkload(role: GlobalRole): boolean {
  return role === 'admin' || role === 'lider';
}
