/**
 * components/ads/AdsAIInsightsModal.js
 * Modal que dispara POST /api/ads/ai-insights e renderiza o diagnóstico.
 */

import { useEffect, useState, useCallback } from 'react';
import styles from '../../assets/style/ads.module.css';
import { useNotification } from '../../context/NotificationContext';
import MarkdownRender from '../comercial/MarkdownRender';

const PRIORITY_CFG = {
  high:   { cls: 'prioHigh',   label: 'ALTA' },
  medium: { cls: 'prioMedium', label: 'MÉDIA' },
  low:    { cls: 'prioLow',    label: 'BAIXA' },
};

/* Remove o bloco ```json ...``` do markdown antes de renderizar — esse bloco
   contém os dados estruturados que já são exibidos como cards de recomendação. */
function stripJsonBlocks(md) {
  if (!md) return '';
  return md.replace(/```json[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '');
}

export default function AdsAIInsightsModal({ clientId, scope, targetId, targetName, datePreset, onClose }) {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  const generate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/ads/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, scope, targetId, targetName, datePreset }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao gerar diagnóstico');
      setReport(d.report);
    } catch (e) {
      setError(e.message);
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [clientId, scope, targetId, targetName, datePreset, notify]);

  useEffect(() => { generate(); }, [generate]);

  return (
    <div className="set-modal-overlay" onClick={onClose}>
      <div className="set-modal set-modal-wide" onClick={(e) => e.stopPropagation()} style={{ width: 'min(880px, 96vw)', maxHeight: '92vh' }}>
        <div className="set-modal-header">
          <div className="set-modal-header-title-box">
            <div className="set-modal-header-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <div>
              <h2 className="set-modal-title">Análise de IA</h2>
              <div className="set-modal-subtitle">
                Escopo: <strong>{scope}</strong>{targetName ? ` · ${targetName}` : ''}
              </div>
            </div>
          </div>
          <button type="button" className="set-modal-close-btn" onClick={onClose} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="set-modal-body" style={{ overflowY: 'auto', maxHeight: 'calc(92vh - 140px)' }}>
          {loading && (
            <div className={styles.aiLoading}>
              <div className={styles.aiSpinner} aria-hidden="true" />
              <div className={styles.aiLoadingText}>
                <strong>Gerando diagnóstico...</strong>
                <span>A IA está percorrendo o framework de tráfego pago. Pode levar 5–15 segundos.</span>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className={styles.aiError}>
              <strong>Falha:</strong> {error}
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={generate}>Tentar novamente</button>
              </div>
            </div>
          )}

          {report && !loading && (
            <>
              {Array.isArray(report.flowchartPath) && report.flowchartPath.length > 0 && (
                <div className={styles.aiSection}>
                  <div className={styles.subhead}>Caminho no framework</div>
                  <div className={styles.flowPath}>
                    {report.flowchartPath.map((step, i) => (
                      <span key={i} className={styles.flowStep}>{String(step).replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.aiSection}>
                <div className={styles.subhead}>Diagnóstico</div>
                <MarkdownRender source={stripJsonBlocks(report.diagnosis)} className={styles.aiMarkdown} />
              </div>

              {Array.isArray(report.recommendations) && report.recommendations.length > 0 && (
                <div className={styles.aiSection}>
                  <div className={styles.subhead}>Recomendações</div>
                  <ul className={styles.recList}>
                    {report.recommendations.map((rec, i) => {
                      const cfg = PRIORITY_CFG[rec.priority] || PRIORITY_CFG.medium;
                      return (
                        <li key={i} className={styles.recItem}>
                          <span className={`${styles.recPriority} ${styles[cfg.cls]}`}>{cfg.label}</span>
                          <div>
                            <div className={styles.recAction}>{rec.action}</div>
                            {rec.reason && <div className={styles.recReason}>{rec.reason}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="set-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
          {report && !loading && (
            <button type="button" className="sigma-btn-primary" onClick={generate}>Gerar de novo</button>
          )}
        </div>
      </div>
    </div>
  );
}
