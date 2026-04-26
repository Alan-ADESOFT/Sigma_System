/**
 * pages/dashboard/overview/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Visão Geral — painel pessoal do usuário logado.
 *
 *   • Saudação dinâmica + KPIs do dia
 *   • Ações rápidas (criar tarefa, criar reunião, ir para tarefas)
 *   • Tarefas de hoje (coluna esquerda) e Reuniões de hoje (direita)
 *   • Tabela das últimas 10 tarefas adicionadas
 *
 * Tudo escopado para o user.id (cookie de sessão) + tenant_id.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../components/DashboardLayout';
import TaskDetailModal from '../../../components/TaskDetailModal';
import CreateTaskModal from '../../../components/CreateTaskModal';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/overview.module.css';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h >= 5  && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function firstName(name) {
  if (!name) return '';
  return String(name).trim().split(/\s+/)[0];
}

function fmtTime(t) {
  if (!t) return '';
  // t pode vir como "10:00:00" ou "10:00"
  return String(t).slice(0, 5);
}

function fmtDateBR(iso) {
  if (!iso) return '—';
  const s = String(iso).split('T')[0];
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function fmtDateTimeBR(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const PRIORITY_LABEL = {
  urgente: 'URGENTE',
  alta:    'ALTA',
  normal:  'NORMAL',
  baixa:   'BAIXA',
};

function priorityClass(p) {
  return styles[`priority${(p || 'normal').charAt(0).toUpperCase()}${(p || 'normal').slice(1)}`] || styles.priorityNormal;
}

const STATUS_LABEL = {
  pending:     'Pendente',
  in_progress: 'Em prog.',
  done:        'Concluído',
  overdue:     'Atrasada',
};

function statusClass(s) {
  if (s === 'in_progress') return styles.statusInProgress;
  if (s === 'done')        return styles.statusDone;
  if (s === 'overdue')     return styles.statusOverdue;
  return styles.statusPending;
}

/* ── Sub-componentes ─────────────────────────────────────────────────────── */

function SectionHeader({ tag, title, line = true }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className={styles.sectionHeader}>
        <span className="label-micro" style={{ color: '#ff0033' }}>
          {tag}
        </span>
        <div className={line ? styles.sectionLine : styles.sectionLineMuted} />
      </div>
      <h2 className="page-title" style={{ fontSize: '1rem', marginBottom: 0 }}>
        {title}
      </h2>
    </div>
  );
}

function KpiCard({ label, value, sub, tone, pulse }) {
  const toneClass =
    tone === 'success' ? styles.kpiSuccess :
    tone === 'info'    ? styles.kpiInfo    :
    tone === 'warning' ? styles.kpiWarning :
    tone === 'error'   ? styles.kpiError   : '';

  return (
    <div className={`glass-card ${styles.kpiCard} ${pulse ? styles.kpiPulse : ''}`}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={`${styles.kpiValue} ${toneClass}`}>{value}</span>
      {sub && <span className={styles.kpiSub}>{sub}</span>}
    </div>
  );
}

function TaskItem({ task, onClick }) {
  const isDone     = task.status === 'done';
  const isOverdue  = task.status === 'overdue';
  const isBlocked  = task.has_pending_deps && !isDone;
  const subTotal   = Number(task.subtasks_total) || 0;
  const subDone    = Number(task.subtasks_done)  || 0;

  return (
    <div
      className={[
        'glass-card',
        styles.taskCard,
        isDone ? styles.taskCardDone : '',
        isOverdue ? styles.taskCardOverdue : '',
        isBlocked ? styles.taskCardBlocked : '',
      ].join(' ')}
      onClick={() => !isBlocked && onClick?.(task)}
      role="button"
      tabIndex={isBlocked ? -1 : 0}
    >
      <div className={styles.taskHeader}>
        <div className={styles.taskTitle}>{task.title}</div>
        <span className={`${styles.priorityBadge} ${priorityClass(task.priority)}`}>
          {PRIORITY_LABEL[task.priority] || 'NORMAL'}
        </span>
      </div>

      <div className={styles.taskMeta}>
        {task.category_name && (
          <span className={styles.categoryChip}>
            <span
              className={styles.categoryDot}
              style={{ background: task.category_color || '#6366f1' }}
            />
            {task.category_name}
          </span>
        )}
        {task.client_name && (
          <span className={styles.subtasksInfo}>· {task.client_name}</span>
        )}
        {subTotal > 0 && (
          <span className={styles.subtasksInfo}>
            ☐ {subDone}/{subTotal} subtasks
          </span>
        )}
        {isBlocked && (
          <span className={styles.blockedBadge}>🔒 Bloqueada</span>
        )}
      </div>
    </div>
  );
}

function MeetingItem({ meeting }) {
  const startEnd = meeting.end_time
    ? `${fmtTime(meeting.start_time)} – ${fmtTime(meeting.end_time)}`
    : fmtTime(meeting.start_time);

  return (
    <div className={`glass-card ${styles.meetingCard}`}>
      <div className={styles.meetingHeader}>
        <div className={styles.meetingTime}>{fmtTime(meeting.start_time)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.meetingTitle}>{meeting.title}</div>
          <div className={styles.meetingClient}>
            {meeting.client_name ? `com ${meeting.client_name}` : 'Reunião interna'}
          </div>
        </div>
      </div>
      <div className={styles.meetingFooter}>
        <span>⏱ {startEnd}</span>
        {meeting.participants_count > 0 && (
          <span>👥 {meeting.participants_count} participante{meeting.participants_count > 1 ? 's' : ''}</span>
        )}
        {meeting.meet_link && (
          <a
            href={meeting.meet_link}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.meetingLink}
          >
            🔗 Entrar
          </a>
        )}
      </div>
    </div>
  );
}

/* ─── Skeletons ──────────────────────────────────────────────────────────── */

function KpiSkeleton() {
  return (
    <div className={`glass-card ${styles.kpiCard}`}>
      <div className={styles.skel} style={{ width: '60%', height: 9 }} />
      <div className={styles.skel} style={{ width: '40%', height: 22, marginTop: 4 }} />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className={`glass-card ${styles.taskCard}`}>
      <div className={styles.skel} style={{ width: '70%', height: 12 }} />
      <div className={styles.skel} style={{ width: '40%', height: 9, marginTop: 8 }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMERCIAL EM DESTAQUE — 3 cards horizontais com KPIs do módulo comercial
═══════════════════════════════════════════════════════════════════════════ */

function ComercialHighlight() {
  const router = useRouter();
  const [kpis, setKpis] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/comercial/dashboard/kpis?period=month')
      .then(r => r.json())
      .then(j => { if (j.success) setKpis(j.kpis); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;
  if (!kpis) return null;

  function fmtBRL(n) {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
  }

  return (
    <div>
      <div className={styles.sectionHeader}>
        <span className="label-micro" style={{ color: '#ff0033' }}>○ COMERCIAL EM DESTAQUE</span>
        <div className={styles.sectionLine} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div
          className="glass-card glass-card-hover"
          style={{ padding: 18, cursor: 'pointer' }}
          onClick={() => router.push('/dashboard/comercial/captacao')}
        >
          <div className="kpi-label">Leads captados (mês)</div>
          <div className="kpi-value">{kpis.leadsCapturedMonth || 0}</div>
          <div className="kpi-label" style={{ opacity: 0.7 }}>{kpis.leadsImportedMonth || 0} no pipeline</div>
        </div>
        <div
          className="glass-card glass-card-hover"
          style={{ padding: 18, cursor: 'pointer' }}
          onClick={() => router.push('/dashboard/comercial/pipeline')}
        >
          <div className="kpi-label">Pipeline ativo</div>
          <div className="kpi-value">{fmtBRL(kpis.pipelineEstimatedValue || 0)}</div>
          <div className="kpi-label" style={{ opacity: 0.7 }}>{kpis.pipelineTotalLeads || 0} leads</div>
        </div>
        <div
          className="glass-card glass-card-hover"
          style={{ padding: 18, cursor: 'pointer' }}
          onClick={() => router.push('/dashboard/comercial/propostas')}
        >
          <div className="kpi-label">Propostas vistas (mês)</div>
          <div className="kpi-value">{kpis.proposalsViewedMonth || 0}</div>
          <div className="kpi-label" style={{ opacity: 0.7 }}>de {kpis.proposalsSentMonth || 0} enviadas</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════════════ */

export default function OverviewPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { notify } = useNotification();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  /* Carregamentos auxiliares para o CreateTaskModal */
  const [clients,    setClients]    = useState([]);
  const [categories, setCategories] = useState([]);
  const [users,      setUsers]      = useState([]);

  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  /* ── Carrega dados do overview ───────────────────────────────────────── */
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/overview');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Falha ao carregar dados');
      setData(json.data);
    } catch (err) {
      console.error('[ERRO][Overview] fetch', err.message);
      notify('Erro ao carregar Visão Geral', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  /* ── Listas para o modal de criação ──────────────────────────────────── */
  const fetchAux = useCallback(async () => {
    try {
      const [cats, cls, usr] = await Promise.all([
        fetch('/api/task-categories').then(r => r.json()).catch(() => ({})),
        fetch('/api/clients').then(r => r.json()).catch(() => ({})),
        fetch('/api/tasks/users-search').then(r => r.json()).catch(() => ({})),
      ]);
      if (cats.success) setCategories(cats.categories || []);
      if (cls.success)  setClients(cls.clients || []);
      if (usr.success)  setUsers(usr.users || []);
    } catch (err) {
      console.error('[ERRO][Overview] fetchAux', err.message);
    }
  }, []);

  useEffect(() => { fetchOverview(); fetchAux(); }, [fetchOverview, fetchAux]);

  /* ── Saudação dinâmica ───────────────────────────────────────────────── */
  const hello = useMemo(() => {
    const name = firstName(user?.name);
    return name ? `${greeting()}, ${name}.` : `${greeting()}.`;
  }, [user?.name]);

  /* ── KPIs derivados ──────────────────────────────────────────────────── */
  const stats = data?.stats || {
    myTasksToday: 0, myTasksDoneToday: 0, myTasksOverdue: 0,
    myMeetingsToday: 0, myTasksThisWeek: 0, myTasksDoneThisWeek: 0,
  };
  const weekRate = stats.myTasksThisWeek > 0
    ? Math.round((stats.myTasksDoneThisWeek / stats.myTasksThisWeek) * 100)
    : 0;

  /* ── Handlers ────────────────────────────────────────────────────────── */
  const handleOpenTask = (task) => setSelectedTaskId(task.id);
  const handleCloseTask = () => setSelectedTaskId(null);
  const handleRefresh = () => { fetchOverview(); };

  return (
    <DashboardLayout activeTab="overview">
      <div className={styles.pageContainer}>

        {/* ═══════ 01 · CABEÇALHO ═══════ */}
        <div style={{ marginBottom: 8 }}>
          <div className={styles.sectionHeader}>
            <span className="label-micro" style={{ color: '#ff0033' }}>01 · PAINEL PESSOAL</span>
            <div className={styles.sectionLine} />
          </div>
          <h1 className="page-title">Visão Geral</h1>
          <p className="page-subtitle">{hello} Aqui está seu resumo de hoje.</p>
        </div>

        {/* ═══════ KPIs ═══════ */}
        <div className={`${styles.kpiGrid} ${styles.stagger}`}>
          {loading ? (
            <>
              <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
            </>
          ) : (
            <>
              <KpiCard
                label="TAREFAS HOJE"
                value={stats.myTasksToday}
              />
              <KpiCard
                label="FEITAS HOJE"
                value={stats.myTasksDoneToday}
                tone="success"
              />
              <KpiCard
                label="ATRASADAS"
                value={stats.myTasksOverdue}
                tone="error"
                pulse={stats.myTasksOverdue > 0}
              />
              <KpiCard
                label="REUNIÕES HOJE"
                value={stats.myMeetingsToday}
                tone="info"
              />
              <KpiCard
                label="SEMANA"
                value={`${stats.myTasksDoneThisWeek}/${stats.myTasksThisWeek}`}
                tone="warning"
                sub={`${weekRate}% concluído`}
              />
            </>
          )}
        </div>

        <div className="divider-sweep" style={{ margin: '28px 0' }} />

        {/* ═══════ COMERCIAL EM DESTAQUE ═══════ */}
        <ComercialHighlight />

        <div className="divider-sweep" style={{ margin: '28px 0' }} />

        {/* ═══════ 02 · AÇÕES RÁPIDAS ═══════ */}
        <SectionHeader tag="02 · AÇÕES RÁPIDAS" title="Atalhos" />
        <div className={styles.quickActions}>
          <button
            className={styles.quickActionCard}
            onClick={() => setShowCreateTask(true)}
            type="button"
          >
            <div className={styles.quickActionIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5"  y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div className={styles.quickActionContent}>
              <span className={styles.quickActionTitle}>Nova Tarefa</span>
              <span className={styles.quickActionSub}>Criar uma tarefa para o time</span>
            </div>
          </button>

          <button
            className={styles.quickActionCard}
            onClick={() => router.push('/dashboard/meetings?action=new')}
            type="button"
          >
            <div className={styles.quickActionIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8"  y1="2" x2="8"  y2="6" />
                <line x1="3"  y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div className={styles.quickActionContent}>
              <span className={styles.quickActionTitle}>Nova Reunião</span>
              <span className={styles.quickActionSub}>Agendar no calendário</span>
            </div>
          </button>

          <button
            className={styles.quickActionCard}
            onClick={() => router.push('/dashboard/tasks')}
            type="button"
          >
            <div className={styles.quickActionIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
            </div>
            <div className={styles.quickActionContent}>
              <span className={styles.quickActionTitle}>Ver Tarefas</span>
              <span className={styles.quickActionSub}>Abrir painel de tarefas</span>
            </div>
          </button>
        </div>

        <div className="divider-sweep" style={{ margin: '28px 0' }} />

        {/* ═══════ 03 · TAREFAS DE HOJE / 04 · REUNIÕES DE HOJE ═══════ */}
        <div className={styles.columnsRow}>

          {/* Coluna esquerda — tarefas */}
          <div className={styles.columnLeft}>
            <SectionHeader tag="03 · TAREFAS DE HOJE" title="Suas tarefas para hoje" line={false} />
            <div className={styles.columnList}>
              {loading ? (
                <>
                  <CardSkeleton /><CardSkeleton /><CardSkeleton />
                </>
              ) : data?.todayTasks?.length > 0 ? (
                data.todayTasks.map(t => (
                  <TaskItem key={t.id} task={t} onClick={handleOpenTask} />
                ))
              ) : (
                <div className={`glass-card ${styles.emptyState}`}>
                  <svg className={styles.emptyStateIcon} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  Nenhuma tarefa para hoje.<br/>
                  Que tal adiantar as de amanhã?
                </div>
              )}
            </div>
          </div>

          {/* Coluna direita — reuniões */}
          <div className={styles.columnRight}>
            <SectionHeader tag="04 · REUNIÕES DE HOJE" title="Sua agenda" line={false} />
            <div className={styles.columnList}>
              {loading ? (
                <CardSkeleton />
              ) : data?.todayMeetings?.length > 0 ? (
                data.todayMeetings.map(m => (
                  <MeetingItem key={m.id} meeting={m} />
                ))
              ) : (
                <div className={`glass-card ${styles.emptyState}`}>
                  <svg className={styles.emptyStateIcon} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Nenhuma reunião hoje.<br/>
                  Aproveite para focar nas tarefas!
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="divider-sweep" style={{ margin: '28px 0' }} />

        {/* ═══════ 05 · ÚLTIMAS TAREFAS ADICIONADAS ═══════ */}
        <SectionHeader tag="05 · ÚLTIMAS TAREFAS ADICIONADAS" title="Atividade recente do time" />
        <div className={`glass-card ${styles.recentSection}`} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.recentTable}>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Status</th>
                  <th>Prioridade</th>
                  <th>Responsável</th>
                  <th>Cliente</th>
                  <th>Criado por</th>
                  <th>Criada em</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}>
                          <div className={styles.skel} style={{ width: '80%', height: 11 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data?.recentTasks?.length > 0 ? (
                  data.recentTasks.map(t => (
                    <tr key={t.id} className={styles.recentRow} onClick={() => handleOpenTask(t)}>
                      <td className={styles.recentTitle}>{t.title}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${statusClass(t.status)}`}>
                          {STATUS_LABEL[t.status] || t.status}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.priorityBadge} ${priorityClass(t.priority)}`}>
                          {PRIORITY_LABEL[t.priority] || 'NORMAL'}
                        </span>
                      </td>
                      <td>{t.assigned_to_name || <span className={styles.recentClient}>—</span>}</td>
                      <td className={styles.recentClient}>{t.client_name || '—'}</td>
                      <td>{t.created_by_name || <span className={styles.recentClient}>—</span>}</td>
                      <td className={styles.recentDate}>{fmtDateTimeBR(t.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <div className={styles.emptyState}>
                        Nenhuma tarefa criada ainda.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══════ MODAIS ═══════ */}
      {showCreateTask && (
        <CreateTaskModal
          onClose={() => setShowCreateTask(false)}
          onCreated={() => { setShowCreateTask(false); handleRefresh(); }}
          clients={clients}
          categories={categories}
          users={users}
          currentUserId={user?.id}
        />
      )}

      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={handleCloseTask}
          onRefresh={handleRefresh}
          tenantCategories={categories}
          tenantClients={clients}
          tenantUsers={users}
        />
      )}
    </DashboardLayout>
  );
}
