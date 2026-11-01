import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import { PROJECT_STATUSES, type ProjectStatus } from '../api/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  ProgressBar,
  ProjectStatusBadge,
  Select,
  Table,
  Td,
  Textarea,
  Th,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebounce } from '../hooks/useAsync';
import { formatDate, PROJECT_STATUS_LABEL, ROLE_LABEL } from '../lib/format';
import { hasErrors, validateProject, type Errors, type ProjectForm } from '../lib/validation';

export function ProjectsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounce(search);
  const [sortField, order] = sort.split(':');

  const { data, error, loading, reload } = useAsync(
    () => api.projects({ page, pageSize: 10, search: debounced, status, sort: sortField, order }),
    [page, debounced, status, sort],
  );
  const canCreate = user?.role === 'admin' || user?.role === 'lider';

  return (
    <>
      <PageHeader
        title="Proyectos"
        subtitle="Proyectos en los que participas"
        actions={canCreate && <Button onClick={() => setCreating(true)}>+ Nuevo proyecto</Button>}
      />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Input
            placeholder="Buscar por nombre o descripción..."
            aria-label="Buscar proyectos"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="createdAt:desc">Más recientes</option>
            <option value="name:asc">Nombre (A-Z)</option>
            <option value="endDate:asc">Fecha de fin</option>
            <option value="status:asc">Estado</option>
          </Select>
        </div>

        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="No hay proyectos" description={search || status ? 'Prueba con otros filtros.' : 'Aún no participas en ningún proyecto.'} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Proyecto</Th>
                  <Th>Estado</Th>
                  <Th className="w-48">Avance</Th>
                  <Th>Tareas</Th>
                  <Th>Equipo</Th>
                  <Th>Fin</Th>
                  <Th>Mi rol</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <Td>
                      <Link to={`/proyectos/${p.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                        {p.name}
                      </Link>
                      <p className="max-w-xs truncate text-xs text-slate-500">{p.description}</p>
                    </Td>
                    <Td>
                      <ProjectStatusBadge status={p.status} />
                    </Td>
                    <Td>
                      <ProgressBar value={p.progress} />
                    </Td>
                    <Td>
                      {p.doneCount}/{p.taskCount}
                    </Td>
                    <Td>{p.memberCount}</Td>
                    <Td>{formatDate(p.endDate)}</Td>
                    <Td>{p.myRole ? ROLE_LABEL[p.myRole] : <span className="text-slate-400">Admin</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <ProjectFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function ProjectFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const empty: ProjectForm = { name: '', description: '', status: 'activo', startDate: '', endDate: '' };
  const [form, setForm] = useState<ProjectForm>(empty);
  const [errors, setErrors] = useState<Errors<ProjectForm>>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateProject(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setSaving(true);
    try {
      const project = await api.createProject({
        name: form.name,
        description: form.description,
        status: form.status as ProjectStatus,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      });
      toast.success('Proyecto creado');
      setForm(empty);
      onClose();
      navigate(`/proyectos/${project.id}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors as Errors<ProjectForm>);
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Nuevo proyecto" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Nombre" htmlFor="p-name" error={errors.name}>
          <Input id="p-name" value={form.name} invalid={Boolean(errors.name)} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Descripción" htmlFor="p-desc">
          <Textarea id="p-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estado" htmlFor="p-status">
            <Select id="p-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Inicio" htmlFor="p-start">
            <Input id="p-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="Fin" htmlFor="p-end" error={errors.endDate}>
            <Input id="p-end" type="date" value={form.endDate} invalid={Boolean(errors.endDate)} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Crear proyecto
          </Button>
        </div>
      </form>
    </Modal>
  );
}
