import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, login, TODAY } from './helpers';

/*
 * IDs del seed (deterministas):
 * usuarios: 1 admin, 2 lucia (lider), 3 mario, 4 carla, 5 diego, 6 sofia (lider)
 * proyecto 1 "Portal de clientes": lucia gestor, mario/carla colaboradores, diego observador
 *   tareas: 1 modelo(hecha) 2 auth(hecha) 3 tracking(en_progreso, subtareas 4,5,6)
 *           7 correo(vencida) 8 seguridad(en_revision) 9 bug(en_progreso) 10 deploy(depende de 3,7,8)
 * proyecto 2 "Sabor Limeño": sofia gestor, mario/diego colaboradores, lucia observador
 * proyecto 3 "Migración ERP": lucia gestor, carla colaboradora
 */
let app: Express;
const tokens: Record<string, string> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

beforeAll(async () => {
  app = await buildTestApp();
  tokens.admin = await login(app, 'admin@demo.pe');
  tokens.lucia = await login(app, 'lider@demo.pe');
  tokens.mario = await login(app, 'miembro@demo.pe');
  tokens.carla = await login(app, 'carla@demo.pe');
  tokens.diego = await login(app, 'diego@demo.pe');
});

describe('salud y errores genéricos', () => {
  it('GET /health responde ok con estado de la BD', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('una ruta inexistente devuelve Problem Details 404', async () => {
    const res = await request(app).get('/api/no-existe').set(auth('admin'));
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 404, code: 'route_not_found' });
  });

  it('JSON mal formado devuelve 400 invalid_json', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_json');
  });

  it('expone la especificación OpenAPI', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
  });
});

describe('autenticación', () => {
  it('login correcto devuelve token y usuario sin hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@demo.pe', password: 'Demo123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'admin@demo.pe', role: 'admin' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('credenciales inválidas → 401 sin revelar si el correo existe', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'admin@demo.pe', password: 'mala' });
    const b = await request(app).post('/api/auth/login').send({ email: 'nadie@demo.pe', password: 'mala' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.detail).toBe(b.body.detail);
  });

  it('valida el cuerpo con detalle por campo', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'no-es-correo' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_error');
    expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('sin token o con token inválido → 401', async () => {
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).get('/api/projects').set('Authorization', 'Bearer x.y.z')).status).toBe(401);
  });

  it('GET /auth/me devuelve el usuario actual', async () => {
    const res = await request(app).get('/api/auth/me').set(auth('mario'));
    expect(res.body).toMatchObject({ username: 'mario', role: 'miembro' });
  });
});

describe('proyectos: visibilidad, paginación y permisos', () => {
  it('admin ve todos; un miembro solo sus proyectos', async () => {
    const all = await request(app).get('/api/projects').set(auth('admin'));
    expect(all.body.total).toBe(3);
    const mine = await request(app).get('/api/projects').set(auth('mario'));
    expect(mine.body.items.map((p: { id: number }) => p.id).sort()).toEqual([1, 2]);
    expect(mine.body.items.find((p: { id: number }) => p.id === 1).myRole).toBe('colaborador');
  });

  it('pagina, busca, filtra y ordena', async () => {
    const page = await request(app).get('/api/projects?pageSize=2&page=2&sort=name&order=asc').set(auth('admin'));
    expect(page.body).toMatchObject({ total: 3, page: 2, pageSize: 2, totalPages: 2 });
    expect(page.body.items).toHaveLength(1);
    const search = await request(app).get('/api/projects?search=sabor').set(auth('admin'));
    expect(search.body.items.map((p: { name: string }) => p.name)).toEqual(['App móvil Sabor Limeño']);
    const status = await request(app).get('/api/projects?status=planificado').set(auth('admin'));
    expect(status.body.total).toBe(1);
  });

  it('incluye el avance calculado', async () => {
    const res = await request(app).get('/api/projects/1').set(auth('lucia'));
    expect(res.status).toBe(200);
    expect(res.body.progress).toBeGreaterThan(0);
    expect(res.body.progress).toBeLessThan(100);
    expect(res.body.members).toHaveLength(4);
    expect(res.body.labels.length).toBeGreaterThan(0);
  });

  it('un no-miembro no puede ver el proyecto (403)', async () => {
    const res = await request(app).get('/api/projects/3').set(auth('mario'));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden');
  });

  it('un miembro global no puede crear proyectos; un líder sí y queda como gestor', async () => {
    const denied = await request(app).post('/api/projects').set(auth('mario')).send({ name: 'Proyecto X' });
    expect(denied.status).toBe(403);
    const created = await request(app)
      .post('/api/projects')
      .set(auth('lucia'))
      .send({ name: 'Intranet RR.HH.', startDate: '2026-04-01', endDate: '2026-06-30' });
    expect(created.status).toBe(201);
    const detail = await request(app).get(`/api/projects/${created.body.id}`).set(auth('lucia'));
    expect(detail.body.myRole).toBe('gestor');
  });

  it('rechaza fechas incoherentes', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(auth('lucia'))
      .send({ name: 'Fechas malas', startDate: '2026-05-01', endDate: '2026-04-01' });
    expect(res.status).toBe(400);
  });

  it('solo admin elimina proyectos', async () => {
    expect((await request(app).delete('/api/projects/3').set(auth('lucia'))).status).toBe(403);
  });
});

describe('miembros del proyecto', () => {
  it('el gestor agrega miembros y no permite duplicados', async () => {
    const res = await request(app).post('/api/projects/3/members').set(auth('lucia')).send({ userId: 3, role: 'colaborador' });
    expect(res.status).toBe(201);
    expect(res.body.map((m: { userId: number }) => m.userId)).toContain(3);
    const dup = await request(app).post('/api/projects/3/members').set(auth('lucia')).send({ userId: 3 });
    expect(dup.status).toBe(409);
  });

  it('un proyecto no puede quedarse sin gestor', async () => {
    const res = await request(app).patch('/api/projects/3/members/2').set(auth('lucia')).send({ role: 'colaborador' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('last_manager');
  });

  it('un colaborador no gestiona miembros', async () => {
    const res = await request(app).post('/api/projects/1/members').set(auth('mario')).send({ userId: 6 });
    expect(res.status).toBe(403);
  });
});

describe('tareas: filtros, validaciones y reglas', () => {
  it('filtra por estado y vencidas; ordena por prioridad', async () => {
    const overdue = await request(app).get('/api/projects/1/tasks?overdue=true').set(auth('mario'));
    expect(overdue.body.items.map((t: { title: string }) => t.title)).toEqual(['Notificaciones por correo']);
    const byPriority = await request(app).get('/api/projects/1/tasks?sort=priority&order=desc').set(auth('mario'));
    expect(byPriority.body.items[0].priority).toBe('critica');
    const subtasks = await request(app).get('/api/projects/1/tasks?topLevel=false&search=estados').set(auth('mario'));
    expect(subtasks.body.total).toBe(1);
    const byLabel = await request(app).get('/api/projects/1/tasks?labelId=3').set(auth('mario'));
    expect(byLabel.body.items.map((t: { id: number }) => t.id)).toEqual([9]);
  });

  it('valida la entrada al crear', async () => {
    const res = await request(app).post('/api/projects/1/tasks').set(auth('mario')).send({ title: 'x', priority: 'urgente' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(expect.arrayContaining(['title', 'priority']));
  });

  it('el responsable debe ser miembro del proyecto', async () => {
    const res = await request(app).post('/api/projects/1/tasks').set(auth('mario')).send({ title: 'Tarea ajena', assigneeId: 6 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('assignee_not_member');
  });

  it('crea tareas con etiquetas y subtareas de un solo nivel', async () => {
    const created = await request(app)
      .post('/api/projects/1/tasks')
      .set(auth('mario'))
      .send({ title: 'Documentar API', estimatedHours: 3, labelIds: [2], assigneeId: 4, dueDate: '2026-03-25' });
    expect(created.status).toBe(201);
    expect(created.body.labels.map((l: { name: string }) => l.name)).toEqual(['backend']);

    const deep = await request(app).post('/api/projects/1/tasks').set(auth('mario')).send({ title: 'Nieta', parentId: 4 });
    expect(deep.status).toBe(422);
    expect(deep.body.code).toBe('subtask_depth');

    // La asignación genera una notificación para Carla.
    const notes = await request(app).get('/api/notifications').set(auth('carla'));
    expect(notes.body.items.some((n: { type: string }) => n.type === 'asignacion')).toBe(true);
  });

  it('no se completa una tarea con dependencias pendientes', async () => {
    const res = await request(app).patch('/api/tasks/10').set(auth('lucia')).send({ status: 'hecha' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('dependencies_pending');
    expect(res.body.errors.map((d: { id: number }) => d.id).sort()).toEqual([3, 7, 8]);
  });

  it('no se completa una tarea con subtareas abiertas', async () => {
    const res = await request(app).post('/api/tasks/3/move').set(auth('carla')).send({ status: 'hecha', position: 0 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('subtasks_pending');
  });

  it('rechaza dependencias que crean ciclos y duplicadas', async () => {
    const cycle = await request(app).post('/api/tasks/1/dependencies').set(auth('lucia')).send({ dependsOnId: 10 });
    expect(cycle.status).toBe(422);
    expect(cycle.body.code).toBe('dependency_cycle');
    const dup = await request(app).post('/api/tasks/10/dependencies').set(auth('lucia')).send({ dependsOnId: 3 });
    expect(dup.status).toBe(409);
    const cross = await request(app).post('/api/tasks/9/dependencies').set(auth('admin')).send({ dependsOnId: 11 });
    expect(cross.status).toBe(422);
    expect(cross.body.code).toBe('cross_project');
  });

  it('el tablero agrupa por estado y marca tareas bloqueadas', async () => {
    const res = await request(app).get('/api/projects/1/board').set(auth('diego'));
    expect(res.status).toBe(200);
    expect(res.body.columns.map((c: { status: string }) => c.status)).toEqual(['pendiente', 'en_progreso', 'en_revision', 'hecha']);
    const pending = res.body.columns[0].tasks;
    expect(pending.find((t: { id: number }) => t.id === 10).blocked).toBe(true);
    const tracking = res.body.columns[1].tasks.find((t: { id: number }) => t.id === 3);
    expect(tracking.progress).toBeGreaterThan(0);
  });

  it('mueve en el kanban (drag & drop) reordenando la columna destino', async () => {
    const res = await request(app).post('/api/tasks/9/move').set(auth('mario')).send({ status: 'en_revision', position: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'en_revision', position: 0 });
    const board = await request(app).get('/api/projects/1/board').set(auth('mario'));
    const review = board.body.columns[2].tasks.map((t: { id: number }) => t.id);
    expect(review).toEqual([9, 8]);
  });

  it('cierra subtareas y luego la tarea padre (fija completedAt)', async () => {
    for (const id of [5, 6]) {
      const r = await request(app).patch(`/api/tasks/${id}`).set(auth('carla')).send({ status: 'hecha' });
      expect(r.status).toBe(200);
    }
    const parent = await request(app).post('/api/tasks/3/move').set(auth('carla')).send({ status: 'hecha', position: 0 });
    expect(parent.status).toBe(200);
    expect(parent.body.completedAt).toEqual(expect.any(String));
    const detail = await request(app).get('/api/tasks/3').set(auth('carla'));
    expect(detail.body.progress).toBe(100);
    expect(detail.body.subtasks).toHaveLength(3);
    // No se puede reabrir una subtarea mientras el padre está hecho.
    const reopen = await request(app).patch('/api/tasks/5').set(auth('carla')).send({ status: 'en_progreso' });
    expect(reopen.status).toBe(422);
    expect(reopen.body.code).toBe('parent_closed');
  });

  it('un observador no edita tareas; un colaborador no las elimina', async () => {
    expect((await request(app).patch('/api/tasks/7').set(auth('diego')).send({ title: 'Cambio' })).status).toBe(403);
    expect((await request(app).delete('/api/tasks/7').set(auth('mario'))).status).toBe(403);
  });
});

describe('comentarios y menciones', () => {
  it('detecta menciones, registra solo miembros y notifica', async () => {
    const res = await request(app)
      .post('/api/tasks/7/comments')
      .set(auth('mario'))
      .send({ body: '@carla y @lucia revisen el SMTP; cc @sofia (no es miembro) y correo ops@demo.pe' });
    expect(res.status).toBe(201);
    expect(res.body.mentions.sort()).toEqual(['carla', 'lucia']);
    expect(res.body.ignoredMentions).toEqual(['sofia']);

    const notes = await request(app).get('/api/notifications?unread=true').set(auth('lucia'));
    const mention = notes.body.items.find((n: { type: string; taskId: number }) => n.type === 'mencion' && n.taskId === 7);
    expect(mention.message).toContain('Mario Quispe');
    expect(notes.body.unread).toBeGreaterThan(0);

    const read = await request(app).post(`/api/notifications/${mention.id}/read`).set(auth('lucia'));
    expect(read.status).toBe(204);
    // Nadie más puede marcar notificaciones ajenas.
    expect((await request(app).post(`/api/notifications/${mention.id}/read`).set(auth('mario'))).status).toBe(404);
  });

  it('un observador puede comentar y listar comentarios', async () => {
    expect((await request(app).post('/api/tasks/7/comments').set(auth('diego')).send({ body: 'Visto' })).status).toBe(201);
    const list = await request(app).get('/api/tasks/7/comments').set(auth('diego'));
    expect(list.body.length).toBeGreaterThanOrEqual(2);
  });
});

describe('registro de horas (timesheet)', () => {
  it('registra horas (acepta horas decimales) y las lista en el timesheet', async () => {
    const res = await request(app).post('/api/tasks/9/time-entries').set(auth('mario')).send({ workDate: TODAY, hours: 1.5, note: 'Fix' });
    expect(res.status).toBe(201);
    expect(res.body.minutes).toBe(90);
    const sheet = await request(app).get(`/api/time-entries?from=${TODAY}&to=${TODAY}`).set(auth('mario'));
    expect(sheet.body.totalMinutes).toBe(60 + 90);
  });

  it('rechaza fechas futuras y más de 24 h por día', async () => {
    const future = await request(app).post('/api/tasks/9/time-entries').set(auth('mario')).send({ workDate: '2026-03-19', minutes: 30 });
    expect(future.status).toBe(422);
    expect(future.body.code).toBe('future_date');
    const tooMuch = await request(app).post('/api/tasks/9/time-entries').set(auth('mario')).send({ workDate: TODAY, minutes: 1300 });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.code).toBe('daily_limit');
  });

  it('un observador no registra horas; nadie borra registros ajenos salvo el gestor', async () => {
    expect((await request(app).post('/api/tasks/9/time-entries').set(auth('diego')).send({ workDate: TODAY, minutes: 30 })).status).toBe(403);
    const sheet = await request(app).get('/api/time-entries').set(auth('mario'));
    const entryId = sheet.body.items[0].id;
    expect((await request(app).delete(`/api/time-entries/${entryId}`).set(auth('carla'))).status).toBe(403);
    expect((await request(app).delete(`/api/time-entries/${entryId}`).set(auth('lucia'))).status).toBe(204);
  });

  it('un usuario no admin no puede ver el timesheet de otro', async () => {
    const res = await request(app).get('/api/time-entries?userId=4').set(auth('mario'));
    expect(res.body.items.every((e: { userId: number }) => e.userId === 3)).toBe(true);
  });
});

describe('reportes', () => {
  it('reporte de horas del proyecto en JSON agrupa por usuario y tarea', async () => {
    const res = await request(app).get('/api/projects/1/reports/hours?from=2026-03-01&to=2026-03-31').set(auth('lucia'));
    expect(res.status).toBe(200);
    expect(res.body.totalMinutes).toBeGreaterThan(0);
    expect(res.body.byUser[0]).toMatchObject({ name: expect.any(String), hours: expect.any(Number) });
    const sum = res.body.byUser.reduce((a: number, u: { minutes: number }) => a + u.minutes, 0);
    expect(sum).toBe(res.body.totalMinutes);
  });

  it('exporta CSV descargable', async () => {
    const res = await request(app).get('/api/projects/1/reports/hours?format=csv&from=2026-03-01&to=2026-03-31').set(auth('lucia'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment; filename="horas-proyecto-1-2026-03-01_2026-03-31.csv"');
    const lines = res.text.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Fecha,Usuario,Tarea,Minutos,Horas,Nota');
    expect(lines.length).toBeGreaterThan(1);
    expect(res.text).toContain('Mario Quispe');
  });

  it('un colaborador no ve el reporte de horas del proyecto', async () => {
    expect((await request(app).get('/api/projects/1/reports/hours').set(auth('mario'))).status).toBe(403);
  });

  it('carga de trabajo: el líder ve solo a su equipo, el miembro no tiene acceso', async () => {
    const lider = await request(app).get('/api/reports/workload').set(auth('lucia'));
    expect(lider.status).toBe(200);
    const names = lider.body.rows.map((r: { username: string }) => r.username);
    expect(names).toEqual(expect.arrayContaining(['lucia', 'mario', 'carla', 'diego']));
    expect(names).not.toContain('sofia');
    expect(lider.body.rows[0]).toHaveProperty('level');
    expect((await request(app).get('/api/reports/workload').set(auth('mario'))).status).toBe(403);
    const admin = await request(app).get('/api/reports/workload').set(auth('admin'));
    expect(admin.body.rows.map((r: { username: string }) => r.username)).toContain('sofia');
  });

  it('dashboard con KPIs del usuario', async () => {
    const res = await request(app).get('/api/dashboard').set(auth('mario'));
    expect(res.status).toBe(200);
    expect(res.body.activeProjects).toBe(2);
    expect(res.body.my.openTasks).toBeGreaterThan(0);
    expect(res.body.tasks.byStatus).toHaveProperty('pendiente');
    expect(res.body.projects[0]).toHaveProperty('progress');
  });
});

describe('usuarios', () => {
  it('solo admin crea usuarios; valida contraseña y duplicados', async () => {
    const body = { name: 'Rosa Vega', email: 'rosa@demo.pe', username: 'rosa', password: 'Clave2026', role: 'miembro' };
    expect((await request(app).post('/api/users').set(auth('lucia')).send(body)).status).toBe(403);
    const weak = await request(app).post('/api/users').set(auth('admin')).send({ ...body, password: 'corta' });
    expect(weak.status).toBe(400);
    const ok = await request(app).post('/api/users').set(auth('admin')).send(body);
    expect(ok.status).toBe(201);
    const dup = await request(app).post('/api/users').set(auth('admin')).send({ ...body, username: 'rosa2' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('email_taken');
    expect(await login(app, 'rosa@demo.pe', 'Clave2026')).toEqual(expect.any(String));
  });

  it('un admin no puede quitarse su propio rol', async () => {
    const res = await request(app).patch('/api/users/1').set(auth('admin')).send({ role: 'miembro' });
    expect(res.status).toBe(409);
  });

  it('un usuario desactivado pierde acceso aunque tenga token', async () => {
    expect((await request(app).patch('/api/users/5').set(auth('admin')).send({ active: false })).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth('diego'))).status).toBe(401);
  });

  it('el directorio se puede buscar', async () => {
    const res = await request(app).get('/api/users?search=quispe').set(auth('mario'));
    expect(res.body.items.map((u: { username: string }) => u.username)).toEqual(['mario']);
  });
});
