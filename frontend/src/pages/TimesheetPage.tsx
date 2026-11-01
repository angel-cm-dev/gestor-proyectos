import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../api/endpoints';
import { Button, Card, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatMinutes, todayISO } from '../lib/format';
import { hasErrors, validateTimeEntry } from '../lib/validation';
import { addDays, weekDays, weekStart } from '../lib/week';

export function TimesheetPage() {
  const today = todayISO();
  const [monday, setMonday] = useState(weekStart(today));
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const sunday = addDays(monday, 6);
  const toast = useToast();

  const sheet = useAsync(() => api.timesheet({ from: monday, to: sunday, page, pageSize: 20 }), [monday, page, refresh]);
  // Para los totales diarios se pide la semana completa (máx. 100 registros).
  const week = useAsync(() => api.timesheet({ from: monday, to: sunday, pageSize: 100 }), [monday, refresh]);
  const days = weekDays(monday);
  const perDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of week.data?.items ?? []) map.set(e.workDate, (map.get(e.workDate) ?? 0) + e.minutes);
    return map;
  }, [week.data]);

  const moveWeek = (delta: number) => {
    setMonday(addDays(monday, delta * 7));
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Mis horas" subtitle="Timesheet semanal de tu trabajo registrado" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => moveWeek(-1)} aria-label="Semana anterior">
              ←
            </Button>
            <p className="text-sm font-medium">
              {formatDate(monday)} — {formatDate(sunday)}
            </p>
            <Button variant="secondary" onClick={() => moveWeek(1)} disabled={addDays(monday, 7) > today} aria-label="Semana siguiente">
              →
            </Button>
          </div>
          <div className="mb-6 grid grid-cols-7 gap-1 text-center text-xs">
            {days.map((d) => (
              <div key={d.date} className={`rounded-lg p-2 ${d.date === today ? 'bg-brand-50 ring-1 ring-brand-300 dark:bg-brand-950' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                <p className="font-medium text-slate-500">{d.label}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">{perDay.get(d.date) ? formatMinutes(perDay.get(d.date) as number) : '—'}</p>
              </div>
            ))}
          </div>

          {sheet.loading && !sheet.data ? (
            <Loading />
          ) : sheet.error || !sheet.data ? (
            <ErrorState error={sheet.error} onRetry={sheet.reload} />
          ) : sheet.data.items.length === 0 ? (
            <EmptyState title="Sin horas esta semana" description="Registra horas desde una tarea o con el formulario." />
          ) : (
            <>
              <p className="mb-2 text-sm">
                Total semana: <strong>{formatMinutes(sheet.data.totalMinutes)}</strong>
              </p>
              <Table>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Proyecto / tarea</Th>
                    <Th>Horas</Th>
                    <Th>Nota</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sheet.data.items.map((e) => (
                    <tr key={e.id}>
                      <Td>{formatDate(e.workDate)}</Td>
                      <Td className="whitespace-normal">
                        <p className="text-xs text-slate-500">{e.projectName}</p>
                        <p>{e.taskTitle}</p>
                      </Td>
                      <Td className="tabular-nums">{formatMinutes(e.minutes)}</Td>
                      <Td className="max-w-[12rem] truncate">{e.note}</Td>
                      <Td>
                        <button
                          className="text-xs text-rose-600 hover:underline"
                          onClick={async () => {
                            if (!window.confirm('¿Eliminar este registro?')) return;
                            try {
                              await api.deleteTime(e.id);
                              setRefresh((r) => r + 1);
                            } catch (err) {
                              toast.error(err);
                            }
                          }}
                        >
                          Eliminar
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={sheet.data.page} totalPages={sheet.data.totalPages} total={sheet.data.total} onPage={setPage} />
            </>
          )}
        </Card>
        <QuickLog onLogged={() => setRefresh((r) => r + 1)} />
      </div>
    </>
  );
}

function QuickLog({ onLogged }: { onLogged: () => void }) {
  const toast = useToast();
  const today = todayISO();
  const [projectId, setProjectId] = useState('');
  const [form, setForm] = useState({ taskId: '', workDate: today, hours: '1', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const projects = useAsync(() => api.projects({ pageSize: 100, status: 'activo', sort: 'name', order: 'asc' }), []);
  const tasks = useAsync(
    () => (projectId ? api.tasks(Number(projectId), { pageSize: 100, sort: 'title' }) : Promise.resolve(null)),
    [projectId],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = { ...(validateTimeEntry(form, today) as Record<string, string>) };
    if (!form.taskId) v.taskId = 'Elige una tarea';
    setErrors(v);
    if (hasErrors(v)) return;
    setSaving(true);
    try {
      await api.logTime(Number(form.taskId), { workDate: form.workDate, hours: Number(form.hours), note: form.note });
      toast.success('Horas registradas');
      setForm({ ...form, hours: '1', note: '' });
      onLogged();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Registrar horas</h2>
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        <Field label="Proyecto" htmlFor="q-project">
          <Select id="q-project" value={projectId} onChange={(e) => { setProjectId(e.target.value); setForm({ ...form, taskId: '' }); }}>
            <option value="">Selecciona...</option>
            {(projects.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tarea" htmlFor="q-task" error={errors.taskId}>
          <Select id="q-task" value={form.taskId} disabled={!projectId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}>
            <option value="">Selecciona...</option>
            {(tasks.data?.items ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fecha" htmlFor="q-date" error={errors.workDate}>
            <Input id="q-date" type="date" max={today} value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} />
          </Field>
          <Field label="Horas" htmlFor="q-hours" error={errors.hours}>
            <Input id="q-hours" type="number" step={0.25} min={0.25} max={24} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          </Field>
        </div>
        <Field label="Nota" htmlFor="q-note">
          <Input id="q-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        <Button type="submit" className="w-full" loading={saving}>
          Registrar
        </Button>
      </form>
    </Card>
  );
}
