import type { NewTask, TaskFilter, TaskPatch, TaskRepository } from '../../application/ports';
import type { DependencyInfo } from '../../domain/dependencies';
import type { ProgressNode } from '../../domain/progress';
import {
  buildPage,
  type DependencyEdge,
  type Label,
  type Page,
  type Priority,
  type Task,
  type TaskStatus,
} from '../../domain/types';
import { asDate, asNullableTimestamp, asNumber, asTimestamp, placeholders, type Db } from '../db/db';

type Row = {
  id: number;
  project_id: number;
  parent_id: number | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee_id: number | null;
  assignee_name: string | null;
  estimated_hours: unknown;
  start_date: unknown;
  due_date: unknown;
  position: number;
  created_by: number;
  completed_at: unknown;
  created_at: unknown;
  updated_at: unknown;
  subtask_count: unknown;
  subtask_done: unknown;
};

// Se usa una tabla derivada (y no una subconsulta correlacionada) para contar
// subtareas: es eficiente en PostgreSQL y compatible con pg-mem.
const SELECT = `
  SELECT t.id, t.project_id, t.parent_id, t.title, t.description, t.status, t.priority,
         t.assignee_id, u.name AS assignee_name, t.estimated_hours, t.start_date, t.due_date,
         t.position, t.created_by, t.completed_at, t.created_at, t.updated_at,
         s.subtask_count, s.subtask_done
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assignee_id
  LEFT JOIN (
    SELECT parent_id, COUNT(*) AS subtask_count,
           SUM(CASE WHEN status = 'hecha' THEN 1 ELSE 0 END) AS subtask_done
    FROM tasks WHERE parent_id IS NOT NULL GROUP BY parent_id
  ) s ON s.parent_id = t.id`;

const SORT_COLUMNS: Record<TaskFilter['sort'], string> = {
  position: 't.position',
  dueDate: 't.due_date',
  priority: 'priority_rank',
  createdAt: 't.created_at',
  title: 't.title',
};

const PATCH_COLUMNS: Record<keyof TaskPatch, string> = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  assigneeId: 'assignee_id',
  estimatedHours: 'estimated_hours',
  startDate: 'start_date',
  dueDate: 'due_date',
  position: 'position',
  completedAt: 'completed_at',
};

function toTask(r: Row): Task {
  return {
    id: r.id,
    projectId: r.project_id,
    parentId: r.parent_id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_name,
    estimatedHours: asNumber(r.estimated_hours),
    startDate: asDate(r.start_date),
    dueDate: asDate(r.due_date),
    position: r.position,
    createdBy: r.created_by,
    completedAt: asNullableTimestamp(r.completed_at),
    createdAt: asTimestamp(r.created_at),
    updatedAt: asTimestamp(r.updated_at),
    labels: [],
    dependsOn: [],
    subtaskCount: asNumber(r.subtask_count),
    subtaskDoneCount: asNumber(r.subtask_done),
  };
}

export class PgTaskRepository implements TaskRepository {
  constructor(private readonly db: Db) {}

  /** Completa etiquetas y dependencias en 2 consultas (evita el problema N+1). */
  private async hydrate(tasks: Task[]): Promise<Task[]> {
    if (tasks.length === 0) return tasks;
    const ids = tasks.map((t) => t.id);
    const byId = new Map(tasks.map((t) => [t.id, t]));

    const p1: unknown[] = [];
    const labels = await this.db.query<{ task_id: number; id: number; project_id: number; name: string; color: string }>(
      `SELECT tl.task_id, l.id, l.project_id, l.name, l.color
       FROM task_labels tl JOIN labels l ON l.id = tl.label_id
       WHERE tl.task_id IN (${placeholders(ids, p1)}) ORDER BY l.name`,
      p1,
    );
    for (const r of labels.rows) {
      const label: Label = { id: r.id, projectId: r.project_id, name: r.name, color: r.color };
      byId.get(r.task_id)?.labels.push(label);
    }

    const p2: unknown[] = [];
    const deps = await this.db.query<{ task_id: number; depends_on_id: number }>(
      `SELECT task_id, depends_on_id FROM task_dependencies WHERE task_id IN (${placeholders(ids, p2)})`,
      p2,
    );
    for (const r of deps.rows) byId.get(r.task_id)?.dependsOn.push(r.depends_on_id);
    return tasks;
  }

  async list(filter: TaskFilter): Promise<Page<Task>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    add('t.project_id = ?', filter.projectId);
    if (filter.status) add('t.status = ?', filter.status);
    if (filter.priority) add('t.priority = ?', filter.priority);
    if (filter.assigneeId !== undefined) add('t.assignee_id = ?', filter.assigneeId);
    if (filter.labelId !== undefined) add('t.id IN (SELECT task_id FROM task_labels WHERE label_id = ?)', filter.labelId);
    if (filter.parentId === null) where.push('t.parent_id IS NULL');
    else if (filter.parentId !== undefined) add('t.parent_id = ?', filter.parentId);
    if (filter.overdue) {
      add('t.due_date < ?', filter.today);
      where.push(`t.status <> 'hecha'`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      where.push(`(LOWER(t.title) LIKE $${params.length} OR LOWER(t.description) LIKE $${params.length})`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const count = await this.db.query<{ n: unknown }>(`SELECT COUNT(*) AS n FROM tasks t ${whereSql}`, params);

    const direction = filter.order === 'desc' ? 'DESC' : 'ASC';
    const offset = (filter.page - 1) * filter.pageSize;
    const sql = `
      SELECT * FROM (
        SELECT q.*, CASE q.priority WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END AS priority_rank
        FROM (${SELECT} ${whereSql}) q
      ) t
      ORDER BY ${SORT_COLUMNS[filter.sort].replace('t.', '')} ${direction}, id ASC
      LIMIT ${filter.pageSize} OFFSET ${offset}`;
    const { rows } = await this.db.query<Row>(sql, params);
    return buildPage(await this.hydrate(rows.map(toTask)), asNumber(count.rows[0]?.n), filter);
  }

  async listByProject(projectId: number): Promise<Task[]> {
    const { rows } = await this.db.query<Row>(`${SELECT} WHERE t.project_id = $1 ORDER BY t.position ASC, t.id ASC`, [projectId]);
    return this.hydrate(rows.map(toTask));
  }

  async findById(id: number): Promise<Task | null> {
    const { rows } = await this.db.query<Row>(`${SELECT} WHERE t.id = $1`, [id]);
    if (!rows[0]) return null;
    const [task] = await this.hydrate([toTask(rows[0])]);
    return task;
  }

  async listSubtasks(parentId: number): Promise<Task[]> {
    const { rows } = await this.db.query<Row>(`${SELECT} WHERE t.parent_id = $1 ORDER BY t.position ASC, t.id ASC`, [parentId]);
    return this.hydrate(rows.map(toTask));
  }

  async create(data: NewTask): Promise<Task> {
    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO tasks (project_id, parent_id, title, description, status, priority, assignee_id,
                          estimated_hours, start_date, due_date, position, created_by, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        data.projectId,
        data.parentId,
        data.title,
        data.description,
        data.status,
        data.priority,
        data.assigneeId,
        data.estimatedHours,
        data.startDate,
        data.dueDate,
        data.position,
        data.createdBy,
        data.status === 'hecha' ? new Date().toISOString() : null,
      ],
    );
    return (await this.findById(rows[0].id)) as Task;
  }

  async update(id: number, patch: TaskPatch): Promise<Task> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as Array<keyof TaskPatch>) {
      if (patch[key] !== undefined) {
        params.push(patch[key]);
        sets.push(`${PATCH_COLUMNS[key]} = $${params.length}`);
      }
    }
    if (sets.length > 0) {
      params.push(id);
      await this.db.query(`UPDATE tasks SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    }
    return (await this.findById(id)) as Task;
  }

  async delete(id: number): Promise<void> {
    await this.db.query('DELETE FROM tasks WHERE id = $1', [id]);
  }

  async setLabels(taskId: number, labelIds: number[]): Promise<void> {
    await this.db.query('DELETE FROM task_labels WHERE task_id = $1', [taskId]);
    for (const labelId of new Set(labelIds)) {
      await this.db.query('INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)', [taskId, labelId]);
    }
  }

  async nextPosition(projectId: number, status: TaskStatus): Promise<number> {
    const { rows } = await this.db.query<{ m: unknown }>(
      'SELECT MAX(position) AS m FROM tasks WHERE project_id = $1 AND status = $2 AND parent_id IS NULL',
      [projectId, status],
    );
    const max = rows[0]?.m;
    return max === null || max === undefined ? 0 : asNumber(max) + 1;
  }

  async listColumn(projectId: number, status: TaskStatus): Promise<Array<{ id: number; position: number }>> {
    const { rows } = await this.db.query<{ id: number; position: number }>(
      `SELECT id, position FROM tasks
       WHERE project_id = $1 AND status = $2 AND parent_id IS NULL
       ORDER BY position ASC, id ASC`,
      [projectId, status],
    );
    return rows;
  }

  async setPositions(updates: Array<{ id: number; position: number }>): Promise<void> {
    for (const u of updates) {
      await this.db.query('UPDATE tasks SET position = $1 WHERE id = $2', [u.position, u.id]);
    }
  }

  async dependencyEdges(projectId: number): Promise<DependencyEdge[]> {
    const { rows } = await this.db.query<{ task_id: number; depends_on_id: number }>(
      `SELECT d.task_id, d.depends_on_id FROM task_dependencies d
       JOIN tasks t ON t.id = d.task_id WHERE t.project_id = $1`,
      [projectId],
    );
    return rows.map((r) => ({ taskId: r.task_id, dependsOnId: r.depends_on_id }));
  }

  async dependenciesOf(taskId: number): Promise<DependencyInfo[]> {
    const { rows } = await this.db.query<DependencyInfo>(
      `SELECT t.id, t.title, t.status FROM task_dependencies d
       JOIN tasks t ON t.id = d.depends_on_id WHERE d.task_id = $1 ORDER BY t.id`,
      [taskId],
    );
    return rows.map((r) => ({ id: r.id, title: r.title, status: r.status }));
  }

  async dependentsOf(taskId: number): Promise<DependencyInfo[]> {
    const { rows } = await this.db.query<DependencyInfo>(
      `SELECT t.id, t.title, t.status FROM task_dependencies d
       JOIN tasks t ON t.id = d.task_id WHERE d.depends_on_id = $1 ORDER BY t.id`,
      [taskId],
    );
    return rows.map((r) => ({ id: r.id, title: r.title, status: r.status }));
  }

  async addDependency(taskId: number, dependsOnId: number): Promise<void> {
    await this.db.query('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES ($1, $2)', [taskId, dependsOnId]);
  }

  async removeDependency(taskId: number, dependsOnId: number): Promise<boolean> {
    const { rows } = await this.db.query(
      'SELECT task_id FROM task_dependencies WHERE task_id = $1 AND depends_on_id = $2',
      [taskId, dependsOnId],
    );
    if (rows.length === 0) return false;
    await this.db.query('DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_id = $2', [taskId, dependsOnId]);
    return true;
  }

  async progressNodes(projectIds: number[]): Promise<Array<ProgressNode & { projectId: number }>> {
    if (projectIds.length === 0) return [];
    const params: unknown[] = [];
    const { rows } = await this.db.query<{
      id: number;
      project_id: number;
      parent_id: number | null;
      status: TaskStatus;
      estimated_hours: unknown;
    }>(
      `SELECT id, project_id, parent_id, status, estimated_hours FROM tasks WHERE project_id IN (${placeholders(projectIds, params)})`,
      params,
    );
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      parentId: r.parent_id,
      status: r.status,
      estimatedHours: asNumber(r.estimated_hours),
    }));
  }
}
