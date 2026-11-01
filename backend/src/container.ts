import type { Logger } from 'pino';
import type { Clock } from './application/ports';
import { ProjectAccess } from './application/services/access';
import { AuthService, UsersService } from './application/services/auth.service';
import { CommentsService, NotificationsService } from './application/services/collaboration.service';
import { ProjectsService } from './application/services/projects.service';
import { ReportsService } from './application/services/reports.service';
import { TasksService } from './application/services/tasks.service';
import { TimeService } from './application/services/time.service';
import type { Db } from './infrastructure/db/db';
import { PgCommentRepository, PgNotificationRepository } from './infrastructure/repositories/comment.repository';
import { PgProjectRepository } from './infrastructure/repositories/project.repository';
import { PgReportRepository } from './infrastructure/repositories/report.repository';
import { PgTaskRepository } from './infrastructure/repositories/task.repository';
import { PgTimeEntryRepository } from './infrastructure/repositories/time-entry.repository';
import { PgUserRepository } from './infrastructure/repositories/user.repository';
import { BcryptPasswordHasher, JwtTokenService, systemClock } from './infrastructure/security/security';

export interface ContainerOptions {
  db: Db;
  logger: Logger;
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
  corsOrigin: string;
  clock?: Clock;
}

/**
 * Raíz de composición: el ÚNICO lugar donde se instancian las clases concretas.
 * Inyección de dependencias manual (sin contenedor mágico): explícita, tipada y
 * fácil de seguir. Las pruebas crean el contenedor con una BD pg-mem y un reloj fijo.
 */
export function createContainer(opts: ContainerOptions) {
  const clock = opts.clock ?? systemClock;

  const repos = {
    users: new PgUserRepository(opts.db),
    projects: new PgProjectRepository(opts.db),
    tasks: new PgTaskRepository(opts.db),
    time: new PgTimeEntryRepository(opts.db),
    comments: new PgCommentRepository(opts.db),
    notifications: new PgNotificationRepository(opts.db),
    reports: new PgReportRepository(opts.db),
  };
  const hasher = new BcryptPasswordHasher(opts.bcryptRounds);
  const tokens = new JwtTokenService(opts.jwtSecret, opts.jwtExpiresIn);
  const access = new ProjectAccess(repos.projects, repos.tasks);

  const projects = new ProjectsService(repos.projects, repos.tasks, repos.users, access);
  const services = {
    auth: new AuthService(repos.users, hasher, tokens),
    users: new UsersService(repos.users, hasher),
    projects,
    tasks: new TasksService(repos.tasks, repos.projects, repos.time, repos.notifications, access, clock),
    comments: new CommentsService(repos.comments, repos.users, repos.projects, repos.notifications, access),
    notifications: new NotificationsService(repos.notifications),
    time: new TimeService(repos.time, repos.projects, access, clock),
    reports: new ReportsService(repos.reports, repos.time, repos.projects, projects, access, clock),
  };

  return { db: opts.db, logger: opts.logger, corsOrigin: opts.corsOrigin, hasher, clock, services };
}

export type Container = ReturnType<typeof createContainer>;
