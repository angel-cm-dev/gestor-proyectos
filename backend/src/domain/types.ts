/**
 * Entidades y enumeraciones del dominio.
 * El dominio no conoce Express, SQL ni JWT: solo describe el negocio.
 */

export const GLOBAL_ROLES = ['admin', 'lider', 'miembro'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

/** Rol dentro de un proyecto concreto (independiente del rol global). */
export const PROJECT_ROLES = ['gestor', 'colaborador', 'observador'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_STATUSES = ['planificado', 'activo', 'pausado', 'cerrado'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** El orden importa: es el orden de las columnas del tablero kanban. */
export const TASK_STATUSES = ['pendiente', 'en_progreso', 'en_revision', 'hecha'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['baja', 'media', 'alta', 'critica'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface User {
  id: number;
  name: string;
  email: string;
  username: string;
  role: GlobalRole;
  active: boolean;
  createdAt: string;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

/** Usuario autenticado que viaja en cada petición (extraído del JWT). */
export interface Actor {
  id: number;
  role: GlobalRole;
  name: string;
  username: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  ownerId: number;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends Project {
  memberCount: number;
  taskCount: number;
  doneCount: number;
  progress: number;
  myRole: ProjectRole | null;
}

export interface ProjectMember {
  projectId: number;
  userId: number;
  role: ProjectRole;
  name: string;
  email: string;
  username: string;
  joinedAt: string;
}

export interface Label {
  id: number;
  projectId: number;
  name: string;
  color: string;
}

export interface Task {
  id: number;
  projectId: number;
  parentId: number | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: number | null;
  assigneeName: string | null;
  estimatedHours: number;
  startDate: string | null;
  dueDate: string | null;
  position: number;
  createdBy: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  labels: Label[];
  dependsOn: number[];
  subtaskCount: number;
  subtaskDoneCount: number;
}

export interface DependencyEdge {
  taskId: number;
  dependsOnId: number;
}

export interface TimeEntry {
  id: number;
  taskId: number;
  taskTitle: string;
  projectId: number;
  projectName: string;
  userId: number;
  userName: string;
  workDate: string;
  minutes: number;
  note: string;
  createdAt: string;
}

export interface Comment {
  id: number;
  taskId: number;
  authorId: number;
  authorName: string;
  authorUsername: string;
  body: string;
  mentions: string[];
  createdAt: string;
}

export type NotificationType = 'mencion' | 'asignacion';

export interface Notification {
  id: number;
  userId: number;
  type: NotificationType;
  message: string;
  taskId: number | null;
  projectId: number | null;
  commentId: number | null;
  readAt: string | null;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export function buildPage<T>(items: T[], total: number, req: PageRequest): Page<T> {
  return {
    items,
    total,
    page: req.page,
    pageSize: req.pageSize,
    totalPages: Math.max(1, Math.ceil(total / req.pageSize)),
  };
}
