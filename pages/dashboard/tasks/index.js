/**
 * pages/dashboard/tasks/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tarefas — 3 modos de visualizacao: Kanban, Lista e Semana.
 * Filtros por status, categoria, cliente e responsavel (modo Time).
 * Toggle de scope Eu / Time + toggle de view Kanban / Lista / Semana.
 * KPIs consolidados no topo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import TaskDetailModal from '../../../components/TaskDetailModal';
import styles from '../../../assets/style/tasks.module.css';
import { useNotification } from '../../../context/NotificationContext';
import { useAuth } from '../../../hooks/useAuth';

/* ─────────────────────────────────────────────────────────
   Constantes
───────────────────────────────────────────────────────── */
const COLUMNS = [
  { key: 'pending',     label: 'Pendentes',    colorVar: 'var(--text-muted)' },
  { key: 'in_progress', label: 'Em Progresso', colorVar: 'var(--info)'       },
  { key: 'done',        label: 'Concluidas',   colorVar: 'var(--success)'    },
  { key: 'overdue',     label: 'Atrasadas',    colorVar: 'var(--error)'      },
];

const PRIORITY_MAP = {
  urgente: { label: 'URG',    cls: 'priorityUrgente' },
  alta:    { label: 'ALTA',   cls: 'priorityAlta'    },
  normal:  { label: 'NORMAL', cls: 'priorityNormal'  },
  baixa:   { label: 'BAIXA',  cls: 'priorityBaixa'   },
};

const STATUS_CFG = {
  pending:     { label: 'Pendente',     bg: 'rgba(115,115,115,0.1)',  border: 'rgba(115,115,115,0.25)', color: '#737373'       },
  in_progress: { label: 'Em Progresso', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.25)',  color: 'var(--info)'   },
  done:        { label: 'Concluida',    bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.25)',   color: 'var(--success)'},
  overdue:     { label: 'Atrasada',     bg: 'rgba(255,0,51,0.1)',     border: 'rgba(255,0,51,0.25)',    color: 'var(--error)'  },
};

const WEEKDAYS = [
  { key: 1, label: 'Segunda' },
  { key: 2, label: 'Terca'   },
  { key: 3, label: 'Quarta'  },
  { key: 4, label: 'Quinta'  },
  { key: 5, label: 'Sexta'   },
  { key: 6, label: 'Sabado'  },
  { key: 0, label: 'Domingo' },
];

const SEL = {
  padding: '7px 10px', background: 'rgba(10,10,10,0.8)',
  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7,
  color: 'var(--text-primary)', fontSize: '0.72rem',
  fontFamily: 'var(--font-mono)', outline: 'none', cursor: 'pointer',
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
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/** Classifica tasks em colunas — overdue derivado client-side */
function classifyTasks(tasks) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const buckets = { pending: [], in_progress: [], done: [], overdue: [] };

  for (const t of tasks) {
    if (t.status === 'done') {
      buckets.done.push(t);
      continue;
    }

    const isOverdue =
      t.due_date &&
      new Date(t.due_date) < now &&
      t.status !== 'done';

    if (isOverdue) {
      buckets.overdue.push(t);
    } else if (t.status === 'in_progress') {
      buckets.in_progress.push(t);
    } else {
      buckets.pending.push(t);
    }
  }
  return buckets;
}

/** Agrupa tasks por dia da semana do due_date */
function groupByWeekday(tasks) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const groups = {};
  WEEKDAYS.forEach(wd => { groups[wd.key] = []; });
  groups['none'] = [];

  for (const t of tasks) {
    if (!t.due_date) {
      groups['none'].push(t);
    } else {
      const day = new Date(t.due_date).getDay();
      if (groups[day]) {
        groups[day].push(t);
      } else {
        groups['none'].push(t);
      }
    }
  }
  return groups;
}

/** Retorna status efetivo (com overdue derivado) */
function effectiveStatus(task) {
  if (task.status === 'done') return 'done';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (task.due_date && new Date(task.due_date) < now) return 'overdue';
  return task.status || 'pending';
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

const IconFlag = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v13" /><path d="M3 2h8l-2 3 2 3H3" />
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
    <circle cx="1" cy="4" r="0.5" fill="currentColor" />
    <circle cx="1" cy="8" r="0.5" fill="currentColor" />
    <circle cx="1" cy="12" r="0.5" fill="currentColor" />
  </svg>
);

const IconWeek = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="11" rx="1.5" />
    <line x1="1" y1="7" x2="15" y2="7" />
    <line x1="5.5" y1="3" x2="5.5" y2="14" />
    <line x1="10.5" y1="3" x2="10.5" y2="14" />
  </svg>
);

/* ─────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────── */

/** KPI card — follows financeiro pattern with glass-card + inline styles */
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

/** Single task card (used in Kanban + Semana views) */
function TaskCard({ task, onClick }) {
  const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.normal;
  const blocked = task.has_pending_deps;

  return (
    <div
      className={`${styles.taskCard} ${blocked ? styles.taskCardBlocked : ''}`}
      onClick={() => !blocked && onClick(task.id)}
      title={blocked ? 'Task bloqueada por dependencias pendentes' : task.title}
    >
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
        {task.due_date && (
          <span className={styles.taskDate}>
            <IconCalendar /> {formatDate(task.due_date)}
          </span>
        )}
        <span className={`${styles.taskBadge} ${styles[pri.cls]}`}>
          <IconFlag /> {pri.label}
        </span>
        {blocked && (
          <span className={styles.lockIcon}><IconLock /></span>
        )}
        {task.comment_count > 0 && (
          <span className={styles.commentCount}>
            <IconComment /> {task.comment_count}
          </span>
        )}
      </div>
      {task.assigned_to_name && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <div className={styles.taskAssignee} title={task.assigned_to_name}>
            {getInitials(task.assigned_to_name)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Kanban column */
function KanbanColumn({ column, tasks, onTaskClick, onNewTask }) {
  return (
    <div className={styles.kanbanColumn}>
      <div className={styles.columnHeader}>
        <span className={styles.columnTitle} style={{ color: column.colorVar }}>
          {column.label}
        </span>
        <span className={styles.columnCount}>{tasks.length}</span>
      </div>
      {tasks.map(t => (
        <TaskCard key={t.id} task={t} onClick={onTaskClick} />
      ))}
      {tasks.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '24px 8px',
          color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem', letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          nenhuma task
        </div>
      )}
      <button className={styles.addTaskBtn} onClick={onNewTask}>
        + nova task
      </button>
    </div>
  );
}

/** Toggle button group */
function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={TOGGLE_CONTAINER}>
      {options.map(opt => (
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
   VIEW: Lista (Table)
───────────────────────────────────────────────────────── */
function ListaView({ tasks, onTaskClick }) {
  if (tasks.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
          color: 'var(--text-muted)', letterSpacing: '0.04em',
        }}>
          Nenhuma task encontrada.
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              {['Titulo', 'Cliente', 'Responsavel', 'Data', 'Prioridade', 'Categoria', 'Status'].map(h => (
                <th key={h} style={{
                  padding: '9px 14px', textAlign: 'left',
                  fontFamily: 'var(--font-mono)', fontSize: '0.57rem', color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map(task => {
              const eff = effectiveStatus(task);
              const stCfg = STATUS_CFG[eff] || STATUS_CFG.pending;
              const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.normal;
              const blocked = task.has_pending_deps;

              return (
                <tr
                  key={task.id}
                  onClick={() => !blocked && onTaskClick(task.id)}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.025)',
                    cursor: blocked ? 'not-allowed' : 'pointer',
                    opacity: blocked ? 0.45 : 1,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!blocked) e.currentTarget.style.background = 'rgba(255,0,51,0.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Titulo */}
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {blocked && <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}><IconLock /></span>}
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                        color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap',
                      }}>
                        {task.title}
                      </span>
                    </div>
                  </td>

                  {/* Cliente */}
                  <td style={{
                    padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                    color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                  }}>
                    {task.client_name || '—'}
                  </td>

                  {/* Responsavel */}
                  <td style={{ padding: '10px 14px' }}>
                    {task.assigned_to_name ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className={styles.taskAssignee} title={task.assigned_to_name}>
                          {getInitials(task.assigned_to_name)}
                        </div>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                          color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                        }}>
                          {task.assigned_to_name}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>

                  {/* Data */}
                  <td style={{
                    padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                    color: eff === 'overdue' ? 'var(--error)' : 'var(--text-secondary)', whiteSpace: 'nowrap',
                  }}>
                    {task.due_date ? formatDate(task.due_date) : '—'}
                  </td>

                  {/* Prioridade */}
                  <td style={{ padding: '10px 14px' }}>
                    <span className={`${styles.taskBadge} ${styles[pri.cls]}`}>
                      {pri.label}
                    </span>
                  </td>

                  {/* Categoria */}
                  <td style={{ padding: '10px 14px' }}>
                    {task.category_name ? (
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
                    ) : (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 9px', borderRadius: 20,
                      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                      background: stCfg.bg, border: `1px solid ${stCfg.border}`, color: stCfg.color,
                    }}>
                      {stCfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   VIEW: Semana (grouped by weekday)
───────────────────────────────────────────────────────── */
function SemanaView({ tasks, onTaskClick }) {
  const groups = useMemo(() => groupByWeekday(tasks), [tasks]);

  const sections = [
    ...WEEKDAYS.map(wd => ({ key: wd.key, label: wd.label, tasks: groups[wd.key] || [] })),
    { key: 'none', label: 'Sem data', tasks: groups['none'] || [] },
  ];

  const hasTasks = sections.some(s => s.tasks.length > 0);

  if (!hasTasks) {
    return (
      <div className="glass-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
          color: 'var(--text-muted)', letterSpacing: '0.04em',
        }}>
          Nenhuma task encontrada.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sections.map(section => {
        if (section.tasks.length === 0) return null;
        return (
          <div key={section.key}>
            {/* Section header with "//" prefix */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700,
                color: 'var(--text-primary)', letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                // {section.label}
              </div>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 10,
              }}>
                {section.tasks.length}
              </span>
            </div>

            {/* Glass-card container for the weekday */}
            <div className="glass-card" style={{ padding: 14 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 12,
              }}>
                {section.tasks.map(t => (
                  <TaskCard key={t.id} task={t} onClick={onTaskClick} />
                ))}
              </div>
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
  const [scope, setScope] = useState('me');           // eu / time
  const [viewMode, setViewMode] = useState('kanban');  // kanban / lista / semana
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ status: '', categoryId: '', clientId: '', assignedTo: '' });
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showNewTask, setShowNewTask] = useState(false);

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
        notify('Erro ao carregar tasks', 'error');
      }
    } catch (err) {
      console.error('[Tasks] fetch error:', err);
      notify('Erro ao carregar tasks', 'error');
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

  /* ── Derived data ── */
  const buckets = useMemo(() => classifyTasks(tasks), [tasks]);
  const kpis = useMemo(() => ({
    total:      tasks.length,
    pending:    buckets.pending.length,
    inProgress: buckets.in_progress.length,
    done:       buckets.done.length,
    overdue:    buckets.overdue.length,
  }), [tasks, buckets]);

  /* ── Filter handler ── */
  function handleFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  /* ── Modal handlers ── */
  function handleTaskClick(taskId) {
    setSelectedTaskId(taskId);
  }

  function handleNewTask() {
    setShowNewTask(true);
  }

  function handleCloseModal() {
    setSelectedTaskId(null);
    setShowNewTask(false);
  }

  function handleRefresh() {
    fetchTasks();
  }

  /* ── Render ── */
  return (
    <DashboardLayout activeTab="tasks">
      <div className={styles.pageContainer}>

        {/* ── Header Row ── */}
        <div className={styles.headerRow}>
          <div>
            <h1 className="page-title" style={{ margin: 0, marginBottom: 4 }}>Tarefas</h1>
            <p className="page-subtitle" style={{ margin: 0 }}>
              Gerencie suas tarefas e do time
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Scope toggle: Eu / Time */}
            <ToggleGroup
              options={[
                { value: 'me',   label: 'Eu' },
                { value: 'team', label: 'Time' },
              ]}
              value={scope}
              onChange={setScope}
            />
            {/* View mode toggle: Kanban / Lista / Semana */}
            <ToggleGroup
              options={[
                { value: 'kanban', label: 'Kanban', icon: <IconKanban /> },
                { value: 'lista',  label: 'Lista',  icon: <IconList /> },
                { value: 'semana', label: 'Semana', icon: <IconWeek /> },
              ]}
              value={viewMode}
              onChange={setViewMode}
            />
            <button className="sigma-btn-primary" onClick={handleNewTask}>
              <IconPlus /> Nova Task
            </button>
          </div>
        </div>

        {/* ── KPI Row ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <KpiCard label="Total de Tasks" value={kpis.total} />
          <KpiCard label="Pendentes" value={kpis.pending} color="var(--text-muted)" />
          <KpiCard label="Em Progresso" value={kpis.inProgress} color="var(--info)" />
          <KpiCard label="Concluidas" value={kpis.done} color="var(--success)" />
        </div>

        {/* ── Filters Row ── */}
        <div className={styles.filtersRow}>
          <select
            value={filters.status}
            onChange={e => handleFilter('status', e.target.value)}
            style={SEL}
          >
            <option value="">Todos os status</option>
            <option value="pending">Pendente</option>
            <option value="in_progress">Em Progresso</option>
            <option value="done">Concluida</option>
            <option value="overdue">Atrasada</option>
          </select>

          <select
            value={filters.categoryId}
            onChange={e => handleFilter('categoryId', e.target.value)}
            style={SEL}
          >
            <option value="">Todas as categorias</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={filters.clientId}
            onChange={e => handleFilter('clientId', e.target.value)}
            style={SEL}
          >
            <option value="">Todos os clientes</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>

          {scope === 'team' && (
            <select
              value={filters.assignedTo}
              onChange={e => handleFilter('assignedTo', e.target.value)}
              style={SEL}
            >
              <option value="">Todos os responsaveis</option>
              {users.map(u => (
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
              Limpar filtros x
            </button>
          )}

          <div style={{
            marginLeft: 'auto', fontFamily: 'var(--font-mono)',
            fontSize: '0.62rem', color: 'var(--text-muted)',
          }}>
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* ── Content ── */}
        {loadingTasks ? (
          <div style={{
            textAlign: 'center', padding: '64px 0',
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
            color: 'var(--text-muted)', letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            carregando tasks...
          </div>
        ) : (
          <>
            {/* Kanban View */}
            {viewMode === 'kanban' && (
              <div className={styles.kanbanContainer}>
                {COLUMNS.map(col => (
                  <KanbanColumn
                    key={col.key}
                    column={col}
                    tasks={buckets[col.key] || []}
                    onTaskClick={handleTaskClick}
                    onNewTask={handleNewTask}
                  />
                ))}
              </div>
            )}

            {/* Lista View */}
            {viewMode === 'lista' && (
              <ListaView tasks={tasks} onTaskClick={handleTaskClick} />
            )}

            {/* Semana View */}
            {viewMode === 'semana' && (
              <SemanaView tasks={tasks} onTaskClick={handleTaskClick} />
            )}
          </>
        )}
      </div>

      {/* ── Task Detail Modal ── */}
      {(selectedTaskId || showNewTask) && (
        <TaskDetailModal
          taskId={showNewTask ? null : selectedTaskId}
          onClose={handleCloseModal}
          onRefresh={handleRefresh}
          tenantCategories={categories}
          tenantClients={clients}
        />
      )}
    </DashboardLayout>
  );
}
