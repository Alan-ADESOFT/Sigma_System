/**
 * components/ads/AdsKpiCards.js
 * Grid de 8 KPIs com comparação % vs período anterior.
 *
 * `comparison` é o array do backend: [{ metric, current, previous, deltaPct, direction, positive }]
 *   · positive=true → verde
 *   · positive=false → vermelho
 *   · positive=null → cinza (métrica neutra ou Δ ≈ 0)
 */

import styles from '../../assets/style/ads.module.css';

const METRIC_META = [
  { key: 'totalSpend',           label: 'Investimento',  fmt: 'currency' },
  { key: 'totalImpressions',     label: 'Impressões',    fmt: 'number' },
  { key: 'totalClicks',          label: 'Cliques',       fmt: 'number' },
  { key: 'avgCtr',               label: 'CTR',           fmt: 'percent' },
  { key: 'avgCpc',               label: 'CPC',           fmt: 'currency' },
  { key: 'roas',                 label: 'ROAS',          fmt: 'multiplier' },
  { key: 'totalConversions',     label: 'Conversões',    fmt: 'number' },
  { key: 'cpa',                  label: 'CPA',           fmt: 'currency' },
];

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function formatValue(v, fmt) {
  if (v == null || isNaN(v)) return '—';
  if (fmt === 'currency')   return BRL.format(v);
  if (fmt === 'percent')    return `${(v).toFixed(2)}%`;
  if (fmt === 'multiplier') return `${(v).toFixed(2)}x`;
  return NUM.format(v);
}

export default function AdsKpiCards({ kpiSummary, comparison, loading }) {
  const compMap = new Map((comparison || []).map((c) => [c.metric, c]));

  if (loading) {
    return (
      <div className="kpi-grid">
        {[0,1,2,3,4,5,6,7].map((i) => (
          <div key={i} className={`glass-card kpi-card ${styles.kpiSkeleton}`}>
            <div className={`skeleton ${styles.skLabel}`} />
            <div className={`skeleton ${styles.skValue}`} />
            <div className={`skeleton ${styles.skDelta}`} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="kpi-grid">
      {METRIC_META.map((m) => {
        const value = kpiSummary?.[m.key];
        const cmp = compMap.get(m.key);
        const delta = cmp?.deltaPct;
        const positive = cmp?.positive;
        const direction = cmp?.direction;
        const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '▬';
        const deltaClass = positive === true
          ? styles.deltaPositive
          : positive === false
            ? styles.deltaNegative
            : styles.deltaNeutral;
        return (
          <div key={m.key} className="glass-card kpi-card">
            <span className="kpi-label">{m.label}</span>
            <span className="kpi-value">{formatValue(value, m.fmt)}</span>
            {cmp && (
              <span className={`${styles.kpiDelta} ${deltaClass}`}>
                <span aria-hidden="true">{arrow}</span>
                {delta == null ? '—' : `${Math.abs(delta).toFixed(1)}%`}
                <span className={styles.deltaSuffix}>vs ant.</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
