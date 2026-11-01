import { toCsv } from '../../domain/csv';
import { addDays, startOfMonth, startOfWeek } from '../../domain/dates';
import { ForbiddenError } from '../../domain/errors';
import { canViewWorkload } from '../../domain/permissions';
import type { Actor, ProjectSummary, Task, TimeEntry } from '../../domain/types';
import { DEFAULT_WEEKLY_CAPACITY_HOURS, workloadLevel, workloadRatio, type WorkloadLevel } from '../../domain/workload';
import type { Clock, ProjectRepository, ReportRepository, TaskStats, TimeEntryRepository, WorkloadRow } from '../ports';
import type { ProjectAccess } from './access';
import type { ProjectsService } from './projects.service';

export interface HoursReport {
  projectId: number;
  projectName: string;
  from: string;
  to: string;
  totalMinutes: number;
  totalHours: number;
  byUser: Array<{ userId: number; name: string; minutes: number; hours: number }>;
  byTask: Array<{ taskId: number; title: string; minutes: number; hours: number }>;
  entries: TimeEntry[];
}

export interface Dashboard {
  activeProjects: number;
  tasks: TaskStats;
  my: { openTasks: number; overdueTasks: number; minutesThisWeek: number; upcoming: Task[] };
  projects: ProjectSummary[];
}

const toHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

export class ReportsService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly entries: TimeEntryRepository,
    private readonly projects: ProjectRepository,
    private readonly projectsService: ProjectsService,
    private readonly access: ProjectAccess,
    private readonly clock: Clock,
  ) {}

  /** Rango por defecto: mes en curso hasta hoy. */
  private range(from?: string, to?: string): { from: string; to: string } {
    const today = this.clock.today();
    return { from: from ?? startOfMonth(today), to: to ?? today };
  }

  async projectHours(actor: Actor, projectId: number, fromQ?: string, toQ?: string): Promise<HoursReport> {
    const { project } = await this.access.requireProject(actor, projectId, 'report:view');
    const { from, to } = this.range(fromQ, toQ);
    const entries = await this.entries.listAll({ projectId, from, to });

    const byUser = new Map<number, { userId: number; name: string; minutes: number }>();
    const byTask = new Map<number, { taskId: number; title: string; minutes: number }>();
    for (const e of entries) {
      const u = byUser.get(e.userId) ?? { userId: e.userId, name: e.userName, minutes: 0 };
      u.minutes += e.minutes;
      byUser.set(e.userId, u);
      const t = byTask.get(e.taskId) ?? { taskId: e.taskId, title: e.taskTitle, minutes: 0 };
      t.minutes += e.minutes;
      byTask.set(e.taskId, t);
    }
    const totalMinutes = entries.reduce((acc, e) => acc + e.minutes, 0);
    const withHours = <T extends { minutes: number }>(x: T) => ({ ...x, hours: toHours(x.minutes) });
    return {
      projectId,
      projectName: project.name,
      from,
      to,
      totalMinutes,
      totalHours: toHours(totalMinutes),
      byUser: [...byUser.values()].sort((a, b) => b.minutes - a.minutes).map(withHours),
      byTask: [...byTask.values()].sort((a, b) => b.minutes - a.minutes).map(withHours),
      entries,
    };
  }

  async projectHoursCsv(actor: Actor, projectId: number, from?: string, to?: string): Promise<{ filename: string; csv: string }> {
    const report = await this.projectHours(actor, projectId, from, to);
    const csv = toCsv<TimeEntry>(
      [
        { header: 'Fecha', value: (e) => e.workDate },
        { header: 'Usuario', value: (e) => e.userName },
        { header: 'Tarea', value: (e) => e.taskTitle },
        { header: 'Minutos', value: (e) => e.minutes },
        { header: 'Horas', value: (e) => toHours(e.minutes) },
        { header: 'Nota', value: (e) => e.note },
      ],
      report.entries,
    );
    return { filename: `horas-proyecto-${projectId}-${report.from}_${report.to}.csv`, csv };
  }

  /**
   * Carga de trabajo por persona. Admin ve a todo el equipo; un líder solo los
   * proyectos donde es gestor (no debe ver la carga de equipos ajenos).
   */
  async workload(
    actor: Actor,
    fromQ?: string,
    toQ?: string,
  ): Promise<{ from: string; to: string; capacityHours: number; rows: Array<WorkloadRow & { loadPercent: number; level: WorkloadLevel }> }> {
    if (!canViewWorkload(actor.role)) throw new ForbiddenError('Solo administradores y líderes pueden ver la carga del equipo');
    const today = this.clock.today();
    const from = fromQ ?? startOfWeek(today);
    const to = toQ ?? addDays(startOfWeek(today), 6);
    const projectIds = actor.role === 'admin' ? null : await this.projects.projectIdsForUser(actor.id, ['gestor']);
    const rows = await this.reports.workload({ projectIds, from, to, today });
    return {
      from,
      to,
      capacityHours: DEFAULT_WEEKLY_CAPACITY_HOURS,
      rows: rows.map((r) => ({
        ...r,
        loadPercent: workloadRatio(r.pendingEstimatedHours),
        level: workloadLevel(r.pendingEstimatedHours),
      })),
    };
  }

  async dashboard(actor: Actor): Promise<Dashboard> {
    const today = this.clock.today();
    const projectIds = actor.role === 'admin' ? null : await this.projects.projectIdsForUser(actor.id);
    const since = new Date(this.clock.now().getTime() - 7 * 24 * 3600 * 1000).toISOString();
    const tasks = await this.reports.taskStats({ projectIds, today, since });

    const weekStart = startOfWeek(today);
    const mine = (await this.reports.workload({ projectIds: null, from: weekStart, to: today, today })).find(
      (r) => r.userId === actor.id,
    );
    const upcoming = await this.reports.upcomingTasksForUser(actor.id, 5);

    const active = await this.projects.list({
      memberId: actor.role === 'admin' ? undefined : actor.id,
      status: 'activo',
      page: 1,
      pageSize: 6,
      sort: 'endDate',
      order: 'asc',
    });

    return {
      activeProjects: active.total,
      tasks,
      my: {
        openTasks: mine?.openTasks ?? 0,
        overdueTasks: mine?.overdueTasks ?? 0,
        minutesThisWeek: mine?.loggedMinutes ?? 0,
        upcoming,
      },
      projects: await this.projectsService.summarize(actor, active.items),
    };
  }
}
