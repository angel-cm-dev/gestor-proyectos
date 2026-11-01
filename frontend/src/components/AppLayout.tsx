import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { cn, ROLE_LABEL } from '../lib/format';
import { Avatar } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles?: Array<'admin' | 'lider' | 'miembro'>;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { to: '/proyectos', label: 'Proyectos', icon: 'M3 7h18M3 12h18M3 17h12' },
  { to: '/timesheet', label: 'Mis horas', icon: 'M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z' },
  { to: '/carga', label: 'Carga de trabajo', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2', roles: ['admin', 'lider'] },
  { to: '/notificaciones', label: 'Notificaciones', icon: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0' },
  { to: '/usuarios', label: 'Usuarios', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8', roles: ['admin'] },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const location = useLocation();

  // Cierra el menú móvil al navegar y refresca el contador de notificaciones.
  useEffect(() => {
    setOpen(false);
    api
      .notifications({ pageSize: 1, unread: true })
      .then((r) => setUnread(r.unread))
      .catch(() => undefined);
  }, [location.pathname]);

  if (!user) return null;
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Navegación principal">
      <Link to="/" className="mb-4 flex items-center gap-2 px-2 py-1">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <span className="text-base font-semibold">Gestor de Proyectos</span>
      </Link>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            )
          }
        >
          <Icon d={item.icon} />
          <span className="flex-1">{item.label}</span>
          {item.to === '/notificaciones' && unread > 0 && (
            <span className="rounded-full bg-rose-600 px-2 text-xs font-semibold text-white">{unread}</span>
          )}
        </NavLink>
      ))}
      <div className="mt-auto border-t border-slate-200 pt-3 dark:border-slate-800">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-slate-500">
              @{user.username} · {ROLE_LABEL[user.role]}
            </p>
          </div>
        </div>
        <div className="mt-2 flex gap-2 px-2">
          <button
            onClick={toggle}
            className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ring-slate-200 hover:bg-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800"
            aria-label="Cambiar tema"
          >
            {theme === 'dark' ? '☀ Claro' : '☾ Oscuro'}
          </button>
          <button
            onClick={logout}
            className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium text-rose-600 ring-1 ring-slate-200 hover:bg-rose-50 dark:ring-slate-700 dark:hover:bg-rose-950"
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar fija en escritorio */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:block dark:border-slate-800 dark:bg-slate-900">
        {sidebar}
      </aside>

      {/* Sidebar deslizable en móvil */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl dark:bg-slate-900">{sidebar}</aside>
        </div>
      )}

      <div className="flex-1 lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/80">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Abrir menú">
            <Icon d="M3 6h18M3 12h18M3 18h18" />
          </button>
          <span className="font-semibold">Gestor de Proyectos</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
