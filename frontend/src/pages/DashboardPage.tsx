import { Link } from 'react-router-dom';
import { api } from '../api/endpoints';
import { TASK_STATUSES } from '../api/types';
import { Card, EmptyState, ErrorState, KpiCard, Loading, PageHeader, PriorityBadge, ProgressBar, ProjectStatusBadge, StatusBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatMinutes, isOverdue, STATUS_LABEL } from '../lib/format';

const BAR_COLORS = { pendiente: 'bg-slate-400', en_progreso: 'bg-sky-500', en_revision: 'bg-amber-500', hecha: 'bg-emerald-500' };

export function DashboardPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.dashboard(), []);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const total = Math.max(1, data.tasks.total);
  return (
    <>
      <PageHeader title={`Hola, ${user?.name.split(' ')[0]}`} subtitle="Resumen de tus proyectos y tareas" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Proyectos activos" value={data.activeProjects} />
        <KpiCard label="Tareas abiertas" value={data.tasks.open} hint={`${data.tasks.total} en total`} />
        <KpiCard label="Vencidas" value={data.tasks.overdue} tone={data.tasks.overdue > 0 ? 'warn' : 'default'} />
        <KpiCard label="Terminadas (7 días)" value={data.tasks.completedLast7Days} tone="good" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Avance de proyectos activos</h2>
            <Link to="/proyectos" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
              Ver todos
            </Link>
          </div>
          {data.projects.length === 0 ? (
            <EmptyState title="Sin proyectos activos" />
          ) : (
            <ul className="space-y-4">
              {data.projects.map((p) => (
                <li key={p.id}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Link to={`/proyectos/${p.id}`} className="truncate font-medium hover:text-brand-600">
                      {p.name}
                    </Link>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                  <ProgressBar value={p.progress} />
                  <p className="mt-1 text-xs text-slate-500">
                    {p.doneCount}/{p.taskCount} tareas · fin {formatDate(p.endDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Mi semana</h2>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs text-slate-500">Abiertas</dt>
              <dd className="text-xl font-semibold">{data.my.openTasks}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Vencidas</dt>
              <dd className={`text-xl font-semibold ${data.my.overdueTasks ? 'text-rose-600' : ''}`}>{data.my.overdueTasks}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Horas</dt>
              <dd className="text-xl font-semibold">{formatMinutes(data.my.minutesThisWeek)}</dd>
            </div>
          </dl>
          <h3 className="mb-2 mt-6 text-sm font-medium text-slate-600 dark:text-slate-300">Próximos vencimientos</h3>
          {data.my.upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">No tienes tareas con fecha límite.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.my.upcoming.map((t) => (
                <li key={t.id} className="py-2">
                  <Link to={`/proyectos/${t.projectId}?tarea=${t.id}`} className="block text-sm font-medium hover:text-brand-600">
                    {t.title}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <StatusBadge status={t.status} />
                    <PriorityBadge priority={t.priority} />
                    <span className={isOverdue(t.dueDate, t.status) ? 'font-semibold text-rose-600' : 'text-slate-500'}>{formatDate(t.dueDate)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-4 font-semibold">Tareas por estado</h2>
        <div className="flex h-4 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
          {TASK_STATUSES.map((s) => (
            <div key={s} className={BAR_COLORS[s]} style={{ width: `${(data.tasks.byStatus[s] / total) * 100}%` }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-4 text-sm">
          {TASK_STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${BAR_COLORS[s]}`} />
              {STATUS_LABEL[s]}: <strong>{data.tasks.byStatus[s]}</strong>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
