/**
 * pages/dashboard/tasks/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tarefas — Kanban por dia da semana + Lista agrupada por dia.
 *
 * Coluna ATRASADAS (vermelha) fixa a esquerda + 7 colunas SEG-DOM com data.
 * Navegacao semanal com setas. Coluna do dia atual destacada.
 * Modal de criacao usa o novo CreateTaskModal (separado do TaskDetailModal).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import TaskDetailModal from '../../../components/TaskDetailModal';
import CreateTaskModal from '../../../components/CreateTaskModal';
import styles from '../../../assets/style/tasks.module.css';
import { useNotification } from '../../../context/NotificationContext';
import { useAuth } from '../../../hooks/useAuth';

/* ─────────────────────────────────────────────────────────
   Constantes
───────────────────────────────────────────────────────── */

const PRIORITY_MAP = {
  urgente: { label: 'URG',    cls: 'priorityUrgente' },
  alta:    { label: 'ALTA',   cls: 'priorityAlta'    },
  normal:  { label: 'NORMAL', cls: 'priorityNormal'  },
  baixa:   { label: 'BAIXA',  cls: 'priorityBaixa'   },
};

// Semana brasileira: SEG=1, TER=2, ..., DOM=0
const WEEKDAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const WEEKDAY_FULL   = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
const MONTH_SHORT    = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const SEL_STYLE = {
  padding: '7px 10px',
  background: 'rgba(10,10,10,0.8)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 7,
  color: 'var(--text-primary)',
  fontSize: '0.72rem',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  cursor: 'pointer',
};

const TOGGLE_CONTAINER = {
  display: 'inline-flex',
  background: 'rgba(10,10,10,0.8)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  padding: 3,
  gap: 0,
};

const TOGGLE_BTN_BASE = {
  padding: '5px 14px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.68rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  border: 'none',
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--text-muted)',
  transition: 'all 0.2s',
  borderRadius: 4,
};

const TOGGLE_BTN_ACTIVE = {
  background: 'rgba(255,0,51,0.12)',
  color: '#ff6680',
};

/* ─────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────── */

function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // semana SEG-DOM
  date.setDate(date.getDate() + diff);
  return date;
}

function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

function isoDate(d) {
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayIso() {
  return isoDate(new Date());
}

function todayMs() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t.getTime();
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** Retorna ISO da due_date sem a parte de horas.
 *  due_date é DATE no Postgres (sem TZ); o driver devolve como Date em UTC
 *  midnight. Lemos via UTC pra preservar o dia armazenado, evitando shift
 *  de -1 dia em fusos negativos (ex.: America/Sao_Paulo). */
function taskDueIso(t) {
  if (!t.due_date) return null;
  const d = new Date(t.due_date);
  if (isNaN(d)) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isOverdue(t) {
  if (t.status === 'done') return false;
  const iso = taskDueIso(t);
  if (!iso) return false;
  return iso < todayIso();
}

/* ─────────────────────────────────────────────────────────
   Inline SVG icons
───────────────────────────────────────────────────────── */
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="7" y1="2" x2="7" y2="12" /><line x1="2" y1="7" x2="12" y2="7" />
  </svg>
);

const IconCalendar = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <line x1="2" y1="7" x2="14" y2="7" />
    <line x1="5" y1="1" x2="5" y2="4" />
    <line x1="11" y1="1" x2="11" y2="4" />
  </svg>
);

const IconLock = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="8" width="8" height="6" rx="1" />
    <path d="M6 8V5a2 2 0 0 1 4 0v3" />
  </svg>
);

const IconComment = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5l-3 3V4a1 1 0 0 1 1-1z" />
  </svg>
);

const IconKanban = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="2" width="4" height="12" rx="1" />
    <rect x="6" y="2" width="4" height="8" rx="1" />
    <rect x="11" y="2" width="4" height="10" rx="1" />
  </svg>
);

const IconList = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="4" x2="14" y2="4" />
    <line x1="3" y1="8" x2="14" y2="8" />
    <line x1="3" y1="12" x2="14" y2="12" />
  </svg>
);

const IconChevronL = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const IconChevronR = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconCheck = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconTrash = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);

/* ─────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────── */

function KpiCard({ label, value, color }) {
  return (
    <div className="glass-card" style={{ padding: '16px 20px', flex: 1, minWidth: 140 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700,
        color: color || 'var(--text-primary)', marginBottom: 3,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {label}
      </div>
    </div>
  );
}

function TaskCard({ task, onClick, onDelete, onComplete, notify }) {
  const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.normal;
  const blocked = task.has_pending_deps;
  const overdue = isOverdue(task);
  const done = task.status === 'done';

  function handleClick() {
    if (blocked) {
      notify('Tarefa bloqueada por dependencias pendentes', 'warning');
      return;
    }
    onClick(task.id);
  }

  function handleComplete(e) {
    e.stopPropagation();
    if (blocked) {
      notify('Tarefa bloqueada por dependencias pendentes', 'warning');
      return;
    }
    onComplete && onComplete(task);
  }

  function handleDelete(e) {
    e.stopPropagation();
    onDelete && onDelete(task);
  }

  const cls = [
    styles.taskCard,
    blocked && styles.taskCardBlocked,
    overdue && styles.taskCardOverdue,
    done && styles.taskCardDone,
  ].filter(Boolean).join(' ');

  const dueIso = taskDueIso(task);
  const dueLabel = dueIso ? `${dueIso.slice(8, 10)}/${dueIso.slice(5, 7)}` : null;

  return (
    <div className={cls} onClick={handleClick} title={task.title}>
      {/* Acoes rapidas (visiveis no hover) */}
      <div className={styles.cardActions}>
        {!done && (
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnDone}`}
            onClick={handleComplete}
            title="Concluir tarefa"
          >
            <IconCheck />
          </button>
        )}
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
          onClick={handleDelete}
          title="Excluir tarefa"
        >
          <IconTrash />
        </button>
      </div>

      <div className={styles.taskTitle}>{task.title}</div>
      {task.description && (
        <div className={styles.taskDescription}>{task.description}</div>
      )}
      <div className={styles.taskMeta}>
        {task.category_name && (
          <span
            className={styles.categoryBadge}
            style={{
              background: `${task.category_color || '#525252'}18`,
              border: `1px solid ${task.category_color || '#525252'}40`,
              color: task.category_color || '#525252',
            }}
          >
            {task.category_name}
          </span>
        )}
        <span className={`${styles.taskBadge} ${styles[pri.cls]}`}>
          {pri.label}
        </span>
        {dueLabel && (
          <span className={`${styles.taskDate} ${overdue ? styles.taskDateOverdue : ''}`}>
            <IconCalendar /> {dueLabel}
          </span>
        )}
        {blocked && (
          <span className={styles.lockIcon}><IconLock /></span>
        )}
        {task.comment_count > 0 && (
          <span className={styles.commentCount}>
            <IconComment /> {task.comment_count}
          </span>
        )}
      </div>
      {task.client_name && (
        <div className={styles.taskClient}>{task.client_name}</div>
      )}
      <div className={styles.cardFooter}>
        <span style={{ flex: 1 }} />
        {task.assigned_to_name && (
          <div className={styles.taskAssignee} title={task.assigned_to_name}>
            {getInitials(task.assigned_to_name)}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={TOGGLE_CONTAINER}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            ...TOGGLE_BTN_BASE,
            ...(value === opt.value ? TOGGLE_BTN_ACTIVE : {}),
          }}
        >
          {opt.icon && <span style={{ marginRight: 4, display: 'inline-flex', alignItems: 'center' }}>{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Kanban View
───────────────────────────────────────────────────────── */
function KanbanView({ tasks, weekStart, onTaskClick, onNewTask, onDelete, onComplete, notify }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const todayMillis = todayMs();

  // tasks por dia + atrasadas
  const buckets = useMemo(() => {
    const map = { overdue: [] };
    days.forEach((d) => { map[isoDate(d)] = []; });

    for (const t of tasks) {
      if (isOverdue(t)) {
        map.overdue.push(t);
        continue;
      }
      const iso = taskDueIso(t);
      if (iso && map[iso] !== undefined) {
        map[iso].push(t);
      }
    }
    return map;
  }, [tasks, days]);

  return (
    <div className={styles.kanbanScroll}>
      <div className={styles.kanbanContainer}>
        {/* Coluna ATRASADAS (sempre primeira) */}
        <div className={`${styles.kanbanColumn} ${styles.kanbanColumnOverdue}`}>
          <div className={styles.columnHeader}>
            <span className={styles.columnTitleOverdue}>ATRASADAS</span>
            <span className={`${styles.columnCount} ${styles.columnCountOverdue}`}>
              {buckets.overdue.length}
            </span>
          </div>
          {buckets.overdue.length === 0 ? (
            <div className={styles.columnEmpty}>nenhuma tarefa atrasada</div>
          ) : (
            buckets.overdue.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onClick={onTaskClick}
                onDelete={onDelete}
                onComplete={onComplete}
                notify={notify}
              />
            ))
          )}
        </div>

        {/* 7 colunas dia da semana */}
        {days.map((d) => {
          const iso = isoDate(d);
          const isToday = d.getTime() === todayMillis;
          const colTasks = buckets[iso] || [];
          const wd = WEEKDAY_LABELS[d.getDay()];

          const cls = [
            styles.kanbanColumn,
            isToday && styles.kanbanColumnToday,
          ].filter(Boolean).join(' ');

          return (
            <div key={iso} className={cls}>
              <div className={styles.columnHeader}>
                <div className={styles.columnHeaderInfo}>
                  <span className={`${styles.columnDayLabel} ${isToday ? styles.columnDayLabelToday : ''}`}>
                    {wd}
                  </span>
                  <span className={`${styles.columnDayNumber} ${isToday ? styles.columnDayNumberToday : ''}`}>
                    {d.getDate()}
                  </span>
                  {isToday && <span className={styles.columnTodayBadge}>HOJE</span>}
                </div>
                <span className={styles.columnCount}>{colTasks.length}</span>
              </div>

              {colTasks.length === 0 ? (
                <div className={styles.columnEmpty}>nenhuma tarefa</div>
              ) : (
                colTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onClick={onTaskClick}
                    onDelete={onDelete}
                    onComplete={onComplete}
                    notify={notify}
                  />
                ))
              )}

              <button className={styles.addTaskBtn} onClick={() => onNewTask(iso)}>
                + nova tarefa
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Lista View — agrupada por dia
───────────────────────────────────────────────────────── */
function ListaView({ tasks, weekStart, onTaskClick, onDelete, onComplete, notify }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const todayMillis = todayMs();

  const overdue = useMemo(() => tasks.filter(isOverdue), [tasks]);

  const sections = useMemo(() => {
    const map = {};
    days.forEach((d) => { map[isoDate(d)] = []; });

    for (const t of tasks) {
      if (isOverdue(t)) continue;
      const iso = taskDueIso(t);
      if (iso && map[iso] !== undefined) {
        map[iso].push(t);
      }
    }

    return days.map((d) => ({
      iso: isoDate(d),
      date: d,
      tasks: map[isoDate(d)] || [],
    }));
  }, [tasks, days]);

  function renderRow(t) {
    const blocked = t.has_pending_deps;
    const done = t.status === 'done';
    const pri = PRIORITY_MAP[t.priority] || PRIORITY_MAP.normal;
    return (
      <div
        key={t.id}
        className={`${styles.listRow} ${blocked ? styles.listRowBlocked : ''}`}
        onClick={() => {
          if (blocked) {
            notify('Tarefa bloqueada por dependencias pendentes', 'warning');
            return;
          }
          onTaskClick(t.id);
        }}
      >
        <div className={styles.listRowTitle}>
          {blocked && <span className={styles.lockIcon}><IconLock /></span>}
          <span className={styles.listRowTitleText}>{t.title}</span>
        </div>
        <div className={styles.listRowMeta}>
          {t.category_name && (
            <span
              className={styles.categoryBadge}
              style={{
                background: `${t.category_color || '#525252'}18`,
                border: `1px solid ${t.category_color || '#525252'}40`,
                color: t.category_color || '#525252',
              }}
            >
              {t.category_name}
            </span>
          )}
          <span className={`${styles.taskBadge} ${styles[pri.cls]}`}>{pri.label}</span>
          {t.client_name && <span className={styles.listRowClient}>{t.client_name}</span>}
          {t.assigned_to_name && (
            <div className={styles.taskAssignee} title={t.assigned_to_name}>
              {getInitials(t.assigned_to_name)}
            </div>
          )}
          {!done && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDone}`}
              onClick={(e) => { e.stopPropagation(); onComplete && onComplete(t); }}
              title="Concluir tarefa"
              style={{ opacity: 1 }}
            >
              <IconCheck />
            </button>
          )}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
            onClick={(e) => { e.stopPropagation(); onDelete && onDelete(t); }}
            title="Excluir tarefa"
            style={{ opacity: 1 }}
          >
            <IconTrash />
          </button>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return <div className={styles.emptyBlock}>Nenhuma tarefa nesta semana</div>;
  }

  return (
    <div>
      {/* Atrasadas no topo */}
      {overdue.length > 0 && (
        <div className={styles.listSection}>
          <div className={`${styles.listSectionHeader} ${styles.listSectionHeaderOverdue}`}>
            <span className={`${styles.listSectionLabel} ${styles.listSectionLabelOverdue}`}>
              // ATRASADAS
            </span>
            <span className={styles.listSectionCount}>{overdue.length}</span>
          </div>
          <div className={styles.listSectionBody}>
            {overdue.map(renderRow)}
          </div>
        </div>
      )}

      {/* Secoes por dia */}
      {sections.map((s) => {
        if (s.tasks.length === 0) return null;
        const isToday = s.date.getTime() === todayMillis;
        const wd = WEEKDAY_FULL[s.date.getDay()];
        const dateLabel = `${MONTH_SHORT[s.date.getMonth()]} ${s.date.getDate()}`;
        return (
          <div key={s.iso} className={styles.listSection}>
            <div className={styles.listSectionHeader}>
              <span className={styles.listSectionLabel} style={isToday ? { color: 'var(--brand-500)' } : undefined}>
                {wd.toUpperCase()}
              </span>
              <span className={styles.listSectionDate}>{dateLabel}</span>
              {isToday && <span className={styles.columnTodayBadge}>HOJE</span>}
              <span className={styles.listSectionCount}>{s.tasks.length}</span>
            </div>
            <div className={styles.listSectionBody}>
              {s.tasks.map(renderRow)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Page component
───────────────────────────────────────────────────────── */
export default function TasksPage() {
  const { user, loading: authLoading } = useAuth();
  const { notify } = useNotification();

  /* ── State ── */
  const [scope, setScope] = useState('me');           // me / team
  const [viewMode, setViewMode] = useState('kanban'); // kanban / lista
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ status: '', categoryId: '', clientId: '', assignedTo: '' });
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Modals
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Semana exibida
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  /* ── Fetch helpers ── */
  const fetchTasks = useCallback(async () => {
    try {
      setLoadingTasks(true);
      const params = new URLSearchParams({ view: scope });
      if (filters.status) params.set('status', filters.status);
      if (filters.categoryId) params.set('categoryId', filters.categoryId);
      if (filters.clientId) params.set('clientId', filters.clientId);
      if (filters.assignedTo) params.set('assignedTo', filters.assignedTo);

      const res = await fetch(`/api/tasks?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks || []);
      } else {
        notify('Erro ao carregar tarefas', 'error');
      }
    } catch (err) {
      console.error('[Tasks] fetch error:', err);
      notify('Erro ao carregar tarefas', 'error');
    } finally {
      setLoadingTasks(false);
    }
  }, [scope, filters, notify]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/task-categories');
      const data = await res.json();
      if (data.success) setCategories(data.categories || []);
    } catch (err) {
      console.error('[Tasks] categories fetch error:', err);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      if (data.success) setClients(data.clients || []);
    } catch (err) {
      console.error('[Tasks] clients fetch error:', err);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/users-search');
      const data = await res.json();
      if (data.success) setUsers(data.users || []);
    } catch (err) {
      console.error('[Tasks] users fetch error:', err);
    }
  }, []);

  /* ── Effects ── */
  useEffect(() => {
    fetchCategories();
    fetchClients();
    fetchUsers();
  }, [fetchCategories, fetchClients, fetchUsers]);

  useEffect(() => {
    if (!authLoading) fetchTasks();
  }, [fetchTasks, authLoading]);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const k = { total: 0, pending: 0, inProgress: 0, done: 0, overdue: 0 };
    for (const t of tasks) {
      k.total++;
      if (t.status === 'done') k.done++;
      else if (isOverdue(t)) k.overdue++;
      else if (t.status === 'in_progress') k.inProgress++;
      else k.pending++;
    }
    return k;
  }, [tasks]);

  /* ── Week label ── */
  const weekLabel = useMemo(() => {
    const a = weekStart;
    const b = addDays(weekStart, 6);
    const sameMonth = a.getMonth() === b.getMonth();
    const yearStr = a.getFullYear() === new Date().getFullYear() ? '' : ` ${a.getFullYear()}`;
    if (sameMonth) {
      return `Semana de ${MONTH_SHORT[a.getMonth()]} ${a.getDate()} — ${b.getDate()}${yearStr}`;
    }
    return `Semana de ${MONTH_SHORT[a.getMonth()]} ${a.getDate()} — ${MONTH_SHORT[b.getMonth()]} ${b.getDate()}${yearStr}`;
  }, [weekStart]);

  /* ── Handlers ── */
  function handleFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleTaskClick(taskId) {
    setSelectedTaskId(taskId);
  }

  function handleNewTask() {
    setShowCreateModal(true);
  }

  function handleCloseDetail() {
    setSelectedTaskId(null);
  }

  function handleCloseCreate() {
    setShowCreateModal(false);
  }

  function handleRefresh() {
    fetchTasks();
  }

  function handlePrevWeek() {
    setWeekStart((prev) => addDays(prev, -7));
  }

  function handleNextWeek() {
    setWeekStart((prev) => addDays(prev, 7));
  }

  function handleTodayWeek() {
    setWeekStart(startOfWeek(new Date()));
  }

  async function handleDelete(task) {
    if (!confirm(`Excluir a tarefa "${task.title}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        notify('Tarefa excluída', 'success');
        fetchTasks();
      } else {
        notify(data.error || 'Erro ao excluir', 'error');
      }
    } catch {
      notify('Erro ao excluir tarefa', 'error');
    }
  }

  async function handleComplete(task) {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      const data = await res.json();
      if (data.success) {
        notify('Tarefa concluída', 'success');
        fetchTasks();
      } else {
        notify(data.error || 'Não foi possível concluir', 'error');
      }
    } catch {
      notify('Erro ao concluir tarefa', 'error');
    }
  }

  /* ── Render ── */
  return (
    <DashboardLayout activeTab="tasks">
      <div className={styles.pageContainer}>

        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <h1 className="page-title" style={{ margin: 0, marginBottom: 4 }}>Tarefas</h1>
            <p className="page-subtitle" style={{ margin: 0 }}>
              Gerencie suas tarefas e do time
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <ToggleGroup
              options={[
                { value: 'me',   label: 'Eu' },
                { value: 'team', label: 'Time' },
              ]}
              value={scope}
              onChange={setScope}
            />
            <ToggleGroup
              options={[
                { value: 'kanban', label: 'Kanban', icon: <IconKanban /> },
                { value: 'lista',  label: 'Lista',  icon: <IconList /> },
              ]}
              value={viewMode}
              onChange={setViewMode}
            />
            <button className="sigma-btn-primary" onClick={handleNewTask}>
              <IconPlus /> Nova Tarefa
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <KpiCard label="Total de Tarefas" value={kpis.total} />
          <KpiCard label="Pendentes" value={kpis.pending} color="var(--text-muted)" />
          <KpiCard label="Em Progresso" value={kpis.inProgress} color="var(--info)" />
          <KpiCard label="Concluidas" value={kpis.done} color="var(--success)" />
          <KpiCard
            label="Atrasadas"
            value={kpis.overdue}
            color={kpis.overdue > 0 ? 'var(--error)' : 'var(--text-muted)'}
          />
        </div>

        {/* Filtros */}
        <div className={styles.filtersRow}>
          <select value={filters.status} onChange={(e) => handleFilter('status', e.target.value)} style={SEL_STYLE}>
            <option value="">Todos os status</option>
            <option value="pending">Pendente</option>
            <option value="in_progress">Em Progresso</option>
            <option value="done">Concluida</option>
            <option value="overdue">Atrasada</option>
          </select>

          <select value={filters.categoryId} onChange={(e) => handleFilter('categoryId', e.target.value)} style={SEL_STYLE}>
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select value={filters.clientId} onChange={(e) => handleFilter('clientId', e.target.value)} style={SEL_STYLE}>
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>

          {scope === 'team' && (
            <select value={filters.assignedTo} onChange={(e) => handleFilter('assignedTo', e.target.value)} style={SEL_STYLE}>
              <option value="">Todos os responsaveis</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}

          {(filters.status || filters.categoryId || filters.clientId || filters.assignedTo) && (
            <button
              onClick={() => setFilters({ status: '', categoryId: '', clientId: '', assignedTo: '' })}
              style={{
                padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
                color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
              }}
            >
              Limpar filtros
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Navegacao da semana */}
        <div className={styles.weekNav}>
          <button className={styles.weekNavBtn} onClick={handlePrevWeek} title="Semana anterior">
            <IconChevronL />
          </button>
          <span className={styles.weekNavLabel}>{weekLabel}</span>
          <button className={styles.weekNavToday} onClick={handleTodayWeek}>
            Hoje
          </button>
          <button className={styles.weekNavBtn} onClick={handleNextWeek} title="Proxima semana">
            <IconChevronR />
          </button>
        </div>

        {/* Conteudo */}
        {loadingTasks ? (
          <div style={{
            textAlign: 'center', padding: '64px 0',
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
            color: 'var(--text-muted)', letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            carregando tarefas...
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanView
            tasks={tasks}
            weekStart={weekStart}
            onTaskClick={handleTaskClick}
            onNewTask={handleNewTask}
            onDelete={handleDelete}
            onComplete={handleComplete}
            notify={notify}
          />
        ) : (
          <ListaView
            tasks={tasks}
            weekStart={weekStart}
            onTaskClick={handleTaskClick}
            onDelete={handleDelete}
            onComplete={handleComplete}
            notify={notify}
          />
        )}
      </div>

      {/* Modal de detalhes */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={handleCloseDetail}
          onRefresh={handleRefresh}
          tenantCategories={categories}
          tenantClients={clients}
          tenantUsers={users}
        />
      )}

      {/* Modal de criacao */}
      {showCreateModal && (
        <CreateTaskModal
          onClose={handleCloseCreate}
          onCreated={handleRefresh}
          clients={clients}
          categories={categories}
          users={users}
          currentUserId={user?.id}
        />
      )}
    </DashboardLayout>
  );
}
