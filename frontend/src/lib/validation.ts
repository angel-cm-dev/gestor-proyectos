/**
 * Validación de formularios en el cliente: da feedback inmediato. El backend
 * vuelve a validar todo (nunca se confía en el cliente).
 */
export type Errors<T> = Partial<Record<keyof T, string>>;

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function validateLogin(v: { email: string; password: string }): Errors<typeof v> {
  const e: Errors<typeof v> = {};
  if (!v.email.trim()) e.email = 'Ingresa tu correo';
  else if (!isEmail(v.email)) e.email = 'Correo inválido';
  if (!v.password) e.password = 'Ingresa tu contraseña';
  return e;
}

export interface ProjectForm {
  name: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string;
}
export function validateProject(v: ProjectForm): Errors<ProjectForm> {
  const e: Errors<ProjectForm> = {};
  if (v.name.trim().length < 3) e.name = 'Mínimo 3 caracteres';
  if (v.name.trim().length > 150) e.name = 'Máximo 150 caracteres';
  if (v.startDate && v.endDate && v.startDate > v.endDate) e.endDate = 'La fecha de fin no puede ser anterior al inicio';
  return e;
}

export interface TaskForm {
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string;
  estimatedHours: string;
  startDate: string;
  dueDate: string;
  labelIds: number[];
}
export function validateTask(v: TaskForm): Errors<TaskForm> {
  const e: Errors<TaskForm> = {};
  if (v.title.trim().length < 3) e.title = 'Mínimo 3 caracteres';
  const hours = Number(v.estimatedHours || 0);
  if (Number.isNaN(hours) || hours < 0 || hours > 9999) e.estimatedHours = 'Entre 0 y 9999 horas';
  if (v.startDate && v.dueDate && v.startDate > v.dueDate) e.dueDate = 'La fecha límite no puede ser anterior al inicio';
  return e;
}

export function validateTimeEntry(v: { workDate: string; hours: string }, today: string): Errors<typeof v> {
  const e: Errors<typeof v> = {};
  const hours = Number(v.hours);
  if (!v.workDate) e.workDate = 'Indica la fecha';
  else if (v.workDate > today) e.workDate = 'No se registran horas a futuro';
  if (!v.hours || Number.isNaN(hours) || hours <= 0 || hours > 24) e.hours = 'Entre 0.1 y 24 horas';
  return e;
}

export interface UserForm {
  name: string;
  email: string;
  username: string;
  password: string;
  role: string;
}
export function validateUser(v: UserForm): Errors<UserForm> {
  const e: Errors<UserForm> = {};
  if (v.name.trim().length < 2) e.name = 'Mínimo 2 caracteres';
  if (!isEmail(v.email)) e.email = 'Correo inválido';
  if (!/^[a-z0-9_.]{3,40}$/.test(v.username)) e.username = '3-40 caracteres: minúsculas, números, "_" o "."';
  if (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) {
    e.password = 'Mínimo 8 caracteres con letras y números';
  }
  return e;
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;
