/**
 * DTOs de entrada validados con zod. La validación de FORMA vive aquí; las
 * reglas de NEGOCIO (dependencias, permisos, límites) viven en servicios/dominio.
 */
import { z } from 'zod';
import { isValidDate } from '../domain/dates';
import { ValidationError } from '../domain/errors';
import { GLOBAL_ROLES, PRIORITIES, PROJECT_ROLES, PROJECT_STATUSES, TASK_STATUSES } from '../domain/types';

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.') || '(raíz)', message: i.message }));
    throw new ValidationError('La solicitud contiene datos inválidos', errors);
  }
  return result.data;
}

const dateStr = z.string().refine(isValidDate, 'Fecha inválida, usa el formato YYYY-MM-DD');
const optionalDate = dateStr.nullable().optional();
export const idSchema = z.coerce.number().int().positive();
const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');
const trimmed = (min: number, max: number) => z.string().trim().min(min, `Mínimo ${min} caracteres`).max(max, `Máximo ${max} caracteres`);

export const idParam = z.object({ id: idSchema });

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const orderSchema = z.enum(['asc', 'desc']).default('asc');

const datesInOrder = (d: { startDate?: string | null; endDate?: string | null; dueDate?: string | null }) => {
  const end = d.endDate ?? d.dueDate;
  return !d.startDate || !end || d.startDate <= end;
};

// ---------- Auth / usuarios ----------
export const loginSchema = z.object({
  email: z.string().trim().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'Máximo 72 caracteres (límite de bcrypt)')
  .regex(/[A-Za-z]/, 'Debe incluir al menos una letra')
  .regex(/\d/, 'Debe incluir al menos un número');

export const createUserSchema = z.object({
  name: trimmed(2, 120),
  email: z.string().trim().email('Correo inválido').max(160),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,40}$/, 'Usuario: 3-40 caracteres (letras, números, "_" o ".")'),
  password: passwordSchema,
  role: z.enum(GLOBAL_ROLES).default('miembro'),
});

export const updateUserSchema = z
  .object({
    name: trimmed(2, 120).optional(),
    role: z.enum(GLOBAL_ROLES).optional(),
    active: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Debes enviar al menos un campo');

export const listUsersQuery = pageQuery.extend({
  search: z.string().trim().max(100).optional(),
  role: z.enum(GLOBAL_ROLES).optional(),
  active: boolQuery.optional(),
});

// ---------- Proyectos ----------
const projectBase = z.object({
  name: trimmed(3, 150),
  description: z.string().trim().max(5000).default(''),
  status: z.enum(PROJECT_STATUSES).default('activo'),
  startDate: optionalDate,
  endDate: optionalDate,
});
export const createProjectSchema = projectBase.refine(datesInOrder, {
  message: 'La fecha de fin no puede ser anterior a la de inicio',
  path: ['endDate'],
});
export const updateProjectSchema = projectBase
  .partial()
  .refine(datesInOrder, { message: 'La fecha de fin no puede ser anterior a la de inicio', path: ['endDate'] });

export const listProjectsQuery = pageQuery.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  sort: z.enum(['name', 'createdAt', 'endDate', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const addMemberSchema = z.object({ userId: idSchema, role: z.enum(PROJECT_ROLES).default('colaborador') });
export const updateMemberSchema = z.object({ role: z.enum(PROJECT_ROLES) });
export const createLabelSchema = z.object({
  name: trimmed(1, 40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal, p. ej. #6366f1')
    .default('#6366f1'),
});

// ---------- Tareas ----------
const taskBase = z.object({
  title: trimmed(3, 200),
  description: z.string().trim().max(10000).default(''),
  status: z.enum(TASK_STATUSES).default('pendiente'),
  priority: z.enum(PRIORITIES).default('media'),
  assigneeId: idSchema.nullable().optional(),
  estimatedHours: z.coerce.number().min(0).max(9999).default(0),
  startDate: optionalDate,
  dueDate: optionalDate,
  labelIds: z.array(idSchema).max(20).default([]),
});
export const createTaskSchema = taskBase
  .extend({ parentId: idSchema.nullable().optional() })
  .refine(datesInOrder, { message: 'La fecha límite no puede ser anterior a la de inicio', path: ['dueDate'] });

// En una actualización parcial no se aplican defaults: solo cambia lo enviado.
export const updateTaskSchema = z
  .object({
    title: trimmed(3, 200),
    description: z.string().trim().max(10000),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(PRIORITIES),
    assigneeId: idSchema.nullable(),
    estimatedHours: z.coerce.number().min(0).max(9999),
    startDate: dateStr.nullable(),
    dueDate: dateStr.nullable(),
    labelIds: z.array(idSchema).max(20),
  })
  .partial()
  .refine(datesInOrder, { message: 'La fecha límite no puede ser anterior a la de inicio', path: ['dueDate'] });

export const moveTaskSchema = z.object({
  status: z.enum(TASK_STATUSES),
  position: z.coerce.number().int().min(0),
});

export const listTasksQuery = pageQuery.extend({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: idSchema.optional(),
  labelId: idSchema.optional(),
  search: z.string().trim().max(100).optional(),
  /** true = solo tareas de primer nivel (por defecto). */
  topLevel: boolQuery.default('true'),
  overdue: boolQuery.optional(),
  sort: z.enum(['position', 'dueDate', 'priority', 'createdAt', 'title']).default('position'),
  order: orderSchema,
});

export const dependencySchema = z.object({ dependsOnId: idSchema });
export const commentSchema = z.object({ body: trimmed(1, 2000) });

// ---------- Horas ----------
export const timeEntrySchema = z
  .object({
    workDate: dateStr,
    minutes: z.coerce.number().int().min(1).max(1440).optional(),
    hours: z.coerce.number().positive().max(24).optional(),
    note: z.string().trim().max(300).default(''),
  })
  .refine((v) => v.minutes !== undefined || v.hours !== undefined, {
    message: 'Indica "minutes" u "hours"',
    path: ['minutes'],
  })
  .transform((v) => ({
    workDate: v.workDate,
    minutes: v.minutes ?? Math.round((v.hours as number) * 60),
    note: v.note,
  }));

export const timeListQuery = pageQuery.extend({
  from: dateStr.optional(),
  to: dateStr.optional(),
  userId: idSchema.optional(),
  projectId: idSchema.optional(),
});

export const rangeQuery = z
  .object({ from: dateStr.optional(), to: dateStr.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: '"from" debe ser anterior o igual a "to"', path: ['from'] });

export const hoursReportQuery = z
  .object({ from: dateStr.optional(), to: dateStr.optional(), format: z.enum(['json', 'csv']).default('json') })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: '"from" debe ser anterior o igual a "to"', path: ['from'] });

export const notificationsQuery = pageQuery.extend({ unread: boolQuery.optional() });

export type CreateUserDto = z.output<typeof createUserSchema>;
export type UpdateUserDto = z.output<typeof updateUserSchema>;
export type CreateProjectDto = z.output<typeof createProjectSchema>;
export type UpdateProjectDto = z.output<typeof updateProjectSchema>;
export type CreateTaskDto = z.output<typeof createTaskSchema>;
export type UpdateTaskDto = z.output<typeof updateTaskSchema>;
export type MoveTaskDto = z.output<typeof moveTaskSchema>;
export type ListTasksQuery = z.output<typeof listTasksQuery>;
export type ListProjectsQuery = z.output<typeof listProjectsQuery>;
export type ListUsersQuery = z.output<typeof listUsersQuery>;
export type TimeEntryDto = z.output<typeof timeEntrySchema>;
export type TimeListQuery = z.output<typeof timeListQuery>;
