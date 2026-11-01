/** Tipos que reflejan los contratos de la API (ver backend/src/domain/types.ts). */
export type GlobalRole = 'admin' | 'lider' | 'miembro';
export type ProjectRole = 'gestor' | 'colaborador' | 'observador';
export type ProjectStatus = 'planificado' | 'activo' | 'pausado' | 'cerrado';
export type TaskStatus = 'pendiente' | 'en_progreso' | 'en_revision' | 'hecha';
export type Priority = 'baja' | 'media' | 'alta' | 'critica';

export const TASK_STATUSES: TaskStatus[] = ['pendiente', 'en_progreso', 'en_revision', 'hecha'];
export const PRIORITIES: Priority[] = ['baja', 'media', 'alta', 'critica'];
export const PROJECT_STATUSES: ProjectStatus[] = ['planificado', 'activo', 'pausado', 'cerrado'];
export const PROJECT_ROLES: ProjectRole[] = ['gestor', 'colaborador', 'observador'];

export interface User {
  id: number;
  name: string;
  email: string;
  username: string;
  role: GlobalRole;
  active: boolean;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Label {
  id: number;
  projectId: number;
  name: string;
  color: string;
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

export interface Project {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  ownerId: number;
  ownerName: string;
  memberCount: number;
  taskCount: number;
  doneCount: number;
  progress: number;
  myRole: ProjectRole | null;
  createdAt: string;
}

export interface ProjectDetail extends Project {
  members: ProjectMember[];
  labels: Label[];
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
  completedAt: string | null;
  labels: Label[];
  dependsOn: number[];
  subtaskCount: number;
  subtaskDoneCount: number;
}

export interface BoardTask extends Task {
  progress: number;
  blocked: boolean;
}

export interface Board {
  columns: Array<{ status: TaskStatus; tasks: BoardTask[] }>;
  progress: number;
}

export interface DependencyInfo {
  id: number;
  title: string;
  status: TaskStatus;
}

export interface TaskDetail extends Task {
  progress: number;
  blocked: boolean;
  loggedMinutes: number;
  subtasks: Array<Task & { progress: number }>;
  dependencies: DependencyInfo[];
  dependents: DependencyInfo[];
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
  ignoredMentions?: string[];
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
}

export interface Notification {
  id: number;
  type: 'mencion' | 'asignacion';
  message: string;
  taskId: number | null;
  projectId: number | null;
  readAt: string | null;
  createdAt: string;
}

export interface HoursReport {
  projectId: number;
  projectName: string;
  from: string;
  to: string;
  totalMinutes: number;
  totalHours: number;
  byUser: Array<{ userId: number; name: string; minutes: number; hours: number }>;
  byTask: Array<{ taskId: number; title: string; minutes: number; hours: number }>;
  entries: TimeEntry[];
}

export interface WorkloadRow {
  userId: number;
  name: string;
  username: string;
  openTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  pendingEstimatedHours: number;
  loggedMinutes: number;
  loadPercent: number;
  level: 'baja' | 'normal' | 'alta' | 'sobrecarga';
}

export interface Dashboard {
  activeProjects: number;
  tasks: { total: number; open: number; overdue: number; completedLast7Days: number; byStatus: Record<TaskStatus, number> };
  my: { openTasks: number; overdueTasks: number; minutesThisWeek: number; upcoming: Task[] };
  projects: Project[];
}

/** Respuesta de error RFC 9457 que devuelve el backend. */
export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  traceId?: string;
  errors?: unknown;
}
