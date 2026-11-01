import { download, http } from './client';
import type {
  Board,
  Comment,
  Dashboard,
  DependencyInfo,
  HoursReport,
  Label,
  Notification,
  Page,
  Priority,
  Project,
  ProjectDetail,
  ProjectMember,
  ProjectRole,
  ProjectStatus,
  Task,
  TaskDetail,
  TaskStatus,
  TimeEntry,
  User,
  WorkloadRow,
} from './types';

export interface ProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
}

export interface TaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: number | null;
  estimatedHours?: number;
  startDate?: string | null;
  dueDate?: string | null;
  parentId?: number | null;
  labelIds?: number[];
}

/** Un único lugar con todas las rutas de la API: las páginas nunca escriben URLs a mano. */
export const api = {
  login: (email: string, password: string) => http.post<{ token: string; user: User }>('/auth/login', { email, password }),
  me: () => http.get<User>('/auth/me'),

  users: (q: { page?: number; pageSize?: number; search?: string; role?: string } = {}) => http.get<Page<User>>('/users', q),
  createUser: (body: { name: string; email: string; username: string; password: string; role: string }) => http.post<User>('/users', body),
  updateUser: (id: number, body: Partial<{ name: string; role: string; active: boolean; password: string }>) =>
    http.patch<User>(`/users/${id}`, body),

  dashboard: () => http.get<Dashboard>('/dashboard'),
  workload: (q: { from?: string; to?: string } = {}) =>
    http.get<{ from: string; to: string; capacityHours: number; rows: WorkloadRow[] }>('/reports/workload', q),

  projects: (q: { page?: number; pageSize?: number; search?: string; status?: string; sort?: string; order?: string }) =>
    http.get<Page<Project>>('/projects', q),
  project: (id: number) => http.get<ProjectDetail>(`/projects/${id}`),
  createProject: (body: ProjectInput) => http.post<Project>('/projects', body),
  updateProject: (id: number, body: Partial<ProjectInput>) => http.patch<Project>(`/projects/${id}`, body),
  deleteProject: (id: number) => http.delete(`/projects/${id}`),

  addMember: (projectId: number, userId: number, role: ProjectRole) =>
    http.post<ProjectMember[]>(`/projects/${projectId}/members`, { userId, role }),
  updateMember: (projectId: number, userId: number, role: ProjectRole) =>
    http.patch<ProjectMember[]>(`/projects/${projectId}/members/${userId}`, { role }),
  removeMember: (projectId: number, userId: number) => http.delete(`/projects/${projectId}/members/${userId}`),
  createLabel: (projectId: number, name: string, color: string) => http.post<Label>(`/projects/${projectId}/labels`, { name, color }),

  tasks: (
    projectId: number,
    q: { page?: number; pageSize?: number; search?: string; status?: string; priority?: string; assigneeId?: number; overdue?: boolean; sort?: string; order?: string },
  ) => http.get<Page<Task>>(`/projects/${projectId}/tasks`, q),
  board: (projectId: number) => http.get<Board>(`/projects/${projectId}/board`),
  task: (id: number) => http.get<TaskDetail>(`/tasks/${id}`),
  createTask: (projectId: number, body: TaskInput) => http.post<Task>(`/projects/${projectId}/tasks`, body),
  updateTask: (id: number, body: Partial<TaskInput>) => http.patch<Task>(`/tasks/${id}`, body),
  deleteTask: (id: number) => http.delete(`/tasks/${id}`),
  moveTask: (id: number, status: TaskStatus, position: number) => http.post<Task>(`/tasks/${id}/move`, { status, position }),
  addDependency: (id: number, dependsOnId: number) => http.post<DependencyInfo[]>(`/tasks/${id}/dependencies`, { dependsOnId }),
  removeDependency: (id: number, dependsOnId: number) => http.delete(`/tasks/${id}/dependencies/${dependsOnId}`),

  comments: (taskId: number) => http.get<Comment[]>(`/tasks/${taskId}/comments`),
  addComment: (taskId: number, body: string) => http.post<Comment>(`/tasks/${taskId}/comments`, { body }),

  taskTime: (taskId: number) => http.get<{ items: TimeEntry[]; totalMinutes: number }>(`/tasks/${taskId}/time-entries`),
  logTime: (taskId: number, body: { workDate: string; minutes?: number; hours?: number; note?: string }) =>
    http.post<TimeEntry>(`/tasks/${taskId}/time-entries`, body),
  timesheet: (q: { page?: number; pageSize?: number; from?: string; to?: string; projectId?: number }) =>
    http.get<Page<TimeEntry> & { totalMinutes: number }>('/time-entries', q),
  deleteTime: (id: number) => http.delete(`/time-entries/${id}`),

  hoursReport: (projectId: number, q: { from?: string; to?: string }) => http.get<HoursReport>(`/projects/${projectId}/reports/hours`, q),
  downloadHoursCsv: (projectId: number, q: { from?: string; to?: string }) =>
    download(`/projects/${projectId}/reports/hours`, { ...q, format: 'csv' }, `horas-proyecto-${projectId}.csv`),

  notifications: (q: { page?: number; pageSize?: number; unread?: boolean } = {}) =>
    http.get<Page<Notification> & { unread: number }>('/notifications', q),
  markRead: (id: number) => http.post<void>(`/notifications/${id}/read`),
  markAllRead: () => http.post<{ updated: number }>('/notifications/read-all'),
};
