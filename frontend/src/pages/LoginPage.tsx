import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { errorMessage } from '../context/ToastContext';
import { hasErrors, validateLogin, type Errors } from '../lib/validation';

const DEMO = [
  { label: 'Admin', email: 'admin@demo.pe' },
  { label: 'Líder', email: 'lider@demo.pe' },
  { label: 'Miembro', email: 'miembro@demo.pe' },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Errors<typeof form>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateLogin(form);
    setErrors(v);
    setServerError(null);
    if (hasErrors(v)) return;
    setSubmitting(true);
    try {
      await login(form.email, form.password);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError && err.status === 401 ? 'Correo o contraseña incorrectos' : errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-sky-50 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-brand-950">
      <button onClick={toggle} className="absolute right-4 top-4 rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 dark:ring-slate-700" aria-label="Cambiar tema">
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto h-12 w-12" />
          <h1 className="mt-3 text-2xl font-semibold">Gestor de Proyectos</h1>
          <p className="text-sm text-slate-500">Kanban, horas y reportes para tu equipo</p>
        </div>
        <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          {serverError && (
            <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {serverError}
            </div>
          )}
          <Field label="Correo" htmlFor="email" error={errors.email}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              invalid={Boolean(errors.email)}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Contraseña" htmlFor="password" error={errors.password}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              invalid={Boolean(errors.password)}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Button type="submit" className="w-full" loading={submitting}>
            Ingresar
          </Button>
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="mb-2 text-xs text-slate-500">Cuentas demo (contraseña Demo123!):</p>
            <div className="flex flex-wrap gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => setForm({ email: d.email, password: 'Demo123!' })}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
