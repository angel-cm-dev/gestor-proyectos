/**
 * Puertos (interfaces) que la capa de aplicación necesita de la infraestructura.
 * Los servicios dependen de estas interfaces, no de PostgreSQL: así se pueden
 * reemplazar por dobles de prueba y la lógica de negocio queda desacoplada.
 */
import type { DependencyInfo } from '../domain/dependencies';
import type { ProgressNode } from '../domain/progress';
import type {
  Comment,
  DependencyEdge,
  GlobalRole,
  Label,
  Notification,
  NotificationType,
  Page,
  PageRequest,
  Priority,
  Project,
  ProjectMember,
  ProjectRole,
  ProjectStatus,
  Task,
  TaskStatus,
  TimeEntry,
  User,
  UserWithPassword,
} from '../domain/types';

export type SortOrder = 'asc' | 'desc';

// ---------- Usuarios ----------
export interface NewUser {
  name: string;
  email: string;
  username: string;
  passwordHash: string;
  role: GlobalRole;
}
export interface UserPatch {
  name?: string;
  role?: GlobalRole;
  active?: boolean;
  passwordHash?: string;
}
export interface UserFilter extends PageRequest {
  search?: string;
  role?: GlobalRole;
  active?: boolean;
}
export interface UserRepository {
  findByEmail(email: string): Promise<UserWithPassword | null>;
  findById(id: number): Promise<User | null>;
  findByUsernames(usernames: string[]): Promise<User[]>;
  findTaken(email: string, username: string): Promise<{ email: boolean; username: boolean }>;
  list(filter: UserFilter): Promise<Page<User>>;
  create(data: NewUser): Promise<User>;
  update(id: number, patch: UserPatch): Promise<User | null>;
}

// ---------- Proyectos ----------
export type ProjectSort = 'name' | 'createdAt' | 'endDate' | 'status';
export interface ProjectFilter extends PageRequest {
  /** Si se indica, solo proyectos donde ese usuario es miembro. */
  memberId?: number;
  search?: string;
  status?: ProjectStatus;
  sort: ProjectSort;
  order: SortOrder;
}
export interface ProjectRow extends Project {
  memberCount: number;
}
export interface NewProject {
  name: string;
  description: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  ownerId: number;
}
export type ProjectPatch = Partial<Omit<NewProject, 'ownerId'>>;

export interface ProjectRepository {
  list(filter: ProjectFilter): Promise<Page<ProjectRow>>;
  findById(id: number): Promise<Project | null>;
  create(data: NewProject): Promise<Project>;
  update(id: number, patch: ProjectPatch): Promise<Project | null>;
  delete(id: number): Promise<void>;
  getMemberRole(projectId: number, userId: number): Promise<ProjectRole | null>;
  memberRoles(userId: number, projectIds: number[]): Promise<Map<number, ProjectRole>>;
  listMembers(projectId: number): Promise<ProjectMember[]>;
  upsertMember(projectId: number, userId: number, role: ProjectRole): Promise<void>;
  removeMember(projectId: number, userId: number): Promise<boolean>;
  /** Ids de proyectos donde el usuario tiene alguno de los roles indicados (todos si se omite). */
  projectIdsForUser(userId: number, roles?: ProjectRole[]): Promise<number[]>;
  listLabels(projectId: number): Promise<Label[]>;
  createLabel(projectId: number, name: string, color: string): Promise<Label>;
  deleteLabel(projectId: number, labelId: number): Promise<boolean>;
}

// ---------- Tareas ----------
export type TaskSort = 'position' | 'dueDate' | 'priority' | 'createdAt' | 'title';
export interface TaskFilter extends PageRequest {
  projectId: number;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: number;
  labelId?: number;
  search?: string;
  /** null = solo tareas de primer nivel; número = subtareas de esa tarea; undefined = todas. */
  parentId?: number | null;
  overdue?: boolean;
  today: string;
  sort: TaskSort;
  order: SortOrder;
}
export interface NewTask {
  projectId: number;
  parentId: number | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: number | null;
  estimatedHours: number;
  startDate: string | null;
  dueDate: string | null;
  position: number;
  createdBy: number;
}
export type TaskPatch = Partial<{
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: number | null;
  estimatedHours: number;
  startDate: string | null;
  dueDate: string | null;
  position: number;
  completedAt: string | null;
}>;

export interface TaskRepository {
  list(filter: TaskFilter): Promise<Page<Task>>;
  listByProject(projectId: number): Promise<Task[]>;
  findById(id: number): Promise<Task | null>;
  listSubtasks(parentId: number): Promise<Task[]>;
  create(data: NewTask): Promise<Task>;
  update(id: number, patch: TaskPatch): Promise<Task>;
  delete(id: number): Promise<void>;
  setLabels(taskId: number, labelIds: number[]): Promise<void>;
  nextPosition(projectId: number, status: TaskStatus): Promise<number>;
  /** Tareas de primer nivel de una columna del kanban, ordenadas por posición. */
  listColumn(projectId: number, status: TaskStatus): Promise<Array<{ id: number; position: number }>>;
  setPositions(updates: Array<{ id: number; position: number }>): Promise<void>;
  dependencyEdges(projectId: number): Promise<DependencyEdge[]>;
  dependenciesOf(taskId: number): Promise<DependencyInfo[]>;
  dependentsOf(taskId: number): Promise<DependencyInfo[]>;
  addDependency(taskId: number, dependsOnId: number): Promise<void>;
  removeDependency(taskId: number, dependsOnId: number): Promise<boolean>;
  progressNodes(projectIds: number[]): Promise<Array<ProgressNode & { projectId: number }>>;
}

// ---------- Horas ----------
export interface NewTimeEntry {
  taskId: number;
  userId: number;
  workDate: string;
  minutes: number;
  note: string;
}
export interface TimeFilter {
  userId?: number;
  projectId?: number;
  taskId?: number;
  from?: string;
  to?: string;
}
export interface TimeEntryRepository {
  create(data: NewTimeEntry): Promise<TimeEntry>;
  findById(id: number): Promise<TimeEntry | null>;
  delete(id: number): Promise<void>;
  list(filter: TimeFilter, page: PageRequest): Promise<Page<TimeEntry> & { totalMinutes: number }>;
  listAll(filter: TimeFilter): Promise<TimeEntry[]>;
  sumMinutesForUserOnDate(userId: number, date: string): Promise<number>;
  sumMinutesByTask(taskIds: number[]): Promise<Map<number, number>>;
}

// ---------- Comentarios y notificaciones ----------
export interface CommentRepository {
  create(data: { taskId: number; authorId: number; body: string; mentionedUserIds: number[] }): Promise<Comment>;
  listByTask(taskId: number): Promise<Comment[]>;
}

export interface NewNotification {
  userId: number;
  type: NotificationType;
  message: string;
  taskId: number | null;
  projectId: number | null;
  commentId: number | null;
}
export interface NotificationRepository {
  createMany(items: NewNotification[]): Promise<void>;
  listForUser(userId: number, unreadOnly: boolean, page: PageRequest): Promise<Page<Notification>>;
  countUnread(userId: number): Promise<number>;
  markRead(id: number, userId: number): Promise<boolean>;
  markAllRead(userId: number): Promise<number>;
}

// ---------- Reportes ----------
export interface WorkloadRow {
  userId: number;
  name: string;
  username: string;
  openTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  pendingEstimatedHours: number;
  loggedMinutes: number;
}
export interface TaskStats {
  total: number;
  open: number;
  overdue: number;
  completedLast7Days: number;
  byStatus: Record<TaskStatus, number>;
}
export interface ReportRepository {
  /** projectIds null = todos los proyectos (vista de admin). */
  workload(params: { projectIds: number[] | null; from: string; to: string; today: string }): Promise<WorkloadRow[]>;
  taskStats(params: { projectIds: number[] | null; today: string; since: string }): Promise<TaskStats>;
  upcomingTasksForUser(userId: number, limit: number): Promise<Task[]>;
}

// ---------- Seguridad ----------
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}
export interface TokenService {
  sign(payload: { sub: number; role: GlobalRole; name: string; username: string }): string;
  verify(token: string): { sub: number; role: GlobalRole; name: string; username: string };
}

/** Reloj inyectable: las pruebas pueden fijar "hoy" sin depender de la fecha real. */
export interface Clock {
  now(): Date;
  today(): string;
}
