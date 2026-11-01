import { ForbiddenError, NotFoundError } from '../../domain/errors';
import { can, type ProjectAction } from '../../domain/permissions';
import type { Actor, Project, ProjectRole, Task } from '../../domain/types';
import type { ProjectRepository, TaskRepository } from '../ports';

/**
 * Punto único de autorización a nivel de proyecto. Todos los servicios pasan
 * por aquí, así ninguna ruta puede "olvidarse" de verificar permisos.
 */
export class ProjectAccess {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly tasks: TaskRepository,
  ) {}

  async requireProject(actor: Actor, projectId: number, action: ProjectAction): Promise<{ project: Project; role: ProjectRole | null }> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('Proyecto', projectId);
    const role = await this.projects.getMemberRole(projectId, actor.id);
    if (!can(actor.role, role, action)) {
      throw new ForbiddenError(
        role ? `Tu rol en el proyecto (${role}) no permite esta acción (${action})` : 'No eres miembro de este proyecto',
      );
    }
    return { project, role };
  }

  async requireTask(actor: Actor, taskId: number, action: ProjectAction): Promise<{ task: Task; project: Project; role: ProjectRole | null }> {
    const task = await this.tasks.findById(taskId);
    if (!task) throw new NotFoundError('Tarea', taskId);
    const { project, role } = await this.requireProject(actor, task.projectId, action);
    return { task, project, role };
  }
}
