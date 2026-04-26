/**
 * components/ads/AdsAnomaliesPanel.js
 * Painel destacado no topo do dashboard quando há anomalias abertas.
 */

import styles from '../../assets/style/ads.module.css';

const TYPE_LABELS = {
  cpa_spike:      'Pico de CPA',
  roas_drop:      'Queda de ROAS',
  frequency_high: 'Frequência alta',
  no_sales_3d:    'Sem conversões',
  budget_burn:    'Queima de budget',
};

const SEVERITY_CFG = {
  high:   { cls: 'sevHigh',   label: 'ALTA' },
  medium: { cls: 'sevMedium', label: 'MÉDIA' },
  low:    { cls: 'sevLow',    label: 'BAIXA' },
};

export default function AdsAnomaliesPanel({ anomalies = [], onAcknowledge, onResolve, onSelect }) {
  if (!anomalies || anomalies.length === 0) return null;
  return (
    <div className={`glass-card ${styles.anomaliesCard}`}>
      <div className={styles.anomaliesHeader}>
        <div className={styles.anomaliesTitle}>
          <span className={styles.warnDot} aria-hidden="true" />
          {anomalies.length} anomalia{anomalies.length !== 1 ? 's' : ''} aberta{anomalies.length !== 1 ? 's' : ''}
        </div>
      </div>
      <ul className={styles.anomaliesList}>
        {anomalies.slice(0, 5).map((a) => {
          const sev = SEVERITY_CFG[a.severity] || SEVERITY_CFG.medium;
          return (
            <li key={a.id} className={styles.anomalyItem}>
              <span className={`${styles.anomalySev} ${styles[sev.cls]}`}>{sev.label}</span>
              <div className={styles.anomalyBody}>
                <div className={styles.anomalyTitleLine}>
                  <strong>{TYPE_LABELS[a.anomaly_type] || a.anomaly_type}</strong>
                  <span className={styles.anomalyTarget}>· {a.target_name || a.target_id}</span>
                </div>
                <div className={styles.anomalyDesc}>{a.description}</div>
              </div>
              <div className={styles.anomalyActions}>
                {a.status === 'open' && (
                  <>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAcknowledge?.(a)}>
                      Reconhecer
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onResolve?.(a)}>
                      Resolver
                    </button>
                  </>
                )}
                {onSelect && (
                  <button type="button" className={styles.linkBtn} onClick={() => onSelect(a)} aria-label="Ver detalhes">
                    Detalhes →
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
