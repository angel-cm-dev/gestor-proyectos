import type { PasswordHasher } from '../../application/ports';
import { addDays } from '../../domain/dates';
import type { Db } from './db';

/**
 * Datos de demostración 100 % FICTICIOS (personas, empresas y correos inventados).
 * Las fechas se calculan relativas a "hoy" para que el dashboard siempre luzca vivo.
 * Es idempotente: si ya hay usuarios, no hace nada.
 */
export const DEMO_PASSWORD = 'Demo123!';

export const DEMO_USERS = [
  { name: 'Admin Demo', email: 'admin@demo.pe', username: 'admin', role: 'admin' },
  { name: 'Lucía Ramos', email: 'lider@demo.pe', username: 'lucia', role: 'lider' },
  { name: 'Mario Quispe', email: 'miembro@demo.pe', username: 'mario', role: 'miembro' },
  { name: 'Carla Huamán', email: 'carla@demo.pe', username: 'carla', role: 'miembro' },
  { name: 'Diego Torres', email: 'diego@demo.pe', username: 'diego', role: 'miembro' },
  { name: 'Sofía Paredes', email: 'sofia@demo.pe', username: 'sofia', role: 'lider' },
] as const;

type TaskSeed = {
  key: string;
  title: string;
  status: 'pendiente' | 'en_progreso' | 'en_revision' | 'hecha';
  priority: 'baja' | 'media' | 'alta' | 'critica';
  assignee: string | null;
  hours: number;
  due?: number;
  parent?: string;
  labels?: string[];
  dependsOn?: string[];
  description?: string;
};

export async function seedDemo(db: Db, hasher: PasswordHasher, today: string): Promise<boolean> {
  const { rows } = await db.query<{ n: unknown }>('SELECT COUNT(*) AS n FROM users');
  if (Number(rows[0]?.n) > 0) return false;

  const hash = await hasher.hash(DEMO_PASSWORD);
  const userId: Record<string, number> = {};
  for (const u of DEMO_USERS) {
    const r = await db.query<{ id: number }>(
      'INSERT INTO users (name, email, username, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [u.name, u.email, u.username, hash, u.role],
    );
    userId[u.username] = r.rows[0].id;
  }

  const d = (offset: number) => addDays(today, offset);

  async function project(
    name: string,
    description: string,
    status: string,
    owner: string,
    start: number,
    end: number,
    members: Array<[string, string]>,
  ): Promise<number> {
    const r = await db.query<{ id: number }>(
      `INSERT INTO projects (name, description, status, start_date, end_date, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [name, description, status, d(start), d(end), userId[owner]],
    );
    const id = r.rows[0].id;
    for (const [username, role] of members) {
      await db.query('INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)', [id, userId[username], role]);
    }
    return id;
  }

  async function labels(projectId: number): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    const defs: Array<[string, string]> = [
      ['frontend', '#0ea5e9'],
      ['backend', '#8b5cf6'],
      ['bug', '#ef4444'],
      ['ux', '#f59e0b'],
      ['devops', '#10b981'],
    ];
    for (const [name, color] of defs) {
      const r = await db.query<{ id: number }>('INSERT INTO labels (project_id, name, color) VALUES ($1, $2, $3) RETURNING id', [projectId, name, color]);
      result[name] = r.rows[0].id;
    }
    return result;
  }

  async function tasks(projectId: number, creator: string, labelIds: Record<string, number>, defs: TaskSeed[]) {
    const ids: Record<string, number> = {};
    const positions: Record<string, number> = {};
    for (const t of defs) {
      const posKey = t.parent ? `sub-${t.parent}` : t.status;
      const position = positions[posKey] ?? 0;
      positions[posKey] = position + 1;
      const r = await db.query<{ id: number }>(
        `INSERT INTO tasks (project_id, parent_id, title, description, status, priority, assignee_id,
                            estimated_hours, start_date, due_date, position, created_by, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          projectId,
          t.parent ? ids[t.parent] : null,
          t.title,
          t.description ?? '',
          t.status,
          t.priority,
          t.assignee ? userId[t.assignee] : null,
          t.hours,
          d(-20),
          t.due === undefined ? null : d(t.due),
          position,
          userId[creator],
          t.status === 'hecha' ? new Date(`${d(-3)}T15:00:00Z`).toISOString() : null,
        ],
      );
      ids[t.key] = r.rows[0].id;
      for (const l of t.labels ?? []) {
        await db.query('INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)', [ids[t.key], labelIds[l]]);
      }
    }
    for (const t of defs) {
      for (const dep of t.dependsOn ?? []) {
        await db.query('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES ($1, $2)', [ids[t.key], ids[dep]]);
      }
    }
    return ids;
  }

  // ---------- Proyecto 1 ----------
  const p1 = await project(
    'Portal de clientes Andina Cargo',
    'Portal web para que los clientes de una empresa logística (ficticia) sigan sus envíos en tiempo real.',
    'activo',
    'lucia',
    -30,
    45,
    [
      ['lucia', 'gestor'],
      ['mario', 'colaborador'],
      ['carla', 'colaborador'],
      ['diego', 'observador'],
    ],
  );
  const l1 = await labels(p1);
  const t1 = await tasks(p1, 'lucia', l1, [
    { key: 'modelo', title: 'Diseñar modelo de datos', status: 'hecha', priority: 'alta', assignee: 'mario', hours: 8, due: -15, labels: ['backend'] },
    { key: 'auth', title: 'API de autenticación con JWT', status: 'hecha', priority: 'alta', assignee: 'mario', hours: 12, due: -8, labels: ['backend'], dependsOn: ['modelo'] },
    {
      key: 'tracking',
      title: 'Pantalla de seguimiento de envíos',
      status: 'en_progreso',
      priority: 'alta',
      assignee: 'carla',
      hours: 16,
      due: 5,
      labels: ['frontend', 'ux'],
      dependsOn: ['auth'],
      description: 'Vista con mapa, estado actual e historial del envío.',
    },
    { key: 'mapa', parent: 'tracking', title: 'Mapa de ruta del envío', status: 'hecha', priority: 'media', assignee: 'carla', hours: 4 },
    { key: 'historial', parent: 'tracking', title: 'Historial de estados', status: 'en_progreso', priority: 'media', assignee: 'carla', hours: 6 },
    { key: 'e2e', parent: 'tracking', title: 'Pruebas end-to-end', status: 'pendiente', priority: 'baja', assignee: 'mario', hours: 4 },
    { key: 'correo', title: 'Notificaciones por correo', status: 'pendiente', priority: 'media', assignee: 'mario', hours: 10, due: -2, labels: ['backend'], dependsOn: ['auth'] },
    { key: 'seguridad', title: 'Revisión de seguridad OWASP', status: 'en_revision', priority: 'critica', assignee: 'lucia', hours: 6, due: 3, labels: ['devops'] },
    { key: 'bug', title: 'Corregir fecha de entrega en zona horaria', status: 'en_progreso', priority: 'alta', assignee: 'mario', hours: 3, due: 1, labels: ['bug'] },
    { key: 'deploy', title: 'Despliegue a producción', status: 'pendiente', priority: 'critica', assignee: 'lucia', hours: 4, due: 20, labels: ['devops'], dependsOn: ['tracking', 'correo', 'seguridad'] },
  ]);

  // ---------- Proyecto 2 ----------
  const p2 = await project(
    'App móvil Sabor Limeño',
    'Aplicación de pedidos para una cadena de restaurantes (ficticia).',
    'activo',
    'sofia',
    -10,
    60,
    [
      ['sofia', 'gestor'],
      ['mario', 'colaborador'],
      ['diego', 'colaborador'],
      ['lucia', 'observador'],
    ],
  );
  const l2 = await labels(p2);
  const t2 = await tasks(p2, 'sofia', l2, [
    { key: 'wire', title: 'Wireframes del flujo de pedido', status: 'hecha', priority: 'media', assignee: 'diego', hours: 10, labels: ['ux'] },
    { key: 'carrito', title: 'Carrito de compras', status: 'en_progreso', priority: 'alta', assignee: 'diego', hours: 14, due: 7, labels: ['frontend'], dependsOn: ['wire'] },
    { key: 'pagos', title: 'Integración con pasarela de pagos (sandbox)', status: 'pendiente', priority: 'critica', assignee: 'mario', hours: 18, due: 15, labels: ['backend'], dependsOn: ['carrito'] },
    { key: 'menu', title: 'Catálogo de platos', status: 'en_revision', priority: 'media', assignee: 'diego', hours: 8, due: 2, labels: ['frontend'] },
  ]);

  // ---------- Proyecto 3 ----------
  const p3 = await project(
    'Migración ERP contable',
    'Migrar el módulo contable de un ERP heredado (ficticio) a una solución en la nube.',
    'planificado',
    'lucia',
    15,
    120,
    [
      ['lucia', 'gestor'],
      ['carla', 'colaborador'],
    ],
  );
  const l3 = await labels(p3);
  await tasks(p3, 'lucia', l3, [
    { key: 'inventario', title: 'Inventario de reportes actuales', status: 'pendiente', priority: 'media', assignee: 'carla', hours: 12, due: 25 },
    { key: 'plan', title: 'Plan de migración de datos', status: 'pendiente', priority: 'alta', assignee: 'lucia', hours: 8, due: 30, dependsOn: ['inventario'] },
  ]);

  // ---------- Horas registradas ----------
  const entries: Array<[number, string, number, number, string]> = [
    [t1.modelo, 'mario', -14, 240, 'Diagrama ER inicial'],
    [t1.modelo, 'mario', -13, 300, 'Normalización y revisión'],
    [t1.auth, 'mario', -10, 420, 'Login, refresh y roles'],
    [t1.auth, 'mario', -9, 360, 'Pruebas de integración'],
    [t1.mapa, 'carla', -6, 270, 'Integración del mapa'],
    [t1.historial, 'carla', -3, 180, 'Línea de tiempo de estados'],
    [t1.historial, 'carla', -1, 150, 'Ajustes responsive'],
    [t1.seguridad, 'lucia', -2, 120, 'Checklist OWASP Top 10'],
    [t1.bug, 'mario', -1, 90, 'Reproducción del error'],
    [t1.bug, 'mario', 0, 60, 'Fix y prueba unitaria'],
    [t2.wire, 'diego', -8, 360, 'Prototipo en Figma'],
    [t2.carrito, 'diego', -2, 300, 'Estado del carrito'],
    [t2.menu, 'diego', -1, 240, 'Listado y filtros'],
  ];
  for (const [taskId, user, day, minutes, note] of entries) {
    await db.query('INSERT INTO time_entries (task_id, user_id, work_date, minutes, note) VALUES ($1, $2, $3, $4, $5)', [
      taskId,
      userId[user],
      d(day),
      minutes,
      note,
    ]);
  }

  // ---------- Comentarios con mención ----------
  const c = await db.query<{ id: number }>('INSERT INTO comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING id', [
    t1.tracking,
    userId.lucia,
    '@carla ¿podemos mostrar el historial también en móvil? Gracias.',
  ]);
  await db.query('INSERT INTO comment_mentions (comment_id, user_id) VALUES ($1, $2)', [c.rows[0].id, userId.carla]);
  await db.query(
    `INSERT INTO notifications (user_id, type, message, task_id, project_id, comment_id) VALUES ($1, 'mencion', $2, $3, $4, $5)`,
    [userId.carla, 'Lucía Ramos te mencionó en "Pantalla de seguimiento de envíos"', t1.tracking, p1, c.rows[0].id],
  );
  await db.query('INSERT INTO comments (task_id, author_id, body) VALUES ($1, $2, $3)', [
    t1.tracking,
    userId.carla,
    'Sí, ya está en curso. Lo dejo listo para revisión esta semana.',
  ]);
  await db.query(
    `INSERT INTO notifications (user_id, type, message, task_id, project_id) VALUES ($1, 'asignacion', $2, $3, $4)`,
    [userId.mario, 'Sofía Paredes te asignó la tarea "Integración con pasarela de pagos (sandbox)"', t2.pagos, p2],
  );
  return true;
}
