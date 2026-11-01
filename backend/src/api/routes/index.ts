import { Router } from 'express';
import {
  addMemberSchema,
  commentSchema,
  createLabelSchema,
  createProjectSchema,
  createTaskSchema,
  createUserSchema,
  dependencySchema,
  hoursReportQuery,
  idParam,
  idSchema,
  listProjectsQuery,
  listTasksQuery,
  listUsersQuery,
  loginSchema,
  moveTaskSchema,
  notificationsQuery,
  parse,
  rangeQuery,
  timeEntrySchema,
  timeListQuery,
  updateMemberSchema,
  updateProjectSchema,
  updateTaskSchema,
  updateUserSchema,
} from '../../application/dtos';
import type { Container } from '../../container';
import { actorOf, authenticate, requireRole } from '../middleware/auth';

/**
 * Capa API: traduce HTTP ⇄ casos de uso. Cada handler hace solo tres cosas:
 * validar la entrada (zod), llamar al servicio y serializar la respuesta.
 * Express 5 propaga automáticamente los errores de handlers async al errorHandler.
 */
export function buildApiRouter(c: Container): Router {
  const s = c.services;
  const api = Router();

  // ---------- Autenticación (pública) ----------
  api.post('/auth/login', async (req, res) => {
    const dto = parse(loginSchema, req.body);
    res.json(await s.auth.login(dto.email, dto.password));
  });

  // Todo lo que sigue requiere JWT.
  api.use(authenticate(s.auth));

  api.get('/auth/me', async (req, res) => {
    res.json(await s.auth.me(actorOf(req)));
  });

  // ---------- Usuarios ----------
  api.get('/users', async (req, res) => {
    res.json(await s.users.list(parse(listUsersQuery, req.query)));
  });
  api.post('/users', requireRole('admin'), async (req, res) => {
    res.status(201).json(await s.users.create(actorOf(req), parse(createUserSchema, req.body)));
  });
  api.patch('/users/:id', requireRole('admin'), async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.users.update(actorOf(req), id, parse(updateUserSchema, req.body)));
  });

  // ---------- Dashboard y reportes globales ----------
  api.get('/dashboard', async (req, res) => {
    res.json(await s.reports.dashboard(actorOf(req)));
  });
  api.get('/reports/workload', requireRole('admin', 'lider'), async (req, res) => {
    const q = parse(rangeQuery, req.query);
    res.json(await s.reports.workload(actorOf(req), q.from, q.to));
  });

  // ---------- Proyectos ----------
  api.get('/projects', async (req, res) => {
    res.json(await s.projects.list(actorOf(req), parse(listProjectsQuery, req.query)));
  });
  api.post('/projects', requireRole('admin', 'lider'), async (req, res) => {
    res.status(201).json(await s.projects.create(actorOf(req), parse(createProjectSchema, req.body)));
  });
  api.get('/projects/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.projects.get(actorOf(req), id));
  });
  api.patch('/projects/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.projects.update(actorOf(req), id, parse(updateProjectSchema, req.body)));
  });
  api.delete('/projects/:id', requireRole('admin'), async (req, res) => {
    const { id } = parse(idParam, req.params);
    await s.projects.delete(actorOf(req), id);
    res.status(204).end();
  });

  // Miembros
  api.get('/projects/:id/members', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.projects.listMembers(actorOf(req), id));
  });
  api.post('/projects/:id/members', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const dto = parse(addMemberSchema, req.body);
    res.status(201).json(await s.projects.addMember(actorOf(req), id, dto.userId, dto.role));
  });
  api.patch('/projects/:id/members/:userId', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const userId = parse(idSchema, req.params.userId);
    res.json(await s.projects.updateMember(actorOf(req), id, userId, parse(updateMemberSchema, req.body).role));
  });
  api.delete('/projects/:id/members/:userId', async (req, res) => {
    const { id } = parse(idParam, req.params);
    await s.projects.removeMember(actorOf(req), id, parse(idSchema, req.params.userId));
    res.status(204).end();
  });

  // Etiquetas
  api.get('/projects/:id/labels', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.projects.listLabels(actorOf(req), id));
  });
  api.post('/projects/:id/labels', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const dto = parse(createLabelSchema, req.body);
    res.status(201).json(await s.projects.createLabel(actorOf(req), id, dto.name, dto.color));
  });
  api.delete('/projects/:id/labels/:labelId', async (req, res) => {
    const { id } = parse(idParam, req.params);
    await s.projects.deleteLabel(actorOf(req), id, parse(idSchema, req.params.labelId));
    res.status(204).end();
  });

  // Tareas del proyecto y tablero
  api.get('/projects/:id/tasks', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.tasks.list(actorOf(req), id, parse(listTasksQuery, req.query)));
  });
  api.post('/projects/:id/tasks', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.status(201).json(await s.tasks.create(actorOf(req), id, parse(createTaskSchema, req.body)));
  });
  api.get('/projects/:id/board', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.tasks.board(actorOf(req), id));
  });

  // Reporte de horas (JSON o CSV)
  api.get('/projects/:id/reports/hours', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const q = parse(hoursReportQuery, req.query);
    if (q.format === 'csv') {
      const { filename, csv } = await s.reports.projectHoursCsv(actorOf(req), id, q.from, q.to);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.type('text/csv; charset=utf-8').send(csv);
      return;
    }
    res.json(await s.reports.projectHours(actorOf(req), id, q.from, q.to));
  });

  // ---------- Tareas ----------
  api.get('/tasks/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.tasks.get(actorOf(req), id));
  });
  api.patch('/tasks/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.tasks.update(actorOf(req), id, parse(updateTaskSchema, req.body)));
  });
  api.delete('/tasks/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    await s.tasks.delete(actorOf(req), id);
    res.status(204).end();
  });
  api.post('/tasks/:id/move', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.tasks.move(actorOf(req), id, parse(moveTaskSchema, req.body)));
  });
  api.post('/tasks/:id/dependencies', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const dto = parse(dependencySchema, req.body);
    res.status(201).json(await s.tasks.addDependency(actorOf(req), id, dto.dependsOnId));
  });
  api.delete('/tasks/:id/dependencies/:dependsOnId', async (req, res) => {
    const { id } = parse(idParam, req.params);
    await s.tasks.removeDependency(actorOf(req), id, parse(idSchema, req.params.dependsOnId));
    res.status(204).end();
  });
  api.get('/tasks/:id/comments', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.comments.list(actorOf(req), id));
  });
  api.post('/tasks/:id/comments', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.status(201).json(await s.comments.create(actorOf(req), id, parse(commentSchema, req.body).body));
  });
  api.get('/tasks/:id/time-entries', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await s.time.listForTask(actorOf(req), id));
  });
  api.post('/tasks/:id/time-entries', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.status(201).json(await s.time.log(actorOf(req), id, parse(timeEntrySchema, req.body)));
  });

  // ---------- Timesheet ----------
  api.get('/time-entries', async (req, res) => {
    res.json(await s.time.timesheet(actorOf(req), parse(timeListQuery, req.query)));
  });
  api.delete('/time-entries/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    await s.time.delete(actorOf(req), id);
    res.status(204).end();
  });

  // ---------- Notificaciones ----------
  api.get('/notifications', async (req, res) => {
    const q = parse(notificationsQuery, req.query);
    res.json(await s.notifications.list(actorOf(req), q.unread ?? false, q));
  });
  api.post('/notifications/read-all', async (req, res) => {
    res.json(await s.notifications.markAllRead(actorOf(req)));
  });
  api.post('/notifications/:id/read', async (req, res) => {
    const { id } = parse(idParam, req.params);
    await s.notifications.markRead(actorOf(req), id);
    res.status(204).end();
  });

  return api;
}
