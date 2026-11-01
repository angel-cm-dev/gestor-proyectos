import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import { PRIORITIES, TASK_STATUSES, type Label, type Priority, type ProjectMember, type TaskStatus } from '../api/types';
import { useToast } from '../context/ToastContext';
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/format';
import { hasErrors, validateTask, type Errors, type TaskForm } from '../lib/validation';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';

interface Props {
  open: boolean;
  projectId: number;
  members: ProjectMember[];
  labels: Label[];
  parentId?: number | null;
  onClose: () => void;
  onCreated: () => void;
}

const EMPTY: TaskForm = {
  title: '',
  description: '',
  status: 'pendiente',
  priority: 'media',
  assigneeId: '',
  estimatedHours: '0',
  startDate: '',
  dueDate: '',
  labelIds: [],
};

/** Formulario de alta de tareas/subtareas con validación en cliente y errores del servidor por campo. */
export function TaskFormModal({ open, projectId, members, labels, parentId, onClose, onCreated }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<TaskForm>(EMPTY);
  const [errors, setErrors] = useState<Errors<TaskForm>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof TaskForm>(k: K, v: TaskForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateTask(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setSaving(true);
    try {
      await api.createTask(projectId, {
        title: form.title,
        description: form.description,
        status: form.status as TaskStatus,
        priority: form.priority as Priority,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
        estimatedHours: Number(form.estimatedHours || 0),
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        parentId: parentId ?? null,
        labelIds: form.labelIds,
      });
      toast.success(parentId ? 'Subtarea creada' : 'Tarea creada');
      setForm(EMPTY);
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors as Errors<TaskForm>);
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={parentId ? 'Nueva subtarea' : 'Nueva tarea'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Título" htmlFor="t-title" error={errors.title}>
          <Input id="t-title" value={form.title} invalid={Boolean(errors.title)} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Descripción" htmlFor="t-desc">
          <Textarea id="t-desc" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estado" htmlFor="t-status">
            <Select id="t-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridad" htmlFor="t-priority">
            <Select id="t-priority" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsable" htmlFor="t-assignee">
            <Select id="t-assignee" value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Horas estimadas" htmlFor="t-hours" error={errors.estimatedHours}>
            <Input id="t-hours" type="number" min={0} step={0.5} value={form.estimatedHours} invalid={Boolean(errors.estimatedHours)} onChange={(e) => set('estimatedHours', e.target.value)} />
          </Field>
          <Field label="Inicio" htmlFor="t-start">
            <Input id="t-start" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Fecha límite" htmlFor="t-due" error={errors.dueDate}>
            <Input id="t-due" type="date" value={form.dueDate} invalid={Boolean(errors.dueDate)} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
        </div>
        {labels.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Etiquetas</legend>
            <div className="flex flex-wrap gap-2">
              {labels.map((l) => {
                const checked = form.labelIds.includes(l.id);
                return (
                  <label key={l.id} className="flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs ring-1 ring-slate-300 dark:ring-slate-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => set('labelIds', checked ? form.labelIds.filter((x) => x !== l.id) : [...form.labelIds, l.id])}
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Crear
          </Button>
        </div>
      </form>
    </Modal>
  );
}
