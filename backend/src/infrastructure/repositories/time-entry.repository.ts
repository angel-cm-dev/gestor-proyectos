import type { NewTimeEntry, TimeEntryRepository, TimeFilter } from '../../application/ports';
import { buildPage, type Page, type PageRequest, type TimeEntry } from '../../domain/types';
import { asDate, asNumber, asTimestamp, placeholders, type Db } from '../db/db';

type Row = {
  id: number;
  task_id: number;
  task_title: string;
  project_id: number;
  project_name: string;
  user_id: number;
  user_name: string;
  work_date: unknown;
  minutes: unknown;
  note: string;
  created_at: unknown;
};

const SELECT = `
  SELECT te.id, te.task_id, t.title AS task_title, t.project_id, p.name AS project_name,
         te.user_id, u.name AS user_name, te.work_date, te.minutes, te.note, te.created_at
  FROM time_entries te
  JOIN tasks t ON t.id = te.task_id
  JOIN projects p ON p.id = t.project_id
  JOIN users u ON u.id = te.user_id`;

function toEntry(r: Row): TimeEntry {
  return {
    id: r.id,
    taskId: r.task_id,
    taskTitle: r.task_title,
    projectId: r.project_id,
    projectName: r.project_name,
    userId: r.user_id,
    userName: r.user_name,
    workDate: asDate(r.work_date) as string,
    minutes: asNumber(r.minutes),
    note: r.note,
    createdAt: asTimestamp(r.created_at),
  };
}

function buildWhere(filter: TimeFilter): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (filter.userId !== undefined) add('te.user_id = ?', filter.userId);
  if (filter.projectId !== undefined) add('t.project_id = ?', filter.projectId);
  if (filter.taskId !== undefined) add('te.task_id = ?', filter.taskId);
  if (filter.from) add('te.work_date >= ?', filter.from);
  if (filter.to) add('te.work_date <= ?', filter.to);
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export class PgTimeEntryRepository implements TimeEntryRepository {
  constructor(private readonly db: Db) {}

  async create(data: NewTimeEntry): Promise<TimeEntry> {
    const { rows } = await this.db.query<{ id: number }>(
      'INSERT INTO time_entries (task_id, user_id, work_date, minutes, note) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [data.taskId, data.userId, data.workDate, data.minutes, data.note],
    );
    return (await this.findById(rows[0].id)) as TimeEntry;
  }

  async findById(id: number): Promise<TimeEntry | null> {
    const { rows } = await this.db.query<Row>(`${SELECT} WHERE te.id = $1`, [id]);
    return rows[0] ? toEntry(rows[0]) : null;
  }

  async delete(id: number): Promise<void> {
    await this.db.query('DELETE FROM time_entries WHERE id = $1', [id]);
  }

  async list(filter: TimeFilter, page: PageRequest): Promise<Page<TimeEntry> & { totalMinutes: number }> {
    const { sql, params } = buildWhere(filter);
    const totals = await this.db.query<{ n: unknown; total: unknown }>(
      `SELECT COUNT(*) AS n, SUM(te.minutes) AS total FROM time_entries te JOIN tasks t ON t.id = te.task_id ${sql}`,
      params,
    );
    const offset = (page.page - 1) * page.pageSize;
    const { rows } = await this.db.query<Row>(
      `${SELECT} ${sql} ORDER BY te.work_date DESC, te.id DESC LIMIT ${page.pageSize} OFFSET ${offset}`,
      params,
    );
    return {
      ...buildPage(rows.map(toEntry), asNumber(totals.rows[0]?.n), page),
      totalMinutes: asNumber(totals.rows[0]?.total),
    };
  }

  async listAll(filter: TimeFilter): Promise<TimeEntry[]> {
    const { sql, params } = buildWhere(filter);
    const { rows } = await this.db.query<Row>(`${SELECT} ${sql} ORDER BY te.work_date ASC, u.name ASC, te.id ASC`, params);
    return rows.map(toEntry);
  }

  async sumMinutesForUserOnDate(userId: number, date: string): Promise<number> {
    const { rows } = await this.db.query<{ total: unknown }>(
      'SELECT SUM(minutes) AS total FROM time_entries WHERE user_id = $1 AND work_date = $2',
      [userId, date],
    );
    return asNumber(rows[0]?.total);
  }

  async sumMinutesByTask(taskIds: number[]): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (taskIds.length === 0) return result;
    const params: unknown[] = [];
    const { rows } = await this.db.query<{ task_id: number; total: unknown }>(
      `SELECT task_id, SUM(minutes) AS total FROM time_entries WHERE task_id IN (${placeholders(taskIds, params)}) GROUP BY task_id`,
      params,
    );
    for (const r of rows) result.set(r.task_id, asNumber(r.total));
    return result;
  }
}
