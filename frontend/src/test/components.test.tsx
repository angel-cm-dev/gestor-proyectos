import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, buildQuery, toProblem } from '../api/client';
import type { BoardTask } from '../api/types';
import { TaskCard } from '../components/KanbanBoard';
import { ErrorState, Pagination, ProgressBar, StatusBadge } from '../components/ui';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { LoginPage } from '../pages/LoginPage';

afterEach(() => vi.unstubAllGlobals());

describe('componentes de UI', () => {
  it('Pagination deshabilita los extremos y navega', async () => {
    const onPage = vi.fn();
    render(<Pagination page={1} totalPages={3} total={25} onPage={onPage} />);
    expect(screen.getByText(/25 resultados · página 1 de 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('ProgressBar acota el valor entre 0 y 100', () => {
    render(<ProgressBar value={140} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('StatusBadge muestra la etiqueta en español', () => {
    render(<StatusBadge status="en_revision" />);
    expect(screen.getByText('En revisión')).toBeInTheDocument();
  });

  it('ErrorState muestra el detalle del Problem Details y permite reintentar', async () => {
    const retry = vi.fn();
    render(<ErrorState error={new ApiError(422, { title: 'Regla', status: 422, detail: 'Depende de 2 tareas' })} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Depende de 2 tareas');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalled();
  });

  it('TaskCard indica bloqueo, subtareas y etiquetas', () => {
    const task = {
      id: 1,
      title: 'Despliegue',
      status: 'pendiente',
      priority: 'critica',
      labels: [{ id: 1, projectId: 1, name: 'devops', color: '#10b981' }],
      blocked: true,
      subtaskCount: 4,
      subtaskDoneCount: 1,
      progress: 25,
      dueDate: null,
      assigneeName: 'Lucía Ramos',
    } as unknown as BoardTask;
    render(<TaskCard task={task} />);
    expect(screen.getByText(/Bloqueada por dependencias/)).toBeInTheDocument();
    expect(screen.getByText('Subtareas 1/4')).toBeInTheDocument();
    expect(screen.getByText('devops')).toBeInTheDocument();
    expect(screen.getByText('Crítica')).toBeInTheDocument();
  });
});

describe('cliente API', () => {
  it('construye query strings omitiendo vacíos', () => {
    expect(buildQuery({ page: 2, search: '', status: undefined, overdue: true })).toBe('?page=2&overdue=true');
    expect(buildQuery()).toBe('');
  });

  it('convierte respuestas de error en Problem Details aunque no sean JSON', async () => {
    const problem = await toProblem(new Response('oops', { status: 502, statusText: 'Bad Gateway' }));
    expect(problem).toMatchObject({ status: 502, title: 'Bad Gateway' });
  });

  it('ApiError expone errores por campo', () => {
    const err = new ApiError(400, { title: 'Datos inválidos', status: 400, errors: [{ field: 'title', message: 'Mínimo 3' }] });
    expect(err.fieldErrors).toEqual({ title: 'Mínimo 3' });
  });
});

describe('LoginPage', () => {
  const renderLogin = () =>
    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <LoginPage />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

  it('valida antes de llamar a la API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(screen.getByText('Ingresa tu correo')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('muestra un mensaje claro ante credenciales incorrectas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: 'No autenticado', status: 401, detail: 'Credenciales inválidas', code: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      ),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText('Correo'), 'admin@demo.pe');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos'));
  });

  it('los accesos demo rellenan el formulario', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Líder' }));
    expect(screen.getByLabelText('Correo')).toHaveValue('lider@demo.pe');
  });
});
