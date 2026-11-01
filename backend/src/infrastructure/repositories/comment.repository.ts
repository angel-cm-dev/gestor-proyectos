import type {
  CommentRepository,
  NewNotification,
  NotificationRepository,
} from '../../application/ports';
import {
  buildPage,
  type Comment,
  type Notification,
  type NotificationType,
  type Page,
  type PageRequest,
} from '../../domain/types';
import { asNullableTimestamp, asNumber, asTimestamp, placeholders, type Db } from '../db/db';

type CommentRow = {
  id: number;
  task_id: number;
  author_id: number;
  author_name: string;
  author_username: string;
  body: string;
  created_at: unknown;
};

export class PgCommentRepository implements CommentRepository {
  constructor(private readonly db: Db) {}

  async create(data: { taskId: number; authorId: number; body: string; mentionedUserIds: number[] }): Promise<Comment> {
    const { rows } = await this.db.query<{ id: number }>(
      'INSERT INTO comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING id',
      [data.taskId, data.authorId, data.body],
    );
    const id = rows[0].id;
    for (const userId of new Set(data.mentionedUserIds)) {
      await this.db.query('INSERT INTO comment_mentions (comment_id, user_id) VALUES ($1, $2)', [id, userId]);
    }
    const [comment] = await this.load('c.id = $1', [id]);
    return comment;
  }

  async listByTask(taskId: number): Promise<Comment[]> {
    return this.load('c.task_id = $1', [taskId]);
  }

  private async load(where: string, params: unknown[]): Promise<Comment[]> {
    const { rows } = await this.db.query<CommentRow>(
      `SELECT c.id, c.task_id, c.author_id, u.name AS author_name, u.username AS author_username, c.body, c.created_at
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE ${where} ORDER BY c.created_at ASC, c.id ASC`,
      params,
    );
    const comments: Comment[] = rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      authorId: r.author_id,
      authorName: r.author_name,
      authorUsername: r.author_username,
      body: r.body,
      mentions: [],
      createdAt: asTimestamp(r.created_at),
    }));
    if (comments.length === 0) return comments;

    const p: unknown[] = [];
    const mentions = await this.db.query<{ comment_id: number; username: string }>(
      `SELECT cm.comment_id, u.username FROM comment_mentions cm JOIN users u ON u.id = cm.user_id
       WHERE cm.comment_id IN (${placeholders(comments.map((c) => c.id), p)}) ORDER BY u.username`,
      p,
    );
    const byId = new Map(comments.map((c) => [c.id, c]));
    for (const m of mentions.rows) byId.get(m.comment_id)?.mentions.push(m.username);
    return comments;
  }
}

type NotificationRow = {
  id: number;
  user_id: number;
  type: NotificationType;
  message: string;
  task_id: number | null;
  project_id: number | null;
  comment_id: number | null;
  read_at: unknown;
  created_at: unknown;
};

export class PgNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Db) {}

  async createMany(items: NewNotification[]): Promise<void> {
    for (const n of items) {
      await this.db.query(
        `INSERT INTO notifications (user_id, type, message, task_id, project_id, comment_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [n.userId, n.type, n.message, n.taskId, n.projectId, n.commentId],
      );
    }
  }

  async listForUser(userId: number, unreadOnly: boolean, page: PageRequest): Promise<Page<Notification>> {
    const where = unreadOnly ? 'WHERE user_id = $1 AND read_at IS NULL' : 'WHERE user_id = $1';
    const count = await this.db.query<{ n: unknown }>(`SELECT COUNT(*) AS n FROM notifications ${where}`, [userId]);
    const offset = (page.page - 1) * page.pageSize;
    const { rows } = await this.db.query<NotificationRow>(
      `SELECT id, user_id, type, message, task_id, project_id, comment_id, read_at, created_at
       FROM notifications ${where} ORDER BY created_at DESC, id DESC LIMIT ${page.pageSize} OFFSET ${offset}`,
      [userId],
    );
    const items = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      message: r.message,
      taskId: r.task_id,
      projectId: r.project_id,
      commentId: r.comment_id,
      readAt: asNullableTimestamp(r.read_at),
      createdAt: asTimestamp(r.created_at),
    }));
    return buildPage(items, asNumber(count.rows[0]?.n), page);
  }

  async countUnread(userId: number): Promise<number> {
    const { rows } = await this.db.query<{ n: unknown }>(
      'SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return asNumber(rows[0]?.n);
  }

  async markRead(id: number, userId: number): Promise<boolean> {
    const { rows } = await this.db.query('SELECT id FROM notifications WHERE id = $1 AND user_id = $2', [id, userId]);
    if (rows.length === 0) return false;
    await this.db.query('UPDATE notifications SET read_at = now() WHERE id = $1 AND read_at IS NULL', [id]);
    return true;
  }

  async markAllRead(userId: number): Promise<number> {
    const unread = await this.countUnread(userId);
    await this.db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
    return unread;
  }
}
