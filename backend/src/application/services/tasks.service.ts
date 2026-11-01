import { blockingDependencies, wouldCreateCycle, type DependencyInfo } from '../../domain/dependencies';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../domain/errors';
import { computeProgress } from '../../domain/progress';
import { TASK_STATUSES, type Actor, type Page, type Task, type TaskStatus } from '../../domain/types';
import type { CreateTaskDto, ListTasksQuery, MoveTaskDto, UpdateTaskDto } from '../dtos';
import type {
  Clock,
  NotificationRepository,
  ProjectRepository,
  TaskPatch,
  TaskRepository,
  TimeEntryRepository,
} from '../ports';
import type { ProjectAccess } from './access';

export interface BoardTask extends Task {
  progress: number;
  blocked: boolean;
}
export interface BoardColumn {
  status: TaskStatus;
  tasks: BoardTask[];
}
export interface TaskDetail extends Task {
  progress: number;
  blocked: boolean;
  loggedMinutes: number;
  subtasks: Array<Task & { progress: number }>;
  dependencies: DependencyInfo[];
  dependents: DependencyInfo[];
}

export class TasksService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly projects: ProjectRepository,
    private readonly time: TimeEntryRepository,
    private readonly notifications: NotificationRepository,
    private readonly access: ProjectAccess,
    private readonly clock: Clock,
  ) {}

  async list(actor: Actor, projectId: number, q: ListTasksQuery): Promise<Page<Task>> {
    await this.access.requireProject(actor, projectId, 'project:view');
    return this.tasks.list({
      projectId,
      page: q.page,
      pageSize: q.pageSize,
      status: q.status,
      priority: q.priority,
      assigneeId: q.assigneeId,
      labelId: q.labelId,
      search: q.search,
      parentId: q.topLevel ? null : undefined,
      overdue: q.overdue,
      today: this.clock.today(),
      sort: q.sort,
      order: q.order,
    });
  }

  /** Tablero kanban: tareas de primer nivel agrupadas por estado y ordenadas por posición. */
  async board(actor: Actor, projectId: number): Promise<{ columns: BoardColumn[]; progress: number }> {
    await this.access.requireProject(actor, projectId, 'project:view');
    const all = await this.tasks.listByProject(projectId);
    const progress = computeProgress(all);
    const statusById = new Map(all.map((t) => [t.id, t.status]));
    const columns = TASK_STATUSES.map((status) => ({
      status,
      tasks: all
        .filter((t) => t.parentId === null && t.status === status)
        .sort((a, b) => a.position - b.position || a.id - b.id)
        .map((t) => ({
          ...t,
          progress: progress.byTask.get(t.id) ?? 0,
          blocked: t.status !== 'hecha' && t.dependsOn.some((d) => statusById.get(d) !== 'hecha'),
        })),
    }));
    return { columns, progress: progress.project };
  }

  async get(actor: Actor, taskId: number): Promise<TaskDetail> {
    const { task } = await this.access.requireTask(actor, taskId, 'project:view');
    const subtasks = await this.tasks.listSubtasks(taskId);
    const dependencies = await this.tasks.dependenciesOf(taskId);
    const dependents = await this.tasks.dependentsOf(taskId);
    const progress = computeProgress([task, ...subtasks].map((t) => ({ ...t, parentId: t.id === task.id ? null : t.parentId })));
    const logged = await this.time.sumMinutesByTask([taskId, ...subtasks.map((s) => s.id)]);
    return {
      ...task,
      progress: progress.byTask.get(task.id) ?? 0,
      blocked: task.status !== 'hecha' && blockingDependencies(dependencies).length > 0,
      loggedMinutes: [...logged.values()].reduce((a, b) => a + b, 0),
      subtasks: subtasks.map((s) => ({ ...s, progress: progress.byTask.get(s.id) ?? 0 })),
      dependencies,
      dependents,
    };
  }

  async create(actor: Actor, projectId: number, dto: CreateTaskDto): Promise<Task> {
    await this.access.requireProject(actor, projectId, 'task:create');

    if (dto.parentId) {
      const parent = await this.tasks.findById(dto.parentId);
      if (!parent || parent.projectId !== projectId) throw new NotFoundError('Tarea padre', dto.parentId);
      // Un solo nivel de subtareas: mantiene el tablero y el cálculo de avance simples.
      if (parent.parentId !== null) {
        throw new BusinessRuleError('Una subtarea no puede tener subtareas', 'subtask_depth');
      }
      if (parent.status === 'hecha' && dto.status !== 'hecha') {
        throw new BusinessRuleError('No puedes agregar subtareas abiertas a una tarea ya terminada', 'parent_closed');
      }
    }
    if (dto.assigneeId) await this.ensureMember(projectId, dto.assigneeId);
    await this.ensureLabels(projectId, dto.labelIds);

    const task = await this.tasks.create({
      projectId,
      parentId: dto.parentId ?? null,
      title: dto.title,
      description: dto.description,
      status: dto.status,
      priority: dto.priority,
      assigneeId: dto.assigneeId ?? null,
      estimatedHours: dto.estimatedHours,
      startDate: dto.startDate ?? null,
      dueDate: dto.dueDate ?? null,
      position: await this.tasks.nextPosition(projectId, dto.status),
      createdBy: actor.id,
    });
    if (dto.labelIds.length > 0) await this.tasks.setLabels(task.id, dto.labelIds);
    await this.notifyAssignment(actor, task, task.assigneeId);
    return (await this.tasks.findById(task.id)) as Task;
  }

  async update(actor: Actor, taskId: number, dto: UpdateTaskDto): Promise<Task> {
    const { task } = await this.access.requireTask(actor, taskId, 'task:update');

    const start = dto.startDate !== undefined ? dto.startDate : task.startDate;
    const due = dto.dueDate !== undefined ? dto.dueDate : task.dueDate;
    if (start && due && start > due) {
      throw new BusinessRuleError('La fecha límite no puede ser anterior a la de inicio', 'invalid_dates');
    }
    if (dto.assigneeId) await this.ensureMember(task.projectId, dto.assigneeId);
    if (dto.labelIds) await this.ensureLabels(task.projectId, dto.labelIds);

    const patch: TaskPatch = {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      assigneeId: dto.assigneeId,
      estimatedHours: dto.estimatedHours,
      startDate: dto.startDate,
      dueDate: dto.dueDate,
    };
    if (dto.status && dto.status !== task.status) {
      Object.assign(patch, await this.statusTransition(task, dto.status));
      if (task.parentId === null) patch.position = await this.tasks.nextPosition(task.projectId, dto.status);
    }

    const updated = await this.tasks.update(taskId, patch);
    if (dto.labelIds) await this.tasks.setLabels(taskId, dto.labelIds);
    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) await this.notifyAssignment(actor, updated, dto.assigneeId);
    return (await this.tasks.findById(taskId)) as Task;
  }

  /**
   * Mover en el kanban (drag & drop): cambia estado y posición dentro de la columna.
   * Las reglas de estado son las mismas que en `update`: el tablero no es un atajo
   * para saltarse dependencias.
   */
  async move(actor: Actor, taskId: number, dto: MoveTaskDto): Promise<Task> {
    const { task } = await this.access.requireTask(actor, taskId, 'task:update');
    const patch: TaskPatch = {};
    if (dto.status !== task.status) Object.assign(patch, await this.statusTransition(task, dto.status));

    if (task.parentId === null) {
      // Reordenamos la columna destino: se inserta la tarea en el índice pedido y se
      // renumeran las posiciones 0..n-1 (solo se escriben las que cambian).
      const column = (await this.tasks.listColumn(task.projectId, dto.status)).filter((c) => c.id !== task.id);
      const index = Math.min(dto.position, column.length);
      const ordered = [...column.slice(0, index), { id: task.id, position: -1 }, ...column.slice(index)];
      const changes = ordered
        .map((c, i) => ({ id: c.id, position: i, previous: c.position }))
        .filter((c) => c.id !== task.id && c.position !== c.previous)
        .map(({ id, position }) => ({ id, position }));
      await this.tasks.setPositions(changes);
      patch.position = index;
    }
    patch.status = dto.status;
    return this.tasks.update(taskId, patch);
  }

  async delete(actor: Actor, taskId: number): Promise<void> {
    await this.access.requireTask(actor, taskId, 'task:delete');
    await this.tasks.delete(taskId);
  }

  async addDependency(actor: Actor, taskId: number, dependsOnId: number): Promise<DependencyInfo[]> {
    const { task } = await this.access.requireTask(actor, taskId, 'task:update');
    const other = await this.tasks.findById(dependsOnId);
    if (!other) throw new NotFoundError('Tarea', dependsOnId);
    if (other.projectId !== task.projectId) {
      throw new BusinessRuleError('Solo se permiten dependencias entre tareas del mismo proyecto', 'cross_project');
    }
    const edges = await this.tasks.dependencyEdges(task.projectId);
    if (edges.some((e) => e.taskId === taskId && e.dependsOnId === dependsOnId)) {
      throw new ConflictError('La dependencia ya existe', 'dependency_exists');
    }
    if (wouldCreateCycle(edges, taskId, dependsOnId)) {
      throw new BusinessRuleError('La dependencia crearía un ciclo: ninguna de esas tareas podría terminarse', 'dependency_cycle');
    }
    if (task.status === 'hecha' && other.status !== 'hecha') {
      throw new BusinessRuleError('Una tarea terminada no puede depender de una tarea pendiente', 'task_already_done');
    }
    await this.tasks.addDependency(taskId, dependsOnId);
    return this.tasks.dependenciesOf(taskId);
  }

  async removeDependency(actor: Actor, taskId: number, dependsOnId: number): Promise<void> {
    await this.access.requireTask(actor, taskId, 'task:update');
    if (!(await this.tasks.removeDependency(taskId, dependsOnId))) throw new NotFoundError('Dependencia', dependsOnId);
  }

  /**
   * Reglas de cambio de estado:
   * - No se puede pasar a "hecha" si alguna dependencia no está "hecha".
   * - No se puede pasar a "hecha" si tiene subtareas abiertas.
   * - Una subtarea no se reabre si su tarea padre está "hecha" (primero se reabre el padre).
   * - completed_at se fija al cerrar y se limpia al reabrir (métrica de "terminadas en 7 días").
   */
  private async statusTransition(task: Task, next: TaskStatus): Promise<TaskPatch> {
    if (next === 'hecha') {
      const pending = blockingDependencies(await this.tasks.dependenciesOf(task.id));
      if (pending.length > 0) {
        throw new BusinessRuleError(
          `No se puede completar: depende de ${pending.length} tarea(s) sin terminar`,
          'dependencies_pending',
          pending,
        );
      }
      const openSubtasks = (await this.tasks.listSubtasks(task.id)).filter((s) => s.status !== 'hecha');
      if (openSubtasks.length > 0) {
        throw new BusinessRuleError(
          `No se puede completar: tiene ${openSubtasks.length} subtarea(s) abiertas`,
          'subtasks_pending',
          openSubtasks.map((s) => ({ id: s.id, title: s.title, status: s.status })),
        );
      }
      return { status: next, completedAt: this.clock.now().toISOString() };
    }
    if (task.status === 'hecha' && task.parentId !== null) {
      const parent = await this.tasks.findById(task.parentId);
      if (parent?.status === 'hecha') {
        throw new BusinessRuleError('Reabre primero la tarea padre', 'parent_closed');
      }
    }
    return { status: next, completedAt: null };
  }

  private async ensureMember(projectId: number, userId: number): Promise<void> {
    if (!(await this.projects.getMemberRole(projectId, userId))) {
      throw new BusinessRuleError('El responsable debe ser miembro del proyecto', 'assignee_not_member');
    }
  }

  private async ensureLabels(projectId: number, labelIds: number[]): Promise<void> {
    if (labelIds.length === 0) return;
    const valid = new Set((await this.projects.listLabels(projectId)).map((l) => l.id));
    const invalid = labelIds.filter((id) => !valid.has(id));
    if (invalid.length > 0) {
      throw new BusinessRuleError('Hay etiquetas que no pertenecen al proyecto', 'invalid_labels', invalid);
    }
  }

  private async notifyAssignment(actor: Actor, task: Task, assigneeId: number | null): Promise<void> {
    if (!assigneeId || assigneeId === actor.id) return;
    await this.notifications.createMany([
      {
        userId: assigneeId,
        type: 'asignacion',
        message: `${actor.name} te asignó la tarea "${task.title}"`,
        taskId: task.id,
        projectId: task.projectId,
        commentId: null,
      },
    ]);
  }
}
