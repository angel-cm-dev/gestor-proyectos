import type { NewUser, UserFilter, UserPatch, UserRepository } from '../../application/ports';
import { buildPage, type GlobalRole, type Page, type User, type UserWithPassword } from '../../domain/types';
import { asNumber, asTimestamp, placeholders, type Db } from '../db/db';

type UserRow = {
  id: number;
  name: string;
  email: string;
  username: string;
  password_hash: string;
  role: GlobalRole;
  active: boolean;
  created_at: Date | string;
};

const COLUMNS = 'id, name, email, username, password_hash, role, active, created_at';

function toUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    username: r.username,
    role: r.role,
    active: r.active,
    createdAt: asTimestamp(r.created_at),
  };
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async findByEmail(email: string): Promise<UserWithPassword | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email.toLowerCase()]);
    return rows[0] ? { ...toUser(rows[0]), passwordHash: rows[0].password_hash } : null;
  }

  async findById(id: number): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findByUsernames(usernames: string[]): Promise<User[]> {
    if (usernames.length === 0) return [];
    const params: unknown[] = [];
    const inList = placeholders(usernames, params);
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE username IN (${inList})`, params);
    return rows.map(toUser);
  }

  async findTaken(email: string, username: string): Promise<{ email: boolean; username: boolean }> {
    const { rows } = await this.db.query<{ email: string; username: string }>(
      'SELECT email, username FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username.toLowerCase()],
    );
    return {
      email: rows.some((r) => r.email === email.toLowerCase()),
      username: rows.some((r) => r.username === username.toLowerCase()),
    };
  }

  async list(filter: UserFilter): Promise<Page<User>> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR username LIKE $${params.length})`);
    }
    if (filter.role) {
      params.push(filter.role);
      where.push(`role = $${params.length}`);
    }
    if (filter.active !== undefined) {
      params.push(filter.active);
      where.push(`active = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await this.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM users ${whereSql}`, params);
    const offset = (filter.page - 1) * filter.pageSize;
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${COLUMNS} FROM users ${whereSql} ORDER BY name ASC LIMIT ${filter.pageSize} OFFSET ${offset}`,
      params,
    );
    return buildPage(rows.map(toUser), asNumber(count.rows[0]?.n), filter);
  }

  async create(data: NewUser): Promise<User> {
    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO users (name, email, username, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [data.name, data.email.toLowerCase(), data.username.toLowerCase(), data.passwordHash, data.role],
    );
    return toUser(rows[0]);
  }

  async update(id: number, patch: UserPatch): Promise<User | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const map: Record<keyof UserPatch, string> = { name: 'name', role: 'role', active: 'active', passwordHash: 'password_hash' };
    for (const key of Object.keys(map) as Array<keyof UserPatch>) {
      if (patch[key] !== undefined) {
        params.push(patch[key]);
        sets.push(`${map[key]} = $${params.length}`);
      }
    }
    if (sets.length === 0) return this.findById(id);
    params.push(id);
    const { rows } = await this.db.query<UserRow>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    return rows[0] ? toUser(rows[0]) : null;
  }
}
