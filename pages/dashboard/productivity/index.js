/**
 * pages/dashboard/productivity/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Produtividade — dashboard analítico do time inteiro.
 *
 *   • KPIs globais com filtro de período (semana / mês)
 *   • Desempenho por membro com progress bars
 *   • Gráfico de linha (concluídas vs criadas por dia)
 *   • Donut de distribuição por status
 *   • Bar chart por categoria
 *   • Top 5 tarefas críticas
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import DashboardLayout from '../../../components/DashboardLayout';
import TaskDetailModal from '../../../components/TaskDetailModal';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/productivity.module.css';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtDateBR(iso) {
  if (!iso) return '—';
  const s = String(iso).split('T')[0];
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function getInitials(name) {
  if (!name) return '?';
  return String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
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

function progressFillClass(rate) {
  if (rate >= 80) return styles.progressFillHigh;
  if (rate >= 50) return styles.progressFillMid;
  return styles.progressFillLow;
}

/* ── Tooltip customizado dos charts ──────────────────────────────────────── */

const tooltipContentStyle = {
  background: '#0a0a0a',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  fontFamily: 'var(--font-mono)',
  fontSize: '0.65rem',
  padding: '8px 12px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
};
const tooltipLabelStyle = {
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6rem',
  marginBottom: 4,
};
const tooltipItemStyle = {
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.65rem',
};

/* ── Sub-componentes ─────────────────────────────────────────────────────── */

function SectionHeader({ tag, title }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className={styles.sectionHeader}>
        <span className="label-micro" style={{ color: '#ff0033' }}>{tag}</span>
        <div className={styles.sectionLine} />
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

function UserAvatar({ name, src, size = 32 }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={styles.userAvatar}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div className={styles.userAvatar} style={{ width: size, height: size }}>
      {getInitials(name)}
    </div>
  );
}

function UserCard({ user }) {
  const rate = user.completion_rate || 0;
  const fill = progressFillClass(rate);

  return (
    <div className={`glass-card ${styles.userCard}`}>
      <UserAvatar name={user.user_name} src={user.avatar_url} />
      <div className={styles.userName}>{user.user_name}</div>

      <div className={styles.progressBlock}>
        <div className={styles.progressBarTrack}>
          <div
            className={`${styles.progressBarFill} ${fill}`}
            style={{ width: `${Math.min(rate, 100)}%` }}
          />
        </div>
        <div className={styles.progressMeta}>
          <span className={styles.progressCount}>
            {user.completed}/{user.total} <span style={{ color: 'var(--text-muted)' }}>({rate}%)</span>
          </span>
          <div className={styles.progressBreakdown}>
            <span>em prog.: {user.in_progress}</span>
            <span>·</span>
            <span>pendentes: {user.pending}</span>
            {user.estimated_hours > 0 && (
              <>
                <span>·</span>
                <span>{user.estimated_hours}h estim.</span>
              </>
            )}
          </div>
        </div>
      </div>

      {user.overdue > 0 ? (
        <div className={styles.userOverdueBadge}>
          ⚠ {user.overdue} atrasada{user.overdue > 1 ? 's' : ''}
        </div>
      ) : (
        <div className={styles.userOkBadge}>✓ Em dia</div>
      )}
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

function ChartSkeleton({ height = 240 }) {
  return (
    <div className={styles.skel} style={{ width: '100%', height }} />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════════════ */

export default function ProductivityPage() {
  const { notify } = useNotification();
  const [period, setPeriod]   = useState('week');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  /* Aux para abrir o detalhe da task com listas certas */
  const [clients, setClients]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers]           = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/productivity?period=${period}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Falha ao carregar');
      setData(json.data);
    } catch (err) {
      console.error('[ERRO][Productivity] fetch', err.message);
      notify('Erro ao carregar Produtividade', 'error');
    } finally {
      setLoading(false);
    }
  }, [period, notify]);

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
      console.error('[ERRO][Productivity] fetchAux', err.message);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchAux();  }, [fetchAux]);

  /* ── Derivados ───────────────────────────────────────────────────────── */

  const stats     = data?.stats     || {};
  const userStats = data?.userStats || [];
  const daily     = data?.dailyCompletions    || [];
  const status    = data?.statusDistribution  || [];
  const cats      = data?.categoryDistribution || [];
  const critical  = data?.criticalTasks       || [];

  const completionTone = useMemo(() => {
    const r = stats.completionRate || 0;
    if (r >= 70) return 'success';
    if (r >= 40) return 'warning';
    return 'error';
  }, [stats.completionRate]);

  const totalForDonut = useMemo(
    () => status.reduce((acc, s) => acc + (s.count || 0), 0),
    [status]
  );

  const periodLabel = period === 'month' ? 'Este mês' : 'Esta semana';

  return (
    <DashboardLayout activeTab="productivity">
      <div className={styles.pageContainer}>

        {/* ═══════ CABEÇALHO + FILTRO ═══════ */}
        <div style={{ marginBottom: 8 }}>
          <div className={styles.sectionHeader}>
            <span className="label-micro" style={{ color: '#ff0033' }}>01 · PRODUTIVIDADE DO TIME</span>
            <div className={styles.sectionLine} />
          </div>

          <div className={styles.headerRow}>
            <div className={styles.headerLeft}>
              <h1 className="page-title">Produtividade</h1>
              <p className="page-subtitle">
                Métricas de desempenho e carga de trabalho da equipe.
              </p>
            </div>

            <div>
              <div className={styles.periodGroup}>
                <span className={styles.periodLabel}>PERÍODO</span>
                <select
                  className={styles.periodSelect}
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="week">Esta semana</option>
                  <option value="month">Este mês</option>
                </select>
              </div>
              {data?.dateRange && (
                <div className={styles.periodHint}>
                  {fmtDateBR(data.dateRange.from)} → {fmtDateBR(data.dateRange.to)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══════ KPIs ═══════ */}
        <div className={`${styles.kpiGrid} ${styles.stagger}`}>
          {loading ? (
            <>
              <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
            </>
          ) : (
            <>
              <KpiCard label="TOTAL TAREFAS" value={stats.totalTasks || 0} />
              <KpiCard label="CONCLUÍDAS"    value={stats.completedTasks || 0} tone="success" />
              <KpiCard
                label="TAXA DE CONCLUSÃO"
                value={`${stats.completionRate || 0}%`}
                tone={completionTone}
              />
              <KpiCard
                label="ATRASADAS"
                value={stats.overdueTasks || 0}
                tone="error"
                pulse={(stats.overdueTasks || 0) > 0}
              />
              <KpiCard
                label="REUNIÕES"
                value={stats.totalMeetings || 0}
                tone="info"
                sub={stats.totalEstimatedHours > 0 ? `${stats.totalEstimatedHours}h estimadas` : undefined}
              />
            </>
          )}
        </div>

        <div className="divider-sweep" style={{ margin: '28px 0' }} />

        {/* ═══════ 02 · DESEMPENHO POR MEMBRO ═══════ */}
        <SectionHeader tag="02 · DESEMPENHO POR MEMBRO" title="Carga de trabalho do time" />
        <div className={styles.userList}>
          {loading ? (
            <>
              <ChartSkeleton height={56} />
              <ChartSkeleton height={56} />
              <ChartSkeleton height={56} />
            </>
          ) : userStats.length > 0 ? (
            userStats.map(u => <UserCard key={u.user_id} user={u} />)
          ) : (
            <div className={`glass-card ${styles.emptyState}`}>
              Nenhuma atividade registrada no período.
            </div>
          )}
        </div>

        <div className="divider-sweep" style={{ margin: '28px 0' }} />

        {/* ═══════ 03 + 04 · GRÁFICOS LINHA + DONUT ═══════ */}
        <div className={styles.chartsRow}>

          {/* Linha — concluídas vs criadas */}
          <div className={`glass-card ${styles.chartContainer}`}>
            <div className={styles.chartHeader}>
              <span className="label-micro" style={{ color: '#ff0033' }}>03 · ATIVIDADE</span>
              <span className={styles.chartTitle}>Concluídas × criadas por dia</span>
            </div>
            <div className={styles.chartBody}>
              {loading ? (
                <ChartSkeleton height={220} />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={daily} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grad-completed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0}    />
                      </linearGradient>
                      <linearGradient id="grad-created" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#525252" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#525252" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                      cursor={{ fill: 'rgba(255,0,51,0.05)' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      name="Concluídas"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#grad-completed)"
                    />
                    <Area
                      type="monotone"
                      dataKey="created"
                      name="Criadas"
                      stroke="#737373"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      fill="url(#grad-created)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Donut — distribuição por status */}
          <div className={`glass-card ${styles.chartContainer}`} style={{ position: 'relative' }}>
            <div className={styles.chartHeader}>
              <span className="label-micro" style={{ color: '#ff0033' }}>04 · STATUS</span>
              <span className={styles.chartTitle}>Distribuição por status</span>
            </div>
            <div className={styles.chartBody} style={{ position: 'relative' }}>
              {loading ? (
                <ChartSkeleton height={220} />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={status}
                        dataKey="count"
                        nameKey="label"
                        innerRadius={56}
                        outerRadius={86}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {status.map((s, i) => (
                          <Cell key={i} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className={styles.donutCenter}>
                    <div className={styles.donutCenterValue}>{totalForDonut}</div>
                    <div className={styles.donutCenterLabel}>Total</div>
                  </div>
                </>
              )}
            </div>
            {!loading && (
              <div className={styles.legendList}>
                {status.map(s => (
                  <div key={s.status} className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ background: s.color }} />
                    {s.label}
                    <span className={styles.legendCount}>{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="divider-sweep" style={{ margin: '28px 0' }} />

        {/* ═══════ 05 + 06 · CATEGORIAS + CRÍTICAS ═══════ */}
        <div className={styles.chartsRow}>

          {/* Bar chart por categoria */}
          <div className={`glass-card ${styles.chartContainer}`}>
            <div className={styles.chartHeader}>
              <span className="label-micro" style={{ color: '#ff0033' }}>05 · CATEGORIAS</span>
              <span className={styles.chartTitle}>Volume por categoria</span>
            </div>
            <div className={styles.chartBody}>
              {loading ? (
                <ChartSkeleton height={240} />
              ) : cats.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(240, cats.length * 40 + 40)}>
                  <BarChart
                    data={cats}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="category"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                      axisLine={false}
                      tickLine={false}
                      width={110}
                    />
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                      cursor={{ fill: 'rgba(255,0,51,0.05)' }}
                    />
                    <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]}>
                      {cats.map((c, i) => (
                        <Cell key={i} fill={c.color || '#6366f1'} fillOpacity={0.35} />
                      ))}
                    </Bar>
                    <Bar dataKey="completed" name="Concluídas" radius={[0, 4, 4, 0]}>
                      {cats.map((c, i) => (
                        <Cell key={i} fill={c.color || '#6366f1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className={styles.emptyState}>
                  Nenhuma categoria com tarefas no período.
                </div>
              )}
            </div>
          </div>

          {/* Tarefas críticas */}
          <div className={`glass-card ${styles.chartContainer}`}>
            <div className={styles.chartHeader}>
              <span className="label-micro" style={{ color: '#ff0033' }}>06 · CRÍTICAS</span>
              <span className={styles.chartTitle}>Top 5 mais atrasadas</span>
            </div>
            <div className={styles.criticalList}>
              {loading ? (
                <>
                  <ChartSkeleton height={64} />
                  <ChartSkeleton height={64} />
                  <ChartSkeleton height={64} />
                </>
              ) : critical.length > 0 ? (
                critical.map(t => (
                  <div
                    key={t.id}
                    className={`glass-card ${styles.criticalCard}`}
                    onClick={() => setSelectedTaskId(t.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.criticalHeader}>
                      <div className={styles.criticalTitle}>{t.title}</div>
                      <span className={styles.daysOverdue}>
                        {t.days_overdue}d atrasada
                      </span>
                    </div>
                    <div className={styles.criticalMeta}>
                      <span className={`${styles.priorityBadge} ${priorityClass(t.priority)}`}>
                        {PRIORITY_LABEL[t.priority] || 'NORMAL'}
                      </span>
                      {t.assigned_to_name && <span>👤 {t.assigned_to_name}</span>}
                      {t.client_name && <span>· {t.client_name}</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyState}>
                  Nenhuma tarefa crítica.<br />
                  O time está em dia.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ MODAL ═══════ */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onRefresh={fetchData}
          tenantCategories={categories}
          tenantClients={clients}
          tenantUsers={users}
        />
      )}
    </DashboardLayout>
  );
}
