/**
 * components/ads/AdsBreakdownTable.js
 * Mostra resultado de POST /api/ads/breakdown — tabela simples agrupada.
 */

import { useEffect, useState, useCallback } from 'react';
import styles from '../../assets/style/ads.module.css';

const TYPES = [
  { key: 'age',                label: 'Idade' },
  { key: 'gender',             label: 'Gênero' },
  { key: 'age_and_gender',     label: 'Idade × Gênero' },
  { key: 'publisher_platform', label: 'Plataforma' },
  { key: 'platform_position',  label: 'Posicionamento' },
  { key: 'region',             label: 'Região' },
  { key: 'device_platform',    label: 'Dispositivo' },
];

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const fmtMoney = (v) => v == null ? '—' : BRL.format(Number(v) || 0);
const fmtNum   = (v) => v == null ? '—' : NUM.format(Number(v) || 0);
const fmtPct   = (v) => v == null ? '—' : `${Number(v).toFixed(2)}%`;

function bucketLabel(row, type) {
  if (type === 'age')                return row.age || '—';
  if (type === 'gender')             return row.gender || '—';
  if (type === 'age_and_gender')     return `${row.age || '?'} · ${row.gender || '?'}`;
  if (type === 'publisher_platform') return row.publisher_platform || '—';
  if (type === 'platform_position')  return `${row.publisher_platform || '?'} · ${row.platform_position || '?'}`;
  if (type === 'region')             return row.region || '—';
  if (type === 'device_platform')    return row.device_platform || '—';
  return '—';
}

export default function AdsBreakdownTable({ clientId, datePreset }) {
  const [breakdownType, setBreakdownType] = useState('age_and_gender');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!clientId || !breakdownType) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/ads/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, breakdownType, datePreset }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao carregar breakdown');
      setRows(d.data || []);
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, breakdownType, datePreset]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={styles.breakdownWrap}>
      <div className={styles.breakdownHeader}>
        <div className={styles.chartTitle}>Segmentação por</div>
        <div className={styles.metricSwitcher}>
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`${styles.metricBtn} ${t.key === breakdownType ? styles.metricBtnActive : ''}`}
              onClick={() => setBreakdownType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className={styles.emptyTable}>
          <span className={styles.inlineSpinner} aria-hidden="true" />
          Carregando segmentação...
        </div>
      )}
      {error && !loading && (
        <div className={styles.aiError} style={{ margin: 0 }}>
          {error}
          <button type="button" className="btn btn-secondary btn-sm" onClick={load} style={{ marginLeft: 12 }}>
            Tentar novamente
          </button>
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div className={styles.emptyTableRich}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
          </svg>
          <div>Sem dados para esta segmentação</div>
          <div className={styles.emptyTableHint}>Tente um período maior ou outra dimensão.</div>
        </div>
      )}
      {!loading && !error && rows.length > 0 && (
        <div className={styles.treeWrap}>
          <table className={styles.treeTable}>
            <thead>
              <tr>
                <th>Segmento</th>
                <th>Gasto</th>
                <th>Impressões</th>
                <th>Cliques</th>
                <th>CTR</th>
                <th>CPC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{bucketLabel(r, breakdownType)}</td>
                  <td>{fmtMoney(r.spend)}</td>
                  <td>{fmtNum(r.impressions)}</td>
                  <td>{fmtNum(r.clicks)}</td>
                  <td>{fmtPct(r.ctr)}</td>
                  <td>{fmtMoney(r.cpc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
