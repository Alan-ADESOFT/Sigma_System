/**
 * pages/dashboard/tokens.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboard de Tokens — consumo e custos de IA por periodo.
 * KPIs, grafico SVG, breakdown por operacao/modelo, tabela de requisicoes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import styles from '../../assets/style/tokens.module.css';

// ── Helpers ──────────────────────────────────────────────────

const OP_LABELS = {
  pipeline: 'Pipeline completo',
  stage_modify: 'Modificacao de etapa',
  copy_generate: 'Geracao de copy',
  copy_modify: 'Modificacao de copy',
  web_search: 'Pesquisa web',
  apply_modification: 'Modificacao com IA',
  general: 'Outros',
};

const OP_COLORS = {
  pipeline: { bg: 'rgba(255,0,51,0.08)', color: '#ff6680' },
  copy_generate: { bg: 'rgba(34,197,94,0.08)', color: '#22c55e' },
  copy_modify: { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6' },
  apply_modification: { bg: 'rgba(168,85,247,0.08)', color: '#a855f7' },
  web_search: { bg: 'rgba(249,115,22,0.08)', color: '#f97316' },
  stage_modify: { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6' },
  general: { bg: 'rgba(82,82,82,0.08)', color: '#525252' },
};

function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function fmtCost(v) {
  if (!v && v !== 0) return '—';
  return 'US$ ' + parseFloat(v).toFixed(4);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(d) {
  if (!d) return '';
  const dt = new Date(d);
  return (dt.getDate()) + '/' + (dt.getMonth() + 1);
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: start.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] };
}

// ── Pagina ───────────────────────────────────────────────────

export default function TokensPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [page, setPage] = useState(0);
  const [tooltip, setTooltip] = useState(null);
  const chartRef = useRef(null);

  useEffect(() => { loadData(); }, [period, customStart, customEnd]);

  async function loadData() {
    setLoading(true);
    try {
      let url = '/api/tokens/usage?period=' + period;
      if (period === 'custom' && customStart && customEnd) {
        url += '&startDate=' + customStart + '&endDate=' + customEnd;
      }
      const r = await fetch(url);
      const d = await r.json();
      if (d.success) setData(d.data);
    } catch (err) {
      console.error('[ERRO][TokensPage] Falha ao carregar dados', err);
    } finally { setLoading(false); }
  }

  const totalTokens = data?.totalTokens || 0;
  const totalCost = data?.totalCostUsd || 0;
  const totalRequests = data?.totalRequests || 0;
  const byModel = data?.byModel || [];
  const byOperation = data?.byOperation || [];
  const byDay = data?.byDay || [];
  const lastRequests = data?.lastRequests || [];
  const topModel = byModel[0]?.model_used || '—';

  const PAGE_SIZE = 10;
  const pagedRequests = lastRequests.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(lastRequests.length / PAGE_SIZE);

  // Grafico SVG
  const maxTokensDay = Math.max(...byDay.map(d => d.tokens || 0), 1);
  const chartWidth = 800;
  const chartHeight = 160;
  const barWidth = byDay.length > 0 ? Math.max(8, (chartWidth - 40) / byDay.length - 2) : 20;

  const isEmpty = !loading && totalTokens === 0;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.title}>Dashboard de Tokens</div>
          <div className={styles.subtitle}>Consumo e custos de IA — todas as operacoes</div>
        </div>
        <div className={styles.periodGroup}>
          <button className={period === 'month' ? styles.periodPillActive : styles.periodPill} onClick={() => setPeriod('month')}>Este Mes</button>
          <button className={period === 'custom' ? styles.periodPillActive : styles.periodPill} onClick={() => setPeriod('custom')}>Periodo</button>
          <button className={period === 'all' ? styles.periodPillActive : styles.periodPill} onClick={() => setPeriod('all')}>Todo o Periodo</button>
          {period === 'custom' && (
            <>
              <input type="date" className={styles.dateInput} value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.52rem' }}>ate</span>
              <input type="date" className={styles.dateInput} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </>
          )}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <>
          <div className={styles.kpiGrid}>
            {[1,2,3,4].map(i => <div key={i} className={`${styles.kpiCard} ${styles.skeleton}`} style={{ height: 100 }} />)}
          </div>
          <div className={`${styles.chartCard} ${styles.skeleton}`} style={{ height: 240 }} />
          <div className={styles.breakdownGrid}>
            <div className={`${styles.breakdownCard} ${styles.skeleton}`} style={{ height: 200 }} />
            <div className={`${styles.breakdownCard} ${styles.skeleton}`} style={{ height: 200 }} />
          </div>
        </>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="glass-card">
          <div className={styles.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.4 }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <div className={styles.emptyTitle}>Nenhuma operacao de IA registrada neste periodo</div>
            <div className={styles.emptyDesc}>Execute o pipeline de um cliente ou gere uma copy para ver os dados aqui.</div>
            <Link href="/dashboard/database"><button className={styles.emptyBtn}>Ir para Base de Dados &rarr;</button></Link>
          </div>
        </div>
      )}

      {/* KPIs */}
      {!loading && !isEmpty && (
        <>
          <div className={styles.kpiGrid}>
            <div className={`${styles.kpiCard} ${styles.fadeIn1}`} style={{ '--kpi-color': 'var(--brand-500)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--brand-500), var(--brand-300))' }} />
              <div className={styles.kpiIcon} style={{ color: 'var(--brand-500)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              </div>
              <div className={styles.kpiValue} style={{ color: 'var(--brand-500)' }}>{fmtTokens(totalTokens)}</div>
              <div className={styles.kpiLabel}>tokens consumidos</div>
            </div>

            <div className={`${styles.kpiCard} ${styles.fadeIn2}`}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #22c55e, #16a34a)' }} />
              <div className={styles.kpiIcon} style={{ color: '#22c55e' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div className={styles.kpiValue} style={{ color: '#22c55e' }}>{fmtCost(totalCost)}</div>
              <div className={styles.kpiLabel}>custo estimado no periodo</div>
              <div className={styles.kpiNote}>Baseado nos precos oficiais de cada modelo</div>
            </div>

            <div className={`${styles.kpiCard} ${styles.fadeIn3}`}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }} />
              <div className={styles.kpiIcon} style={{ color: '#3b82f6' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </div>
              <div className={styles.kpiValue} style={{ color: '#3b82f6' }}>{totalRequests}</div>
              <div className={styles.kpiLabel}>chamadas de IA</div>
            </div>

            <div className={`${styles.kpiCard} ${styles.fadeIn4}`}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #f97316, #fb923c)' }} />
              <div className={styles.kpiIcon} style={{ color: '#f97316' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <div className={styles.kpiValue} style={{ color: '#f97316', fontSize: '1rem' }}>{topModel}</div>
              <div className={styles.kpiLabel}>modelo dominante</div>
            </div>
          </div>

          {/* Grafico de barras SVG */}
          {byDay.length > 0 && (
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>Uso ao longo do tempo</div>
              <div className={styles.chartWrap} ref={chartRef}>
                <svg className={styles.chartSvg} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                  {byDay.map((d, i) => {
                    const barH = (d.tokens / maxTokensDay) * (chartHeight - 30);
                    const x = 30 + i * ((chartWidth - 40) / byDay.length);
                    const y = chartHeight - 20 - barH;
                    return (
                      <g key={i}>
                        <rect
                          className={styles.chartBar}
                          x={x} y={y} width={barWidth} height={barH}
                          rx={2} fill="rgba(255,0,51,0.6)"
                          onMouseEnter={(e) => {
                            const rect = chartRef.current?.getBoundingClientRect();
                            if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 40, date: fmtDateShort(d.date), tokens: fmtTokens(d.tokens), cost: fmtCost(d.cost) });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        />
                        {/* X axis label — show every 3rd */}
                        {i % 3 === 0 && (
                          <text x={x + barWidth / 2} y={chartHeight - 4} textAnchor="middle" fill="#525252" fontSize="8" fontFamily="var(--font-mono)">
                            {fmtDateShort(d.date)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {/* Y axis labels */}
                  <text x="2" y="14" fill="#525252" fontSize="8" fontFamily="var(--font-mono)">{fmtTokens(maxTokensDay)}</text>
                  <text x="2" y={chartHeight - 22} fill="#525252" fontSize="8" fontFamily="var(--font-mono)">0</text>
                </svg>
                {tooltip && (
                  <div className={styles.chartTooltip} style={{ left: tooltip.x, top: tooltip.y }}>
                    <div>{tooltip.date}</div>
                    <div>{tooltip.tokens} tokens</div>
                    <div>{tooltip.cost}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Breakdown */}
          <div className={styles.breakdownGrid}>
            {/* Por operacao */}
            <div className={styles.breakdownCard}>
              <div className={styles.breakdownTitle}>Por Tipo de Operacao</div>
              {byOperation.map(op => {
                const pct = totalTokens > 0 ? Math.round((op.tokens / totalTokens) * 100) : 0;
                const opCfg = OP_COLORS[op.operation_type] || OP_COLORS.general;
                return (
                  <div key={op.operation_type} className={styles.breakdownRow}>
                    <span className={styles.breakdownLabel}>{OP_LABELS[op.operation_type] || op.operation_type}</span>
                    <div className={styles.breakdownBarWrap}><div className={styles.breakdownBarFill} style={{ width: pct + '%' }} /></div>
                    <span className={styles.breakdownValue}>{fmtTokens(op.tokens)}</span>
                    <span className={styles.breakdownPct}>{pct}%</span>
                  </div>
                );
              })}
              {byOperation.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', padding: 12 }}>Sem dados</div>}
            </div>

            {/* Por modelo */}
            <div className={styles.breakdownCard}>
              <div className={styles.breakdownTitle}>Por Modelo</div>
              {byModel.map(m => {
                const pct = totalTokens > 0 ? Math.round((m.tokens / totalTokens) * 100) : 0;
                const provColor = m.provider === 'anthropic' ? { bg: 'rgba(249,115,22,0.08)', color: '#f97316' }
                  : m.provider === 'perplexity' ? { bg: 'rgba(34,197,94,0.08)', color: '#22c55e' }
                  : { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6' };
                return (
                  <div key={m.model_used} className={styles.breakdownRow}>
                    <span className={styles.breakdownLabel}>
                      {m.model_used}
                      <span className={styles.providerBadge} style={{ background: provColor.bg, color: provColor.color, marginLeft: 4 }}>
                        {m.provider === 'anthropic' ? 'Anthropic' : m.provider === 'perplexity' ? 'Perplexity' : 'OpenAI'}
                      </span>
                    </span>
                    <div className={styles.breakdownBarWrap}><div className={styles.breakdownBarFill} style={{ width: pct + '%' }} /></div>
                    <span className={styles.breakdownValue}>{fmtTokens(m.tokens)}</span>
                    <span className={styles.breakdownPct}>{fmtCost(m.cost)}</span>
                  </div>
                );
              })}
              {byModel.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', padding: 12 }}>Sem dados</div>}
            </div>
          </div>

          {/* Tabela de requisicoes */}
          <div className={styles.tableCard}>
            <div className={styles.tableTitle}>Ultimas Requisicoes</div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Data/Hora</th>
                  <th className={styles.th}>Operacao</th>
                  <th className={styles.th}>Modelo</th>
                  <th className={styles.th}>Cliente</th>
                  <th className={styles.th}>Tokens</th>
                  <th className={styles.th}>Custo</th>
                  <th className={styles.th}>Provider</th>
                </tr>
              </thead>
              <tbody>
                {pagedRequests.map(req => {
                  const opCfg = OP_COLORS[req.operation_type] || OP_COLORS.general;
                  const provColor = req.provider === 'anthropic' ? { bg: 'rgba(249,115,22,0.08)', color: '#f97316' }
                    : req.provider === 'perplexity' ? { bg: 'rgba(34,197,94,0.08)', color: '#22c55e' }
                    : { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6' };
                  return (
                    <tr key={req.id} className={styles.tr}>
                      <td className={styles.td}>{fmtDate(req.created_at)}</td>
                      <td className={styles.td}>
                        <span className={styles.opBadge} style={{ background: opCfg.bg, color: opCfg.color }}>
                          {OP_LABELS[req.operation_type] || req.operation_type}
                        </span>
                      </td>
                      <td className={styles.td} style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.model_used}</td>
                      <td className={styles.td}>{req.company_name || '—'}</td>
                      <td className={styles.td}>{fmtTokens(req.tokens_input)} in &middot; {fmtTokens(req.tokens_output)} out</td>
                      <td className={styles.td}>{fmtCost(req.estimated_cost_usd)}</td>
                      <td className={styles.td}>
                        <span className={styles.providerBadge} style={{ background: provColor.bg, color: provColor.color }}>
                          {req.provider === 'anthropic' ? 'Anthropic' : req.provider === 'perplexity' ? 'Perplexity' : 'OpenAI'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {pagedRequests.length === 0 && (
                  <tr><td className={styles.td} colSpan={7} style={{ textAlign: 'center', padding: 20 }}>Nenhuma requisicao</td></tr>
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className={styles.paginationRow}>
                <button className={styles.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>&lt;</button>
                <span className={styles.pageInfo}>{page + 1} / {totalPages}</span>
                <button className={styles.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>&gt;</button>
              </div>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
