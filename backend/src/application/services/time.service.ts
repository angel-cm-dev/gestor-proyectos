import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../domain/errors';
import { can } from '../../domain/permissions';
import type { Actor, Page, TimeEntry } from '../../domain/types';
import type { TimeEntryDto, TimeListQuery } from '../dtos';
import type { Clock, ProjectRepository, TimeEntryRepository } from '../ports';
import type { ProjectAccess } from './access';

/** Máximo de minutos que una persona puede registrar en un día. */
export const DAILY_LIMIT_MINUTES = 24 * 60;

export class TimeService {
  constructor(
    private readonly entries: TimeEntryRepository,
    private readonly projects: ProjectRepository,
    private readonly access: ProjectAccess,
    private readonly clock: Clock,
  ) {}

  /**
   * Registrar horas (timesheet). Reglas:
   * - Solo sobre tareas de proyectos donde el usuario puede registrar horas.
   * - No se registran horas a futuro (el timesheet refleja trabajo realizado).
   * - La suma diaria de una persona no puede superar 24 h.
   */
  async log(actor: Actor, taskId: number, dto: TimeEntryDto): Promise<TimeEntry> {
    await this.access.requireTask(actor, taskId, 'time:log');
    if (dto.workDate > this.clock.today()) {
      throw new BusinessRuleError('No se pueden registrar horas en fechas futuras', 'future_date');
    }
    const already = await this.entries.sumMinutesForUserOnDate(actor.id, dto.workDate);
    if (already + dto.minutes > DAILY_LIMIT_MINUTES) {
      throw new BusinessRuleError(
        `Superarías 24 h en ${dto.workDate} (ya registraste ${(already / 60).toFixed(2)} h)`,
        'daily_limit',
      );
    }
    return this.entries.create({ taskId, userId: actor.id, workDate: dto.workDate, minutes: dto.minutes, note: dto.note });
  }

  async listForTask(actor: Actor, taskId: number): Promise<{ items: TimeEntry[]; totalMinutes: number }> {
    await this.access.requireTask(actor, taskId, 'project:view');
    const items = await this.entries.listAll({ taskId });
    return { items, totalMinutes: items.reduce((acc, e) => acc + e.minutes, 0) };
  }

  /**
   * Timesheet personal. Un admin puede consultar el de cualquier usuario (userId);
   * el resto siempre ve solo el propio, aunque envíe otro userId.
   */
  async timesheet(actor: Actor, q: TimeListQuery): Promise<Page<TimeEntry> & { totalMinutes: number }> {
    const userId = actor.role === 'admin' && q.userId ? q.userId : actor.id;
    return this.entries.list({ userId, projectId: q.projectId, from: q.from, to: q.to }, { page: q.page, pageSize: q.pageSize });
  }

  /** Borrar un registro: su autor, o quien gestiona el proyecto (time:manage). */
  async delete(actor: Actor, entryId: number): Promise<void> {
    const entry = await this.entries.findById(entryId);
    if (!entry) throw new NotFoundError('Registro de horas', entryId);
    if (entry.userId !== actor.id) {
      const role = await this.projects.getMemberRole(entry.projectId, actor.id);
      if (!can(actor.role, role, 'time:manage')) throw new ForbiddenError('Solo puedes eliminar tus propios registros');
    }
    await this.entries.delete(entryId);
  }
}
