import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/endpoints';
import { PRIORITIES, PROJECT_ROLES, TASK_STATUSES, type ProjectDetail, type ProjectRole } from '../api/types';
import { KanbanBoard } from '../components/KanbanBoard';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { TaskFormModal } from '../components/TaskFormModal';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Loading,
  PageHeader,
  Pagination,
  PriorityBadge,
  ProgressBar,
  ProjectStatusBadge,
  Select,
  StatusBadge,
  Table,
  Td,
  Th,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebounce } from '../hooks/useAsync';
import { cn, formatDate, formatMinutes, isOverdue, PRIORITY_LABEL, ROLE_LABEL, STATUS_LABEL, todayISO } from '../lib/format';

type Tab = 'tablero' | 'tareas' | 'miembros' | 'horas';

export function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('tablero');
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const project = useAsync(() => api.project(projectId), [projectId, refresh]);

  const openTaskId = params.get('tarea') ? Number(params.get('tarea')) : null;
  const openTask = (taskId: number | null) => setParams(taskId ? { tarea: String(taskId) } : {});
  const changed = () => setRefresh((r) => r + 1);

  if (project.loading && !project.data) return <Loading />;
  if (project.error || !project.data) return <ErrorState error={project.error} onRetry={project.reload} />;

  const p = project.data;
  // Permisos en la UI = espejo de la matriz del backend (el backend siempre tiene la última palabra).
  const isAdmin = user?.role === 'admin';
  const canManage = isAdmin || p.myRole === 'gestor';
  const canEdit = canManage || p.myRole === 'colaborador';
  const canComment = canEdit || p.myRole === 'observador';

  const tabs: Array<{ id: Tab; label: string; visible: boolean }> = [
    { id: 'tablero', label: 'Tablero', visible: true },
    { id: 'tareas', label: 'Tareas', visible: true },
    { id: 'miembros', label: `Miembros (${p.members.length})`, visible: true },
    { id: 'horas', label: 'Reporte de horas', visible: canManage },
  ];

  return (
    <>
      <nav className="mb-2 text-sm text-slate-500">
        <Link to="/proyectos" className="hover:underline">
          Proyectos
        </Link>{' '}
        / {p.name}
      </nav>
      <PageHeader
        title={p.name}
        subtitle={p.description}
        actions={canEdit && <Button onClick={() => setCreating(true)}>+ Nueva tarea</Button>}
      />
      <Card className="mb-6 grid gap-4 p-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Estado</p>
          <ProjectStatusBadge status={p.status} />
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1 text-xs text-slate-500" title="Promedio ponderado por horas estimadas del avance de cada tarea">
            Avance ({p.doneCount}/{p.taskCount} tareas)
          </p>
          <ProgressBar value={p.progress} />
        </div>
        <div>
          <p className="text-xs text-slate-500">Fechas</p>
          <p className="text-sm">
            {formatDate(p.startDate)} → {formatDate(p.endDate)}
          </p>
        </div>
      </Card>

      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs
          .filter((t) => t.visible)
          .map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
                tab === t.id ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === 'tablero' && <BoardTab projectId={projectId} canEdit={canEdit} refresh={refresh} onOpenTask={openTask} onChanged={changed} />}
      {tab === 'tareas' && <TasksTab project={p} refresh={refresh} onOpenTask={openTask} />}
      {tab === 'miembros' && <MembersTab project={p} canManage={canManage} onChanged={changed} />}
      {tab === 'horas' && canManage && <HoursTab projectId={projectId} />}

      <TaskFormModal open={creating} projectId={projectId} members={p.members} labels={p.labels} onClose={() => setCreating(false)} onCreated={changed} />
      <TaskDetailModal
        taskId={openTaskId}
        projectId={projectId}
        members={p.members}
        labels={p.labels}
        canEdit={canEdit}
        canManage={canManage}
        canComment={canComment}
        canLog={canEdit}
        onClose={() => openTask(null)}
        onChanged={changed}
      />
    </>
  );
}

function BoardTab({ projectId, canEdit, refresh, onOpenTask, onChanged }: { projectId: number; canEdit: boolean; refresh: number; onOpenTask: (id: number) => void; onChanged: () => void }) {
  const board = useAsync(() => api.board(projectId), [projectId, refresh]);
  if (board.loading && !board.data) return <Loading />;
  if (board.error || !board.data) return <ErrorState error={board.error} onRetry={board.reload} />;
  return (
    <>
      {canEdit && <p className="mb-3 text-xs text-slate-500">Arrastra las tarjetas entre columnas. Una tarea no puede pasar a "Hecha" si sus dependencias o subtareas siguen abiertas.</p>}
      <KanbanBoard board={board.data} canEdit={canEdit} onOpenTask={onOpenTask} onChanged={onChanged} />
    </>
  );
}

function TasksTab({ project, refresh, onOpenTask }: { project: ProjectDetail; refresh: number; onOpenTask: (id: number) => void }) {
  const [filters, setFilters] = useState({ search: '', status: '', priority: '', assigneeId: '', overdue: false, sort: 'position:asc' });
  const [page, setPage] = useState(1);
  const search = useDebounce(filters.search);
  const [sort, order] = filters.sort.split(':');
  const tasks = useAsync(
    () =>
      api.tasks(project.id, {
        page,
        pageSize: 10,
        search,
        status: filters.status,
        priority: filters.priority,
        assigneeId: filters.assigneeId ? Number(filters.assigneeId) : undefined,
        overdue: filters.overdue || undefined,
        sort,
        order,
      }),
    [project.id, page, search, filters.status, filters.priority, filters.assigneeId, filters.overdue, filters.sort, refresh],
  );
  const update = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <Card>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Input className="lg:col-span-2" placeholder="Buscar tareas..." aria-label="Buscar tareas" value={filters.search} onChange={(e) => update({ search: e.target.value })} />
        <Select aria-label="Estado" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">Estado: todos</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="Prioridad" value={filters.priority} onChange={(e) => update({ priority: e.target.value })}>
          <option value="">Prioridad: todas</option>
          {PRIORITIES.map((s) => (
            <option key={s} value={s}>
              {PRIORITY_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="Responsable" value={filters.assigneeId} onChange={(e) => update({ assigneeId: e.target.value })}>
          <option value="">Responsable: todos</option>
          {project.members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Ordenar" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="position:asc">Orden del tablero</option>
          <option value="priority:desc">Prioridad</option>
          <option value="dueDate:asc">Fecha límite</option>
          <option value="title:asc">Título</option>
          <option value="createdAt:desc">Más recientes</option>
        </Select>
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={filters.overdue} onChange={(e) => update({ overdue: e.target.checked })} /> Solo vencidas
      </label>

      {tasks.loading && !tasks.data ? (
        <Loading />
      ) : tasks.error ? (
        <ErrorState error={tasks.error} onRetry={tasks.reload} />
      ) : !tasks.data || tasks.data.items.length === 0 ? (
        <EmptyState title="No hay tareas con esos filtros" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Tarea</Th>
                <Th>Estado</Th>
                <Th>Prioridad</Th>
                <Th>Responsable</Th>
                <Th>Estimado</Th>
                <Th>Límite</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tasks.data.items.map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => onOpenTask(t.id)}>
                  <Td>
                    <span className="font-medium">{t.title}</span>
                    {t.subtaskCount > 0 && (
                      <span className="ml-2 text-xs text-slate-500">
                        ({t.subtaskDoneCount}/{t.subtaskCount})
                      </span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td>
                    <PriorityBadge priority={t.priority} />
                  </Td>
                  <Td>{t.assigneeName ?? <span className="text-slate-400">—</span>}</Td>
                  <Td>{t.estimatedHours} h</Td>
                  <Td className={isOverdue(t.dueDate, t.status) ? 'font-semibold text-rose-600' : ''}>{formatDate(t.dueDate)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={tasks.data.page} totalPages={tasks.data.totalPages} total={tasks.data.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

function MembersTab({ project, canManage, onChanged }: { project: ProjectDetail; canManage: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<ProjectRole>('colaborador');
  const users = useAsync(() => (canManage ? api.users({ pageSize: 100 }) : Promise.resolve(null)), [canManage]);
  const candidates = (users.data?.items ?? []).filter((u) => u.active && !project.members.some((m) => m.userId === u.id));

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      toast.success(ok);
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Card>
      {canManage && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Usuario a agregar" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Selecciona un usuario...</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} (@{u.username})
              </option>
            ))}
          </Select>
          <Select aria-label="Rol en el proyecto" value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} className="sm:w-48">
            {PROJECT_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          <Button
            disabled={!userId}
            onClick={() =>
              run(async () => {
                await api.addMember(project.id, Number(userId), role);
                setUserId('');
              }, 'Miembro agregado')
            }
          >
            Agregar
          </Button>
        </div>
      )}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {project.members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
            <Avatar name={m.name} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{m.name}</p>
              <p className="text-xs text-slate-500">
                @{m.username} · {m.email}
              </p>
            </div>
            {canManage ? (
              <>
                <Select
                  aria-label={`Rol de ${m.name}`}
                  className="w-40"
                  value={m.role}
                  onChange={(e) => run(() => api.updateMember(project.id, m.userId, e.target.value as ProjectRole), 'Rol actualizado')}
                >
                  {PROJECT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
                <Button variant="ghost" onClick={() => run(() => api.removeMember(project.id, m.userId), 'Miembro retirado')}>
                  Quitar
                </Button>
              </>
            ) : (
              <span className="text-sm text-slate-600 dark:text-slate-300">{ROLE_LABEL[m.role]}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function HoursTab({ projectId }: { projectId: number }) {
  const toast = useToast();
  const today = todayISO();
  const [range, setRange] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const report = useAsync(() => api.hoursReport(projectId, range), [projectId, range.from, range.to]);
  const [downloading, setDownloading] = useState(false);

  async function exportCsv() {
    setDownloading(true);
    try {
      await api.downloadHoursCsv(projectId, range);
    } catch (err) {
      toast.error(err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="text-sm">
          Desde
          <Input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label className="text-sm">
          Hasta
          <Input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
        <Button variant="secondary" onClick={exportCsv} loading={downloading} className="sm:ml-auto">
          ⬇ Exportar CSV
        </Button>
      </div>
      {report.loading && !report.data ? (
        <Loading />
      ) : report.error || !report.data ? (
        <ErrorState error={report.error} onRetry={report.reload} />
      ) : report.data.entries.length === 0 ? (
        <EmptyState title="Sin horas registradas en el rango" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Por persona · total {formatMinutes(report.data.totalMinutes)}</h3>
            <ul className="space-y-2">
              {report.data.byUser.map((u) => (
                <li key={u.userId}>
                  <div className="flex justify-between text-sm">
                    <span>{u.name}</span>
                    <span className="tabular-nums">{u.hours} h</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(u.minutes / report.data!.totalMinutes) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Por tarea</h3>
            <Table>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {report.data.byTask.map((t) => (
                  <tr key={t.taskId}>
                    <Td className="whitespace-normal">{t.title}</Td>
                    <Td className="text-right tabular-nums">{t.hours} h</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      )}
    </Card>
  );
}
