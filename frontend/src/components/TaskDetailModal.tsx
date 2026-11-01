import { useState, type FormEvent } from 'react';
import { api } from '../api/endpoints';
import { PRIORITIES, TASK_STATUSES, type Label, type Priority, type ProjectMember, type TaskDetail, type TaskStatus } from '../api/types';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { cn, formatDate, formatDateTime, formatMinutes, PRIORITY_LABEL, STATUS_LABEL, todayISO } from '../lib/format';
import { currentMentionQuery, splitMentions } from '../lib/mentions';
import { hasErrors, validateTimeEntry } from '../lib/validation';
import { TaskFormModal } from './TaskFormModal';
import { Avatar, Button, ErrorState, Field, Input, Loading, Modal, ProgressBar, Select, StatusBadge, Textarea } from './ui';

interface Props {
  taskId: number | null;
  projectId: number;
  members: ProjectMember[];
  labels: Label[];
  canEdit: boolean;
  canManage: boolean;
  canComment: boolean;
  canLog: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function TaskDetailModal(props: Props) {
  if (props.taskId === null) return null;
  return <TaskDetailContent {...props} taskId={props.taskId} />;
}

function TaskDetailContent({ taskId, projectId, members, labels, canEdit, canManage, canComment, canLog, onClose, onChanged }: Props & { taskId: number }) {
  const toast = useToast();
  const task = useAsync(() => api.task(taskId), [taskId]);
  const [addingSubtask, setAddingSubtask] = useState(false);

  async function patch(body: Parameters<typeof api.updateTask>[1], ok?: string) {
    try {
      await api.updateTask(taskId, body);
      if (ok) toast.success(ok);
      task.reload();
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  async function remove() {
    if (!window.confirm('¿Eliminar la tarea y sus subtareas? Esta acción no se puede deshacer.')) return;
    try {
      await api.deleteTask(taskId);
      toast.success('Tarea eliminada');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  const t = task.data;
  return (
    <Modal open title={t ? t.title : 'Tarea'} onClose={onClose} wide>
      {task.loading && !t ? (
        <Loading />
      ) : task.error || !t ? (
        <ErrorState error={task.error} onRetry={task.reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={t.status} />
                {t.blocked && <span className="text-xs font-medium text-amber-700 dark:text-amber-400">⛓ Bloqueada por dependencias</span>}
                {t.parentId && <span className="text-xs text-slate-500">Subtarea de #{t.parentId}</span>}
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{t.description || <em className="text-slate-400">Sin descripción</em>}</p>
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-slate-500">Avance</p>
                <ProgressBar value={t.progress} />
              </div>
            </section>

            {t.parentId === null && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Subtareas</h3>
                  {canEdit && (
                    <Button variant="ghost" onClick={() => setAddingSubtask(true)}>
                      + Subtarea
                    </Button>
                  )}
                </div>
                {t.subtasks.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin subtareas.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
                    {t.subtasks.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          aria-label={`Marcar ${s.title}`}
                          checked={s.status === 'hecha'}
                          disabled={!canEdit}
                          onChange={async () => {
                            try {
                              await api.updateTask(s.id, { status: s.status === 'hecha' ? 'en_progreso' : 'hecha' });
                              task.reload();
                              onChanged();
                            } catch (err) {
                              toast.error(err);
                            }
                          }}
                        />
                        <span className={cn('flex-1', s.status === 'hecha' && 'text-slate-400 line-through')}>{s.title}</span>
                        {s.assigneeName && <Avatar name={s.assigneeName} size="sm" />}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <Dependencies task={t} projectId={projectId} canEdit={canEdit} onChanged={() => { task.reload(); onChanged(); }} />
            <Comments taskId={taskId} members={members} canComment={canComment} />
          </div>

          <aside className="space-y-4">
            <Field label="Estado" htmlFor="d-status">
              <Select id="d-status" value={t.status} disabled={!canEdit} onChange={(e) => patch({ status: e.target.value as TaskStatus }, 'Estado actualizado')}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Prioridad" htmlFor="d-priority">
              <Select id="d-priority" value={t.priority} disabled={!canEdit} onChange={(e) => patch({ priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Responsable" htmlFor="d-assignee">
              <Select
                id="d-assignee"
                value={t.assigneeId ?? ''}
                disabled={!canEdit}
                onChange={(e) => patch({ assigneeId: e.target.value ? Number(e.target.value) : null }, 'Responsable actualizado')}
              >
                <option value="">Sin asignar</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha límite" htmlFor="d-due">
              <Input id="d-due" type="date" value={t.dueDate ?? ''} disabled={!canEdit} onChange={(e) => patch({ dueDate: e.target.value || null })} />
            </Field>
            {labels.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Etiquetas</p>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((l) => {
                    const on = t.labels.some((x) => x.id === l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => patch({ labelIds: on ? t.labels.filter((x) => x.id !== l.id).map((x) => x.id) : [...t.labels.map((x) => x.id), l.id] })}
                        className={cn('rounded-full px-2 py-0.5 text-xs font-medium ring-1', on ? 'text-white ring-transparent' : 'text-slate-600 ring-slate-300 dark:text-slate-300 dark:ring-slate-700')}
                        style={on ? { backgroundColor: l.color } : undefined}
                      >
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <dl className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
              <div className="flex justify-between">
                <dt className="text-slate-500">Estimado</dt>
                <dd>{t.estimatedHours} h</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Registrado</dt>
                <dd>{formatMinutes(t.loggedMinutes)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Inicio</dt>
                <dd>{formatDate(t.startDate)}</dd>
              </div>
            </dl>
            {canLog && <LogTime taskId={taskId} onLogged={() => { task.reload(); onChanged(); }} />}
            {canManage && (
              <Button variant="danger" className="w-full" onClick={remove}>
                Eliminar tarea
              </Button>
            )}
          </aside>
        </div>
      )}
      {t && (
        <TaskFormModal
          open={addingSubtask}
          projectId={projectId}
          members={members}
          labels={labels}
          parentId={t.id}
          onClose={() => setAddingSubtask(false)}
          onCreated={() => {
            task.reload();
            onChanged();
          }}
        />
      )}
    </Modal>
  );
}

function Dependencies({ task, projectId, canEdit, onChanged }: { task: TaskDetail; projectId: number; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState('');
  const candidates = useAsync(() => api.tasks(projectId, { pageSize: 100, sort: 'title' }), [projectId]);
  const options = (candidates.data?.items ?? []).filter((c) => c.id !== task.id && !task.dependsOn.includes(c.id));

  async function add() {
    if (!selected) return;
    try {
      await api.addDependency(task.id, Number(selected));
      setSelected('');
      toast.success('Dependencia agregada');
      onChanged();
    } catch (err) {
      toast.error(err); // p. ej. "La dependencia crearía un ciclo"
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Depende de</h3>
      {task.dependencies.length === 0 ? (
        <p className="text-sm text-slate-500">No depende de otras tareas.</p>
      ) : (
        <ul className="space-y-1">
          {task.dependencies.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <StatusBadge status={d.status} />
              <span className="flex-1">{d.title}</span>
              {canEdit && (
                <button
                  className="text-xs text-rose-600 hover:underline"
                  onClick={async () => {
                    try {
                      await api.removeDependency(task.id, d.id);
                      onChanged();
                    } catch (err) {
                      toast.error(err);
                    }
                  }}
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {task.dependents.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">Bloquea a: {task.dependents.map((d) => d.title).join(', ')}</p>
      )}
      {canEdit && (
        <div className="mt-3 flex gap-2">
          <Select aria-label="Agregar dependencia" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Agregar dependencia...</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={add} disabled={!selected}>
            Agregar
          </Button>
        </div>
      )}
    </section>
  );
}

/** Comentarios con resaltado y autocompletado de @menciones (solo miembros del proyecto). */
function Comments({ taskId, members, canComment }: { taskId: number; members: ProjectMember[]; canComment: boolean }) {
  const toast = useToast();
  const comments = useAsync(() => api.comments(taskId), [taskId]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const query = currentMentionQuery(body);
  const suggestions = query === null ? [] : members.filter((m) => m.username.startsWith(query.toLowerCase())).slice(0, 5);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const created = await api.addComment(taskId, body.trim());
      setBody('');
      if (created.ignoredMentions?.length) toast.info(`No se notificó a: ${created.ignoredMentions.map((u) => '@' + u).join(', ')} (no son miembros)`);
      comments.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Comentarios</h3>
      {comments.loading && !comments.data ? (
        <Loading />
      ) : (
        <ul className="space-y-3">
          {(comments.data ?? []).map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.authorName} size="sm" />
              <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                <p className="text-xs text-slate-500">
                  <strong className="text-slate-700 dark:text-slate-200">{c.authorName}</strong> · {formatDateTime(c.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">
                  {splitMentions(c.body).map((seg, i) =>
                    seg.type === 'mention' ? (
                      <span key={i} className="rounded bg-brand-100 px-1 font-medium text-brand-700 dark:bg-brand-900 dark:text-brand-200">
                        @{seg.value}
                      </span>
                    ) : (
                      <span key={i}>{seg.value}</span>
                    ),
                  )}
                </p>
              </div>
            </li>
          ))}
          {comments.data?.length === 0 && <p className="text-sm text-slate-500">Sé el primero en comentar.</p>}
        </ul>
      )}
      {canComment && (
        <form onSubmit={onSubmit} className="relative mt-3 space-y-2">
          <Textarea rows={2} aria-label="Nuevo comentario" placeholder="Escribe un comentario. Usa @usuario para mencionar." value={body} onChange={(e) => setBody(e.target.value)} />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 rounded-lg bg-white shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              {suggestions.map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={() => setBody((b) => b.replace(/@([A-Za-z0-9_.]*)$/, `@${m.username} `))}
                  >
                    @{m.username} <span className="text-slate-500">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button type="submit" loading={sending} disabled={!body.trim()}>
              Comentar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function LogTime({ taskId, onLogged }: { taskId: number; onLogged: () => void }) {
  const toast = useToast();
  const today = todayISO();
  const [form, setForm] = useState({ workDate: today, hours: '1', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateTimeEntry(form, today);
    setErrors(v as Record<string, string>);
    if (hasErrors(v)) return;
    setSaving(true);
    try {
      await api.logTime(taskId, { workDate: form.workDate, hours: Number(form.hours), note: form.note });
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
    <form onSubmit={onSubmit} noValidate className="space-y-2 rounded-lg p-3 ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-semibold">Registrar horas</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fecha" htmlFor="lt-date" error={errors.workDate}>
          <Input id="lt-date" type="date" max={today} value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} />
        </Field>
        <Field label="Horas" htmlFor="lt-hours" error={errors.hours}>
          <Input id="lt-hours" type="number" min={0.25} max={24} step={0.25} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
        </Field>
      </div>
      <Input aria-label="Nota" placeholder="Nota (opcional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      <Button type="submit" className="w-full" loading={saving}>
        Registrar
      </Button>
    </form>
  );
}
