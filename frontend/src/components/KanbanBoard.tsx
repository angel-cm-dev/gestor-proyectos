import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/endpoints';
import { TASK_STATUSES, type Board, type BoardTask, type TaskStatus } from '../api/types';
import { useToast } from '../context/ToastContext';
import { findColumn, moveCard, type Columns } from '../lib/board';
import { cn, formatDate, isOverdue, STATUS_LABEL } from '../lib/format';
import { Avatar, PriorityBadge } from './ui';

const COLUMN_ID = (s: TaskStatus) => `col-${s}`;
const statusFromColumnId = (id: UniqueIdentifier): TaskStatus | null => {
  const s = String(id).replace('col-', '') as TaskStatus;
  return String(id).startsWith('col-') && TASK_STATUSES.includes(s) ? s : null;
};

function toColumns(board: Board): Columns {
  const cols = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as BoardTask[]])) as Columns;
  for (const c of board.columns) cols[c.status] = c.tasks;
  return cols;
}

interface Props {
  board: Board;
  canEdit: boolean;
  onOpenTask: (id: number) => void;
  onChanged: () => void;
}

/**
 * Tablero kanban con @dnd-kit (accesible con teclado: Tab + Espacio + flechas).
 * Actualización optimista: la tarjeta se mueve al instante y, si el backend
 * rechaza el cambio (dependencias o subtareas pendientes), vuelve a su lugar.
 */
export function KanbanBoard({ board, canEdit, onOpenTask, onChanged }: Props) {
  const toast = useToast();
  const [columns, setColumns] = useState<Columns>(() => toColumns(board));
  const [activeId, setActiveId] = useState<number | null>(null);
  const snapshot = useRef<Columns | null>(null);

  useEffect(() => setColumns(toColumns(board)), [board]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function targetOf(overId: UniqueIdentifier, cols: Columns): { status: TaskStatus; index: number } | null {
    const colStatus = statusFromColumnId(overId);
    if (colStatus) return { status: colStatus, index: cols[colStatus].length };
    const status = findColumn(cols, Number(overId));
    if (!status) return null;
    return { status, index: cols[status].findIndex((t) => t.id === Number(overId)) };
  }

  function onDragStart(e: DragStartEvent) {
    snapshot.current = columns;
    setActiveId(Number(e.active.id));
  }

  // Al cruzar a otra columna se mueve la tarjeta en vivo para que el usuario vea dónde caerá.
  function onDragOver(e: DragOverEvent) {
    if (!e.over) return;
    const id = Number(e.active.id);
    const from = findColumn(columns, id);
    const target = targetOf(e.over.id, columns);
    if (!from || !target || from === target.status) return;
    setColumns((cols) => moveCard(cols, id, target.status, target.index));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const before = snapshot.current;
    snapshot.current = null;
    if (!e.over || !before) return;

    const id = Number(e.active.id);
    const target = targetOf(e.over.id, columns);
    if (!target) return;
    const next = moveCard(columns, id, target.status, target.index);
    const finalIndex = next[target.status].findIndex((t) => t.id === id);
    const original = findColumn(before, id);
    const originalIndex = original ? before[original].findIndex((t) => t.id === id) : -1;
    if (original === target.status && originalIndex === finalIndex) return;

    setColumns(next);
    try {
      await api.moveTask(id, target.status, finalIndex);
      if (original !== target.status) toast.success(`Movida a "${STATUS_LABEL[target.status]}"`);
      onChanged();
    } catch (err) {
      setColumns(before); // revertimos la actualización optimista
      toast.error(err);
    }
  }

  const active = activeId ? Object.values(columns).flat().find((t) => t.id === activeId) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => snapshot.current && setColumns(snapshot.current)}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <Column key={status} status={status} tasks={columns[status]} canEdit={canEdit} onOpenTask={onOpenTask} />
        ))}
      </div>
      <DragOverlay>{active ? <TaskCard task={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, tasks, canEdit, onOpenTask }: { status: TaskStatus; tasks: BoardTask[]; canEdit: boolean; onOpenTask: (id: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: COLUMN_ID(status) });
  return (
    <section
      ref={setNodeRef}
      aria-label={`Columna ${STATUS_LABEL[status]}`}
      className={cn('flex min-h-[12rem] flex-col rounded-xl bg-slate-100 p-3 dark:bg-slate-900/60', isOver && 'ring-2 ring-brand-400')}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{STATUS_LABEL[status]}</h3>
        <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tasks.length}</span>
      </header>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-1 flex-col gap-2">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} disabled={!canEdit} onOpen={() => onOpenTask(t.id)} />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableCard({ task, disabled, onOpen }: { task: BoardTask; disabled: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'opacity-40')} {...attributes} {...listeners}>
      <TaskCard task={task} onOpen={onOpen} />
    </li>
  );
}

export function TaskCard({ task, onOpen, dragging }: { task: BoardTask; onOpen?: () => void; dragging?: boolean }) {
  const overdue = isOverdue(task.dueDate, task.status);
  return (
    <article
      onClick={onOpen}
      className={cn(
        'cursor-pointer rounded-lg bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-300 dark:bg-slate-800 dark:ring-slate-700',
        dragging && 'rotate-2 shadow-lg ring-brand-400',
      )}
    >
      {task.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <span key={l.id} className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white" style={{ backgroundColor: l.color }}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      <p className="font-medium leading-snug">{task.title}</p>
      {task.blocked && (
        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400" title="Tiene dependencias sin terminar">
          ⛓ Bloqueada por dependencias
        </p>
      )}
      {task.subtaskCount > 0 && (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full bg-brand-500" style={{ width: `${task.progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Subtareas {task.subtaskDoneCount}/{task.subtaskCount}
          </p>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={task.priority} />
          {task.dueDate && <span className={cn('text-xs', overdue ? 'font-semibold text-rose-600' : 'text-slate-500')}>{formatDate(task.dueDate)}</span>}
        </div>
        {task.assigneeName && <Avatar name={task.assigneeName} size="sm" />}
      </div>
    </article>
  );
}
