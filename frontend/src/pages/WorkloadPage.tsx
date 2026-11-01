import { useState } from 'react';
import { api } from '../api/endpoints';
import type { WorkloadRow } from '../api/types';
import { Avatar, Badge, Card, EmptyState, ErrorState, Input, Loading, PageHeader, Table, Td, Th } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { cn, formatMinutes, todayISO } from '../lib/format';
import { addDays, weekStart } from '../lib/week';

const LEVEL_STYLE: Record<WorkloadRow['level'], string> = {
  baja: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  normal: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  alta: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sobrecarga: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
};
const BAR_STYLE: Record<WorkloadRow['level'], string> = {
  baja: 'bg-sky-500',
  normal: 'bg-emerald-500',
  alta: 'bg-amber-500',
  sobrecarga: 'bg-rose-500',
};

export function WorkloadPage() {
  const monday = weekStart(todayISO());
  const [range, setRange] = useState({ from: monday, to: addDays(monday, 6) });
  const data = useAsync(() => api.workload(range), [range.from, range.to]);

  return (
    <>
      <PageHeader title="Carga de trabajo" subtitle="Horas estimadas pendientes por persona frente a una capacidad de 40 h semanales" />
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm">
            Horas registradas desde
            <Input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </label>
          <label className="text-sm">
            hasta
            <Input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </label>
        </div>
        {data.loading && !data.data ? (
          <Loading />
        ) : data.error || !data.data ? (
          <ErrorState error={data.error} onRetry={data.reload} />
        ) : data.data.rows.length === 0 ? (
          <EmptyState title="Sin personas en tus proyectos" description="Como líder ves la carga de los proyectos donde eres gestor." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Persona</Th>
                <Th className="w-64">Carga pendiente</Th>
                <Th>Nivel</Th>
                <Th>Abiertas</Th>
                <Th>En progreso</Th>
                <Th>Vencidas</Th>
                <Th>Registrado</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.data.rows.map((r) => (
                <tr key={r.userId}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Avatar name={r.name} size="sm" />
                      <div>
                        <p className="font-medium">{r.name}</p>
                        <p className="text-xs text-slate-500">@{r.username}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={cn('h-2 rounded-full', BAR_STYLE[r.level])} style={{ width: `${Math.min(100, r.loadPercent)}%` }} />
                      </div>
                      <span className="w-24 text-right text-xs tabular-nums">
                        {r.pendingEstimatedHours} h ({r.loadPercent}%)
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <Badge className={LEVEL_STYLE[r.level]}>{r.level}</Badge>
                  </Td>
                  <Td>{r.openTasks}</Td>
                  <Td>{r.inProgressTasks}</Td>
                  <Td className={r.overdueTasks ? 'font-semibold text-rose-600' : ''}>{r.overdueTasks}</Td>
                  <Td>{formatMinutes(r.loggedMinutes)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
