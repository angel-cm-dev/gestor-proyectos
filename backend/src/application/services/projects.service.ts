import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../domain/errors';
import { canCreateProject } from '../../domain/permissions';
import { computeProgress } from '../../domain/progress';
import type { Actor, Label, Page, Project, ProjectMember, ProjectRole, ProjectSummary } from '../../domain/types';
import type { CreateProjectDto, ListProjectsQuery, UpdateProjectDto } from '../dtos';
import type { ProjectRepository, TaskRepository, UserRepository } from '../ports';
import type { ProjectAccess } from './access';

export class ProjectsService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly tasks: TaskRepository,
    private readonly users: UserRepository,
    private readonly access: ProjectAccess,
  ) {}

  /** Un admin ve todos los proyectos; el resto solo aquellos donde es miembro. */
  async list(actor: Actor, query: ListProjectsQuery): Promise<Page<ProjectSummary>> {
    const page = await this.projects.list({ ...query, memberId: actor.role === 'admin' ? undefined : actor.id });
    const items = await this.summarize(actor, page.items);
    return { ...page, items };
  }

  /** Agrega avance y conteos a una lista de proyectos con una sola consulta de tareas. */
  async summarize(actor: Actor, projects: Array<Project & { memberCount?: number }>): Promise<ProjectSummary[]> {
    const ids = projects.map((p) => p.id);
    const nodes = await this.tasks.progressNodes(ids);
    const roles = await this.projects.memberRoles(actor.id, ids);
    return projects.map((p) => {
      const own = nodes.filter((n) => n.projectId === p.id);
      const topLevel = own.filter((n) => n.parentId === null);
      return {
        ...p,
        memberCount: p.memberCount ?? 0,
        taskCount: topLevel.length,
        doneCount: topLevel.filter((n) => n.status === 'hecha').length,
        progress: computeProgress(own).project,
        myRole: roles.get(p.id) ?? null,
      };
    });
  }

  async get(actor: Actor, id: number): Promise<ProjectSummary & { members: ProjectMember[]; labels: Label[] }> {
    const { project } = await this.access.requireProject(actor, id, 'project:view');
    const members = await this.projects.listMembers(id);
    const [summary] = await this.summarize(actor, [{ ...project, memberCount: members.length }]);
    return { ...summary, members, labels: await this.projects.listLabels(id) };
  }

  async create(actor: Actor, dto: CreateProjectDto): Promise<Project> {
    if (!canCreateProject(actor.role)) throw new ForbiddenError('Solo administradores y líderes pueden crear proyectos');
    const project = await this.projects.create({
      name: dto.name,
      description: dto.description,
      status: dto.status,
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      ownerId: actor.id,
    });
    // Quien crea el proyecto queda como gestor: siempre existe al menos un responsable.
    await this.projects.upsertMember(project.id, actor.id, 'gestor');
    return project;
  }

  async update(actor: Actor, id: number, dto: UpdateProjectDto): Promise<Project> {
    const { project } = await this.access.requireProject(actor, id, 'project:update');
    const start = dto.startDate !== undefined ? dto.startDate : project.startDate;
    const end = dto.endDate !== undefined ? dto.endDate : project.endDate;
    if (start && end && start > end) {
      throw new BusinessRuleError('La fecha de fin no puede ser anterior a la de inicio', 'invalid_dates');
    }
    return (await this.projects.update(id, dto)) as Project;
  }

  async delete(actor: Actor, id: number): Promise<void> {
    await this.access.requireProject(actor, id, 'project:delete');
    await this.projects.delete(id);
  }

  // ---------- Miembros ----------
  async listMembers(actor: Actor, projectId: number): Promise<ProjectMember[]> {
    await this.access.requireProject(actor, projectId, 'project:view');
    return this.projects.listMembers(projectId);
  }

  async addMember(actor: Actor, projectId: number, userId: number, role: ProjectRole): Promise<ProjectMember[]> {
    await this.access.requireProject(actor, projectId, 'members:manage');
    const user = await this.users.findById(userId);
    if (!user || !user.active) throw new NotFoundError('Usuario', userId);
    if (await this.projects.getMemberRole(projectId, userId)) {
      throw new ConflictError('El usuario ya es miembro del proyecto', 'already_member');
    }
    await this.projects.upsertMember(projectId, userId, role);
    return this.projects.listMembers(projectId);
  }

  async updateMember(actor: Actor, projectId: number, userId: number, role: ProjectRole): Promise<ProjectMember[]> {
    await this.access.requireProject(actor, projectId, 'members:manage');
    const current = await this.projects.getMemberRole(projectId, userId);
    if (!current) throw new NotFoundError('Miembro', userId);
    if (current === 'gestor' && role !== 'gestor') await this.ensureAnotherManager(projectId);
    await this.projects.upsertMember(projectId, userId, role);
    return this.projects.listMembers(projectId);
  }

  async removeMember(actor: Actor, projectId: number, userId: number): Promise<void> {
    await this.access.requireProject(actor, projectId, 'members:manage');
    const current = await this.projects.getMemberRole(projectId, userId);
    if (!current) throw new NotFoundError('Miembro', userId);
    if (current === 'gestor') await this.ensureAnotherManager(projectId);
    // Las tareas conservan su responsable por trazabilidad histórica.
    await this.projects.removeMember(projectId, userId);
  }

  /** Regla: un proyecto nunca puede quedarse sin gestor. */
  private async ensureAnotherManager(projectId: number): Promise<void> {
    const managers = (await this.projects.listMembers(projectId)).filter((m) => m.role === 'gestor');
    if (managers.length <= 1) {
      throw new BusinessRuleError('El proyecto debe conservar al menos un gestor', 'last_manager');
    }
  }

  // ---------- Etiquetas ----------
  async listLabels(actor: Actor, projectId: number): Promise<Label[]> {
    await this.access.requireProject(actor, projectId, 'project:view');
    return this.projects.listLabels(projectId);
  }

  async createLabel(actor: Actor, projectId: number, name: string, color: string): Promise<Label> {
    await this.access.requireProject(actor, projectId, 'labels:manage');
    const existing = await this.projects.listLabels(projectId);
    if (existing.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictError('Ya existe una etiqueta con ese nombre en el proyecto', 'label_exists');
    }
    return this.projects.createLabel(projectId, name, color);
  }

  async deleteLabel(actor: Actor, projectId: number, labelId: number): Promise<void> {
    await this.access.requireProject(actor, projectId, 'labels:manage');
    if (!(await this.projects.deleteLabel(projectId, labelId))) throw new NotFoundError('Etiqueta', labelId);
  }
}
