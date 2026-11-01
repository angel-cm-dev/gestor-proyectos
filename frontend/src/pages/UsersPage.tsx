import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { GlobalRole } from '../api/types';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Pagination, Select, Table, Td, Th } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebounce } from '../hooks/useAsync';
import { ROLE_LABEL } from '../lib/format';
import { hasErrors, validateUser, type Errors, type UserForm } from '../lib/validation';

const ROLES: GlobalRole[] = ['admin', 'lider', 'miembro'];

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounce(search);
  const users = useAsync(() => api.users({ page, pageSize: 10, search: debounced, role }), [page, debounced, role]);

  async function update(id: number, body: Parameters<typeof api.updateUser>[1]) {
    try {
      await api.updateUser(id, body);
      toast.success('Usuario actualizado');
      users.reload();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Gestión de cuentas y roles globales" actions={<Button onClick={() => setCreating(true)}>+ Nuevo usuario</Button>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Input className="sm:col-span-2" placeholder="Buscar por nombre, correo o usuario..." aria-label="Buscar usuarios" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <Select aria-label="Filtrar por rol" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </div>
        {users.loading && !users.data ? (
          <Loading />
        ) : users.error || !users.data ? (
          <ErrorState error={users.error} onRetry={users.reload} />
        ) : users.data.items.length === 0 ? (
          <EmptyState title="Sin resultados" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Usuario</Th>
                  <Th>Correo</Th>
                  <Th>Rol</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.data.items.map((u) => (
                  <tr key={u.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} size="sm" />
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-slate-500">@{u.username}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{u.email}</Td>
                    <Td>
                      <Select aria-label={`Rol de ${u.name}`} className="w-40" value={u.role} disabled={u.id === me?.id} onChange={(e) => update(u.id, { role: e.target.value })}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Badge className={u.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800'}>
                          {u.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                        {u.id !== me?.id && (
                          <button className="text-xs text-brand-600 hover:underline" onClick={() => update(u.id, { active: !u.active })}>
                            {u.active ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={users.data.page} totalPages={users.data.totalPages} total={users.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <UserFormModal open={creating} onClose={() => setCreating(false)} onCreated={users.reload} />
    </>
  );
}

function UserFormModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const empty: UserForm = { name: '', email: '', username: '', password: '', role: 'miembro' };
  const [form, setForm] = useState<UserForm>(empty);
  const [errors, setErrors] = useState<Errors<UserForm>>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateUser(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setSaving(true);
    try {
      await api.createUser(form);
      toast.success('Usuario creado');
      setForm(empty);
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors as Errors<UserForm>);
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const input = (key: keyof UserForm, label: string, type = 'text') => (
    <Field label={label} htmlFor={`u-${key}`} error={errors[key]}>
      <Input id={`u-${key}`} type={type} value={form[key]} invalid={Boolean(errors[key])} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  );

  return (
    <Modal open={open} title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {input('name', 'Nombre completo')}
        <div className="grid gap-4 sm:grid-cols-2">
          {input('email', 'Correo', 'email')}
          {input('username', 'Usuario (para @menciones)')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {input('password', 'Contraseña temporal', 'password')}
          <Field label="Rol" htmlFor="u-role">
            <Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Crear usuario
          </Button>
        </div>
      </form>
    </Modal>
  );
}
