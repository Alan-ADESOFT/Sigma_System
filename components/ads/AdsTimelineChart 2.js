/**
 * components/ads/AdsTimelineChart.js
 * Gráfico SVG de linha (sem dependências) com toggle de métrica.
 */

import { useRef, useState, useMemo } from 'react';
import styles from '../../assets/style/ads.module.css';

const METRICS = [
  { key: 'spend',        label: 'Investimento', fmt: 'currency' },
  { key: 'impressions',  label: 'Impressões',   fmt: 'number' },
  { key: 'clicks',       label: 'Cliques',      fmt: 'number' },
  { key: 'ctr',          label: 'CTR',          fmt: 'percent' },
  { key: 'conversions',  label: 'Conversões',   fmt: 'number' },
  { key: 'roas',         label: 'ROAS',         fmt: 'multiplier' },
];

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function formatValue(v, fmt) {
  if (v == null || isNaN(v)) return '—';
  if (fmt === 'currency')   return BRL.format(v);
  if (fmt === 'percent')    return `${v.toFixed(2)}%`;
  if (fmt === 'multiplier') return `${v.toFixed(2)}x`;
  return NUM.format(v);
}

function fmtDateShort(s) {
  if (!s) return '';
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

export default function AdsTimelineChart({ timeline = [], initialMetric = 'spend' }) {
  const [metric, setMetric] = useState(initialMetric);
  const [tooltip, setTooltip] = useState(null);
  const wrapRef = useRef(null);

  const meta = METRICS.find((m) => m.key === metric) || METRICS[0];

  const W = 800;
  const H = 220;
  const padL = 40, padR = 16, padT = 16, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const points = useMemo(() => timeline.map((d) => ({ ...d, value: Number(d[metric]) || 0 })), [timeline, metric]);
  const maxVal = Math.max(...points.map((p) => p.value), 1);
  const minVal = 0;

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points.map((p, i) => {
      const x = padL + (i / Math.max(1, points.length - 1)) * innerW;
      const y = padT + innerH - ((p.value - minVal) / Math.max(1, maxVal - minVal)) * innerH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
  }, [points, innerW, innerH, maxVal, minVal]);

  const areaD = pathD ? `${pathD} L ${padL + innerW} ${padT + innerH} L ${padL} ${padT + innerH} Z` : '';

  if (points.length === 0) {
    return (
      <div className={`glass-card ${styles.chartCard}`}>
        <div className={styles.chartHeader}>
          <span className={styles.chartTitle}>Timeline</span>
        </div>
        <div className={styles.chartEmpty}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <span>Sem dados no período selecionado</span>
        </div>
      </div>
    );
  }

  function handleMove(e) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (points.length - 1));
    const p = points[Math.max(0, Math.min(points.length - 1, idx))];
    if (p) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, point: p });
  }

  return (
    <div className={`glass-card ${styles.chartCard}`}>
      <div className={styles.chartHeader}>
        <span className={styles.chartTitle}>Timeline · {meta.label}</span>
        <div className={styles.metricSwitcher}>
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`${styles.metricBtn} ${m.key === metric ? styles.metricBtnActive : ''}`}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={styles.chartWrap}
        ref={wrapRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.chartSvg}>
          {/* Eixo Y - linhas guia */}
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <line
              key={p}
              x1={padL} x2={W - padR}
              y1={padT + innerH * (1 - p)} y2={padT + innerH * (1 - p)}
              className={styles.chartGrid}
            />
          ))}
          {/* Y labels */}
          <text x={padL - 6} y={padT + 4} textAnchor="end" className={styles.chartAxisText}>
            {formatValue(maxVal, meta.fmt)}
          </text>
          <text x={padL - 6} y={padT + innerH + 2} textAnchor="end" className={styles.chartAxisText}>
            0
          </text>
          {/* Área sob a curva */}
          <path d={areaD} className={styles.chartArea} />
          {/* Linha */}
          <path d={pathD} className={styles.chartLine} />
          {/* Pontos */}
          {points.map((p, i) => {
            const x = padL + (i / Math.max(1, points.length - 1)) * innerW;
            const y = padT + innerH - ((p.value - minVal) / Math.max(1, maxVal - minVal)) * innerH;
            return <circle key={i} cx={x} cy={y} r="2.5" className={styles.chartDot} />;
          })}
          {/* X labels — first, middle, last */}
          {[0, Math.floor(points.length / 2), points.length - 1].map((i) => {
            const p = points[i];
            if (!p) return null;
            const x = padL + (i / Math.max(1, points.length - 1)) * innerW;
            return (
              <text key={i} x={x} y={H - 8} textAnchor="middle" className={styles.chartAxisText}>
                {fmtDateShort(p.date)}
              </text>
            );
          })}
        </svg>

        {tooltip && (
          <div
            className={styles.chartTooltip}
            style={{ left: Math.min(tooltip.x, (wrapRef.current?.clientWidth || 0) - 140), top: Math.max(0, tooltip.y - 60) }}
          >
            <div className={styles.tooltipDate}>{fmtDateShort(tooltip.point.date)}</div>
            <div className={styles.tooltipValue}>{formatValue(tooltip.point.value, meta.fmt)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
