import type {
  NewProject,
  ProjectFilter,
  ProjectPatch,
  ProjectRepository,
  ProjectRow,
} from '../../application/ports';
import {
  buildPage,
  type Label,
  type Page,
  type Project,
  type ProjectMember,
  type ProjectRole,
  type ProjectStatus,
} from '../../domain/types';
import { asDate, asNumber, asTimestamp, placeholders, type Db } from '../db/db';

type Row = {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  start_date: unknown;
  end_date: unknown;
  owner_id: number;
  owner_name: string | null;
  created_at: unknown;
  updated_at: unknown;
  member_count?: unknown;
};

const SELECT = `
  SELECT p.id, p.name, p.description, p.status, p.start_date, p.end_date, p.owner_id,
         o.name AS owner_name, p.created_at, p.updated_at, mc.member_count
  FROM projects p
  LEFT JOIN users o ON o.id = p.owner_id
  LEFT JOIN (SELECT project_id, COUNT(*) AS member_count FROM project_members GROUP BY project_id) mc
         ON mc.project_id = p.id`;

/** Lista blanca de columnas ordenables: nunca se interpola texto del usuario en ORDER BY. */
const SORT_COLUMNS: Record<ProjectFilter['sort'], string> = {
  name: 'p.name',
  createdAt: 'p.created_at',
  endDate: 'p.end_date',
  status: 'p.status',
};

function toProject(r: Row): ProjectRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    startDate: asDate(r.start_date),
    endDate: asDate(r.end_date),
    ownerId: r.owner_id,
    ownerName: r.owner_name ?? '',
    createdAt: asTimestamp(r.created_at),
    updatedAt: asTimestamp(r.updated_at),
    memberCount: asNumber(r.member_count),
  };
}

export class PgProjectRepository implements ProjectRepository {
  constructor(private readonly db: Db) {}

  async list(filter: ProjectFilter): Promise<Page<ProjectRow>> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.memberId !== undefined) {
      params.push(filter.memberId);
      where.push(`p.id IN (SELECT project_id FROM project_members WHERE user_id = $${params.length})`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      where.push(`(LOWER(p.name) LIKE $${params.length} OR LOWER(p.description) LIKE $${params.length})`);
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`p.status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await this.db.query<{ n: unknown }>(`SELECT COUNT(*) AS n FROM projects p ${whereSql}`, params);
    const order = `${SORT_COLUMNS[filter.sort]} ${filter.order === 'desc' ? 'DESC' : 'ASC'}, p.id ASC`;
    const offset = (filter.page - 1) * filter.pageSize;
    const { rows } = await this.db.query<Row>(
      `${SELECT} ${whereSql} ORDER BY ${order} LIMIT ${filter.pageSize} OFFSET ${offset}`,
      params,
    );
    return buildPage(rows.map(toProject), asNumber(count.rows[0]?.n), filter);
  }

  async findById(id: number): Promise<Project | null> {
    const { rows } = await this.db.query<Row>(`${SELECT} WHERE p.id = $1`, [id]);
    return rows[0] ? toProject(rows[0]) : null;
  }

  async create(data: NewProject): Promise<Project> {
    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO projects (name, description, status, start_date, end_date, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [data.name, data.description, data.status, data.startDate, data.endDate, data.ownerId],
    );
    return (await this.findById(rows[0].id)) as Project;
  }

  async update(id: number, patch: ProjectPatch): Promise<Project | null> {
    const map: Record<keyof ProjectPatch, string> = {
      name: 'name',
      description: 'description',
      status: 'status',
      startDate: 'start_date',
      endDate: 'end_date',
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const key of Object.keys(map) as Array<keyof ProjectPatch>) {
      if (patch[key] !== undefined) {
        params.push(patch[key]);
        sets.push(`${map[key]} = $${params.length}`);
      }
    }
    if (sets.length > 0) {
      params.push(id);
      await this.db.query(`UPDATE projects SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    }
    return this.findById(id);
  }

  async delete(id: number): Promise<void> {
    await this.db.query('DELETE FROM projects WHERE id = $1', [id]);
  }

  async getMemberRole(projectId: number, userId: number): Promise<ProjectRole | null> {
    const { rows } = await this.db.query<{ role: ProjectRole }>(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId],
    );
    return rows[0]?.role ?? null;
  }

  async memberRoles(userId: number, projectIds: number[]): Promise<Map<number, ProjectRole>> {
    const result = new Map<number, ProjectRole>();
    if (projectIds.length === 0) return result;
    const params: unknown[] = [userId];
    const inList = placeholders(projectIds, params);
    const { rows } = await this.db.query<{ project_id: number; role: ProjectRole }>(
      `SELECT project_id, role FROM project_members WHERE user_id = $1 AND project_id IN (${inList})`,
      params,
    );
    for (const r of rows) result.set(r.project_id, r.role);
    return result;
  }

  async listMembers(projectId: number): Promise<ProjectMember[]> {
    const { rows } = await this.db.query<{
      project_id: number;
      user_id: number;
      role: ProjectRole;
      name: string;
      email: string;
      username: string;
      joined_at: unknown;
    }>(
      `SELECT pm.project_id, pm.user_id, pm.role, u.name, u.email, u.username, pm.joined_at
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1 ORDER BY u.name ASC`,
      [projectId],
    );
    return rows.map((r) => ({
      projectId: r.project_id,
      userId: r.user_id,
      role: r.role,
      name: r.name,
      email: r.email,
      username: r.username,
      joinedAt: asTimestamp(r.joined_at),
    }));
  }

  async upsertMember(projectId: number, userId: number, role: ProjectRole): Promise<void> {
    const existing = await this.getMemberRole(projectId, userId);
    if (existing) {
      await this.db.query('UPDATE project_members SET role = $3 WHERE project_id = $1 AND user_id = $2', [projectId, userId, role]);
    } else {
      await this.db.query('INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)', [projectId, userId, role]);
    }
  }

  async removeMember(projectId: number, userId: number): Promise<boolean> {
    const existing = await this.getMemberRole(projectId, userId);
    if (!existing) return false;
    await this.db.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    return true;
  }

  async projectIdsForUser(userId: number, roles?: ProjectRole[]): Promise<number[]> {
    const params: unknown[] = [userId];
    let roleSql = '';
    if (roles && roles.length > 0) roleSql = ` AND role IN (${placeholders(roles, params)})`;
    const { rows } = await this.db.query<{ project_id: number }>(
      `SELECT project_id FROM project_members WHERE user_id = $1${roleSql}`,
      params,
    );
    return rows.map((r) => r.project_id);
  }

  async listLabels(projectId: number): Promise<Label[]> {
    const { rows } = await this.db.query<{ id: number; project_id: number; name: string; color: string }>(
      'SELECT id, project_id, name, color FROM labels WHERE project_id = $1 ORDER BY name ASC',
      [projectId],
    );
    return rows.map((r) => ({ id: r.id, projectId: r.project_id, name: r.name, color: r.color }));
  }

  async createLabel(projectId: number, name: string, color: string): Promise<Label> {
    const { rows } = await this.db.query<{ id: number; project_id: number; name: string; color: string }>(
      'INSERT INTO labels (project_id, name, color) VALUES ($1, $2, $3) RETURNING id, project_id, name, color',
      [projectId, name, color],
    );
    const r = rows[0];
    return { id: r.id, projectId: r.project_id, name: r.name, color: r.color };
  }

  async deleteLabel(projectId: number, labelId: number): Promise<boolean> {
    const { rows } = await this.db.query<{ id: number }>('SELECT id FROM labels WHERE id = $1 AND project_id = $2', [labelId, projectId]);
    if (rows.length === 0) return false;
    await this.db.query('DELETE FROM labels WHERE id = $1', [labelId]);
    return true;
  }
}
