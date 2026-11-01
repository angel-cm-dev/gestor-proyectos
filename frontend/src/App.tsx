import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { GlobalRole } from './api/types';
import { AppLayout } from './components/AppLayout';
import { Loading } from './components/ui';
import { useAuth } from './context/AuthContext';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TimesheetPage } from './pages/TimesheetPage';
import { UsersPage } from './pages/UsersPage';
import { WorkloadPage } from './pages/WorkloadPage';

/** Protege rutas: sin sesión → login; sin rol suficiente → dashboard. */
function RequireAuth({ children, roles }: { children: ReactNode; roles?: GlobalRole[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Verificando sesión..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="proyectos" element={<ProjectsPage />} />
        <Route path="proyectos/:id" element={<ProjectDetailPage />} />
        <Route path="timesheet" element={<TimesheetPage />} />
        <Route path="notificaciones" element={<NotificationsPage />} />
        <Route
          path="carga"
          element={
            <RequireAuth roles={['admin', 'lider']}>
              <WorkloadPage />
            </RequireAuth>
          }
        />
        <Route
          path="usuarios"
          element={
            <RequireAuth roles={['admin']}>
              <UsersPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
