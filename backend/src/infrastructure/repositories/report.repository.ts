import type { ReportRepository, TaskStats, WorkloadRow } from '../../application/ports';
import { TASK_STATUSES, type Task, type TaskStatus } from '../../domain/types';
import { asNumber, placeholders, type Db } from '../db/db';
import { PgTaskRepository } from './task.repository';

/**
 * Consultas de lectura para reportes. Se resuelven con agregaciones simples
 * y se combinan en memoria: legibles, portables (PostgreSQL / pg-mem) y
 * suficientes para el volumen de un equipo de proyectos.
 */
export class PgReportRepository implements ReportRepository {
  private readonly tasks: PgTaskRepository;

  constructor(private readonly db: Db) {
    this.tasks = new PgTaskRepository(db);
  }

  async workload(params: { projectIds: number[] | null; from: string; to: string; today: string }): Promise<WorkloadRow[]> {
    const { projectIds, from, to, today } = params;
    if (projectIds !== null && projectIds.length === 0) return [];

    // 1. Personas consideradas: todos los usuarios activos (admin) o los miembros de esos proyectos.
    const userParams: unknown[] = [];
    const usersSql =
      projectIds === null
        ? 'SELECT id, name, username FROM users WHERE active = TRUE'
        : `SELECT DISTINCT u.id, u.name, u.username FROM users u
           JOIN project_members pm ON pm.user_id = u.id
           WHERE u.active = TRUE AND pm.project_id IN (${placeholders(projectIds, userParams)})`;
    const users = await this.db.query<{ id: number; name: string; username: string }>(usersSql, userParams);

    // 2. Tareas abiertas asignadas.
    const taskParams: unknown[] = [today];
    const taskScope = projectIds === null ? '' : ` AND project_id IN (${placeholders(projectIds, taskParams)})`;
    const tasks = await this.db.query<{ assignee_id: number; open: unknown; in_progress: unknown; overdue: unknown; hours: unknown }>(
      `SELECT assignee_id,
              COUNT(*) AS open,
              SUM(CASE WHEN status = 'en_progreso' THEN 1 ELSE 0 END) AS in_progress,
              SUM(CASE WHEN due_date < $1 THEN 1 ELSE 0 END) AS overdue,
              SUM(estimated_hours) AS hours
       FROM tasks
       WHERE status <> 'hecha' AND assignee_id IS NOT NULL${taskScope}
       GROUP BY assignee_id`,
      taskParams,
    );

    // 3. Horas registradas en el rango.
    const timeParams: unknown[] = [from, to];
    const timeScope = projectIds === null ? '' : ` AND t.project_id IN (${placeholders(projectIds, timeParams)})`;
    const time = await this.db.query<{ user_id: number; minutes: unknown }>(
      `SELECT te.user_id, SUM(te.minutes) AS minutes
       FROM time_entries te JOIN tasks t ON t.id = te.task_id
       WHERE te.work_date >= $1 AND te.work_date <= $2${timeScope}
       GROUP BY te.user_id`,
      timeParams,
    );

    const taskBy = new Map(tasks.rows.map((r) => [r.assignee_id, r]));
    const timeBy = new Map(time.rows.map((r) => [r.user_id, asNumber(r.minutes)]));
    return users.rows
      .map((u) => {
        const t = taskBy.get(u.id);
        return {
          userId: u.id,
          name: u.name,
          username: u.username,
          openTasks: asNumber(t?.open),
          inProgressTasks: asNumber(t?.in_progress),
          overdueTasks: asNumber(t?.overdue),
          pendingEstimatedHours: Math.round(asNumber(t?.hours) * 100) / 100,
          loggedMinutes: timeBy.get(u.id) ?? 0,
        };
      })
      .sort((a, b) => b.pendingEstimatedHours - a.pendingEstimatedHours || a.name.localeCompare(b.name));
  }

  async taskStats(params: { projectIds: number[] | null; today: string; since: string }): Promise<TaskStats> {
    const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
    const empty: TaskStats = { total: 0, open: 0, overdue: 0, completedLast7Days: 0, byStatus };
    if (params.projectIds !== null && params.projectIds.length === 0) return empty;

    const p: unknown[] = [params.today, params.since];
    const scope = params.projectIds === null ? '' : `WHERE project_id IN (${placeholders(params.projectIds, p)})`;
    const { rows } = await this.db.query<{ status: TaskStatus; n: unknown; overdue: unknown; recent: unknown }>(
      `SELECT status,
              COUNT(*) AS n,
              SUM(CASE WHEN due_date < $1 AND status <> 'hecha' THEN 1 ELSE 0 END) AS overdue,
              SUM(CASE WHEN completed_at >= $2 THEN 1 ELSE 0 END) AS recent
       FROM tasks ${scope}
       GROUP BY status`,
      p,
    );
    for (const r of rows) {
      byStatus[r.status] = asNumber(r.n);
      empty.total += asNumber(r.n);
      empty.overdue += asNumber(r.overdue);
      if (r.status === 'hecha') empty.completedLast7Days += asNumber(r.recent);
    }
    empty.open = empty.total - byStatus.hecha;
    return empty;
  }

  async upcomingTasksForUser(userId: number, limit: number): Promise<Task[]> {
    const { rows } = await this.db.query<{ id: number }>(
      `SELECT id FROM tasks
       WHERE assignee_id = $1 AND status <> 'hecha' AND due_date IS NOT NULL
       ORDER BY due_date ASC, id ASC LIMIT ${Math.max(1, Math.min(limit, 50))}`,
      [userId],
    );
    const result: Task[] = [];
    for (const r of rows) {
      const task = await this.tasks.findById(r.id);
      if (task) result.push(task);
    }
    return result;
  }
}
