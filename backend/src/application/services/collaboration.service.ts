import { NotFoundError } from '../../domain/errors';
import { extractMentions } from '../../domain/mentions';
import type { Actor, Comment, Notification, Page, PageRequest } from '../../domain/types';
import type { CommentRepository, NotificationRepository, ProjectRepository, UserRepository } from '../ports';
import type { ProjectAccess } from './access';

export class CommentsService {
  constructor(
    private readonly comments: CommentRepository,
    private readonly users: UserRepository,
    private readonly projects: ProjectRepository,
    private readonly notifications: NotificationRepository,
    private readonly access: ProjectAccess,
  ) {}

  async list(actor: Actor, taskId: number): Promise<Comment[]> {
    await this.access.requireTask(actor, taskId, 'project:view');
    return this.comments.listByTask(taskId);
  }

  /**
   * Crea un comentario y procesa sus menciones:
   * 1. Se extraen los @usuario del texto (dominio).
   * 2. Solo cuentan los usuarios que son miembros del proyecto: mencionar a alguien
   *    ajeno no debe filtrarle información del proyecto.
   * 3. Se registran en comment_mentions y se notifica a cada mencionado (menos al autor).
   */
  async create(actor: Actor, taskId: number, body: string): Promise<Comment & { ignoredMentions: string[] }> {
    const { task } = await this.access.requireTask(actor, taskId, 'task:comment');
    const usernames = extractMentions(body);
    const candidates = await this.users.findByUsernames(usernames);
    const memberIds = new Set((await this.projects.listMembers(task.projectId)).map((m) => m.userId));
    const mentioned = candidates.filter((u) => u.active && memberIds.has(u.id));

    const comment = await this.comments.create({
      taskId,
      authorId: actor.id,
      body,
      mentionedUserIds: mentioned.map((u) => u.id),
    });

    await this.notifications.createMany(
      mentioned
        .filter((u) => u.id !== actor.id)
        .map((u) => ({
          userId: u.id,
          type: 'mencion' as const,
          message: `${actor.name} te mencionó en "${task.title}"`,
          taskId,
          projectId: task.projectId,
          commentId: comment.id,
        })),
    );

    const resolved = new Set(mentioned.map((u) => u.username));
    return { ...comment, ignoredMentions: usernames.filter((u) => !resolved.has(u)) };
  }
}

export class NotificationsService {
  constructor(private readonly notifications: NotificationRepository) {}

  async list(actor: Actor, unreadOnly: boolean, page: PageRequest): Promise<Page<Notification> & { unread: number }> {
    const result = await this.notifications.listForUser(actor.id, unreadOnly, page);
    return { ...result, unread: await this.notifications.countUnread(actor.id) };
  }

  async markRead(actor: Actor, id: number): Promise<void> {
    // Solo el destinatario puede marcarla: para otros usuarios "no existe".
    if (!(await this.notifications.markRead(id, actor.id))) throw new NotFoundError('Notificación', id);
  }

  async markAllRead(actor: Actor): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(actor.id) };
  }
}
