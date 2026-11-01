import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/endpoints';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { cn, formatDateTime } from '../lib/format';

export function NotificationsPage() {
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const list = useAsync(() => api.notifications({ page, pageSize: 15, unread: unreadOnly || undefined }), [page, unreadOnly]);

  async function markAll() {
    try {
      const r = await api.markAllRead();
      toast.success(`${r.updated} notificación(es) marcadas como leídas`);
      list.reload();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Notificaciones"
        subtitle="Menciones y asignaciones"
        actions={
          <Button variant="secondary" onClick={markAll} disabled={!list.data?.unread}>
            Marcar todas como leídas
          </Button>
        }
      />
      <Card>
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} /> Solo no leídas
        </label>
        {list.loading && !list.data ? (
          <Loading />
        ) : list.error || !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="No tienes notificaciones" description="Cuando alguien te mencione con @ o te asigne una tarea, aparecerá aquí." />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.data.items.map((n) => (
                <li key={n.id} className={cn('flex items-start gap-3 py-3', !n.readAt && 'font-medium')}>
                  <Badge className={n.type === 'mencion' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'}>
                    {n.type === 'mencion' ? '@ mención' : 'asignación'}
                  </Badge>
                  <div className="flex-1">
                    {n.projectId && n.taskId ? (
                      <Link
                        to={`/proyectos/${n.projectId}?tarea=${n.taskId}`}
                        onClick={() => !n.readAt && api.markRead(n.id).catch(() => undefined)}
                        className="hover:text-brand-600"
                      >
                        {n.message}
                      </Link>
                    ) : (
                      <p>{n.message}</p>
                    )}
                    <p className="text-xs font-normal text-slate-500">{formatDateTime(n.createdAt)}</p>
                  </div>
                  {!n.readAt && (
                    <button
                      className="text-xs font-normal text-brand-600 hover:underline"
                      onClick={async () => {
                        await api.markRead(n.id).catch(toast.error);
                        list.reload();
                      }}
                    >
                      Marcar leída
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
