/**
 * pages/dashboard/comercial/dashboard/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboard Comercial — KPIs, funil, leaderboard, histórico, top propostas.
 * Toggle de período (week/month/year) re-fetcha tudo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts';
import DashboardLayout from '../../../../components/DashboardLayout';
import CommercialFunnelChart from '../../../../components/comercial/CommercialFunnelChart';
import CommercialLeaderboard from '../../../../components/comercial/CommercialLeaderboard';
import { useNotification } from '../../../../context/NotificationContext';
import styles from '../../../../assets/style/comercialDashboard.module.css';
import { Skeleton } from '../../../../components/Skeleton';

const PERIODS = [
  { k: 'week',  l: 'Semana' },
  { k: 'month', l: 'Mês' },
  { k: 'year',  l: 'Ano' },
];

function fmtBRL(n) {
  if (!n) return 'R$ 0';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString('pt-BR');
}
function fmtPct(n) {
  if (n == null) return '—';
  return `${Number(n).toFixed(1)}%`;
}

export default function DashboardComercialPage() {
  const router = useRouter();
  const { notify } = useNotification();
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  const [kpis, setKpis] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [history, setHistory] = useState([]);
  const [topProposals, setTopProposals] = useState([]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [kRes, fRes, lRes, hRes, tRes] = await Promise.all([
        fetch(`/api/comercial/dashboard/kpis?period=${period}`).then(r => r.json()),
        fetch(`/api/comercial/dashboard/funnel?period=${period}`).then(r => r.json()),
        fetch(`/api/comercial/dashboard/leaderboard?period=${period}&limit=10`).then(r => r.json()),
        fetch(`/api/comercial/dashboard/history?weeks=52`).then(r => r.json()),
        fetch(`/api/comercial/dashboard/top-proposals?period=${period}&limit=5`).then(r => r.json()),
      ]);
      if (kRes.success) setKpis(kRes.kpis);
      if (fRes.success) setFunnel(fRes.funnel);
      if (lRes.success) setLeaderboard(lRes.leaderboard);
      if (hRes.success) setHistory(hRes.history);
      if (tRes.success) setTopProposals(tRes.proposals);
    } catch (err) {
      notify('Erro ao carregar dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); /* eslint-disable-line */ }, [period]);

  const isEmpty = !loading && kpis && kpis.pipelineTotalLeads === 0
    && (kpis.leadsCapturedMonth || 0) === 0;

  // Tempo médio em coluna — derivado do funnel
  const timeData = useMemo(() => {
    const max = Math.max(...funnel.map(s => s.avgDays || 0), 1);
    return funnel.map(s => ({
      name:  s.name,
      days:  s.avgDays || 0,
      pct:   ((s.avgDays || 0) / max) * 100,
      color: s.color,
    }));
  }, [funnel]);

  // History formatted pra Recharts
  const historyData = useMemo(() => {
    return (history || []).map(h => ({
      week: new Date(h.weekStart).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      Captados: h.captured,
      Ganhos:   h.won,
      Perdidos: h.lost,
    }));
  }, [history]);

  return (
    <DashboardLayout activeTab="comercial/dashboard">
      <div className={styles.page}>
        <div className={styles.headerRow}>
          <div>
            <h1 className="page-title">Dashboard Comercial</h1>
            <p className="page-subtitle">Visão geral do funil de vendas</p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.periodToggle}>
              {PERIODS.map(p => (
                <button
                  key={p.k}
                  className={`${styles.periodBtn} ${period === p.k ? styles.periodBtnActive : ''}`}
                  onClick={() => setPeriod(p.k)}
                >{p.l}</button>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={fetchAll} disabled={loading}>
              {loading ? '↻...' : '↻ Atualizar'}
            </button>
          </div>
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div className={`glass-card ${styles.emptyDashboard}`}>
            <h3>Sem dados ainda</h3>
            <p>Capte leads no Google Maps ou importe um CSV pra começar a rodar o pipeline.</p>
            <button className="sigma-btn-primary" onClick={() => router.push('/dashboard/comercial/captacao')}>
              Ir para Captação
            </button>
          </div>
        )}

        {/* KPI Grid (linha 1) */}
        <div className="kpi-grid">
          <KpiCard label="Leads captados" value={loading ? null : fmtNum(kpis?.leadsCapturedMonth)} hint="no período" />
          <KpiCard label="No pipeline"    value={loading ? null : fmtNum(kpis?.pipelineTotalLeads)} hint="total atual" />
          <KpiCard label="Valor estimado" value={loading ? null : fmtBRL(kpis?.pipelineEstimatedValue)} hint="pipeline aberto" />
          <KpiCard label="Conversão geral" value={loading ? null : fmtPct(kpis?.conversionRate)} hint="leads → ganhos" />
        </div>

        {/* KPI Grid (linha 2) */}
        <div className={styles.kpiSubrow}>
          <KpiCard label="Propostas enviadas"  value={loading ? null : fmtNum(kpis?.proposalsSentMonth)}   hint="no período" />
          <KpiCard label="Visualizadas"        value={loading ? null : `${fmtNum(kpis?.proposalsViewedMonth)} (${fmtPct(kpis?.proposalViewRate)})`} hint="taxa de view" />
          <KpiCard label="Fechados"            value={loading ? null : fmtNum(kpis?.closedMonthCount)}      hint={fmtBRL(kpis?.closedMonthValue)} />
          <KpiCard label="Ticket médio"        value={loading ? null : fmtBRL(kpis?.avgTicket)}             hint="por contrato fechado" />
        </div>

        {/* Funil + tempo médio */}
        <div className={styles.row2}>
          <div className={`glass-card ${styles.panel}`}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Funil de conversão</span>
              <span className={styles.panelMeta}>
                {funnel.length} etapas
              </span>
            </div>
            {loading
              ? <Skeleton width="100%" height={240} />
              : <CommercialFunnelChart stages={funnel} />}
          </div>

          <div className={`glass-card ${styles.panel}`}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Tempo médio por etapa</span>
              <span className={styles.panelMeta}>dias</span>
            </div>
            {loading ? (
              <Skeleton width="100%" height={240} />
            ) : timeData.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                Sem dados de tempo ainda
              </div>
            ) : (
              <div className={styles.timeList}>
                {timeData.map((t, i) => (
                  <div key={i} className={styles.timeRow}>
                    <div className={styles.timeLabel}>
                      {t.name}
                      <div className="barTrack">
                        <div className="barFill" style={{
                          width: `${Math.max(2, t.pct)}%`,
                          background: t.color || 'var(--brand-500)',
                        }} />
                      </div>
                    </div>
                    <div className={styles.timeValue}>{t.days.toFixed(1)}d</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div className={`glass-card ${styles.leaderboardWrap}`}>
          <div className={styles.panelHeader} style={{ padding: '14px 18px 0' }}>
            <span className={styles.panelTitle}>Leaderboard</span>
            <span className={styles.panelMeta}>top 10 · {period}</span>
          </div>
          {loading ? (
            <div style={{ padding: 18 }}><Skeleton width="100%" height={200} /></div>
          ) : (
            <CommercialLeaderboard rows={leaderboard} />
          )}
        </div>

        {/* Histórico 52 semanas */}
        <div className={`glass-card ${styles.panel}`} style={{ marginBottom: 24 }}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Histórico — últimas 52 semanas</span>
          </div>
          {loading
            ? <Skeleton width="100%" height={260} />
            : (
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="week" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                    <Tooltip
                      contentStyle={{ background: 'rgba(15,15,15,0.97)', border: '1px solid var(--border-default)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}
                      labelStyle={{ color: 'var(--text-muted)' }}
                    />
                    <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }} />
                    <Line type="monotone" dataKey="Captados" stroke="#3b82f6"   strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Ganhos"   stroke="#22c55e"   strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Perdidos" stroke="#ff0033"   strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
        </div>

        {/* Top propostas */}
        <div className={`glass-card ${styles.panel}`}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Top propostas mais vistas</span>
            <span className={styles.panelMeta}>top 5 · {period}</span>
          </div>
          {loading ? (
            <Skeleton width="100%" height={120} />
          ) : topProposals.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
              Nenhuma proposta visualizada no período
            </div>
          ) : (
            <div className={styles.topPropList}>
              {topProposals.map(p => (
                <div key={p.id} className={styles.topPropCard} onClick={() => router.push(`/dashboard/comercial/propostas/${p.id}/edit`)} style={{ cursor: 'pointer' }}>
                  <div>
                    <div className={styles.topPropName}>{p.clientName || '—'}</div>
                    <div className={styles.topPropSlug}>/proposta/{p.slug}</div>
                  </div>
                  <div className={styles.topPropMetric}>
                    <span className="label">Views</span>
                    {p.viewCount}
                  </div>
                  <div className={styles.topPropMetric}>
                    <span className="label">Tempo</span>
                    {Math.round((p.totalTimeSeconds || 0) / 60)}min
                  </div>
                  <div className={styles.topPropMetric}>
                    <span className="label">Scroll</span>
                    {p.maxScrollPct}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="glass-card kpi-card">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value == null ? <Skeleton width={80} height={26} /> : value}</span>
      {hint && <span className="kpi-label" style={{ opacity: 0.7 }}>{hint}</span>}
    </div>
  );
}
