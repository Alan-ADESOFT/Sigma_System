/**
 * components/comercial/CommercialFunnelChart.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Funil customizado em barras horizontais.
 * Largura proporcional ao maior leadCount.
 * Cor da coluna do kanban. Click navega pra pipeline?columnId=X.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRouter } from 'next/router';
import styles from '../../assets/style/comercialDashboard.module.css';

export default function CommercialFunnelChart({ stages = [] }) {
  const router = useRouter();
  if (stages.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
        Sem leads no pipeline
      </div>
    );
  }

  const maxCount = Math.max(...stages.map(s => s.leadCount || 0), 1);

  return (
    <div className={styles.funnelList}>
      {stages.map(s => {
        const pct = ((s.leadCount || 0) / maxCount) * 100;
        return (
          <div
            key={s.columnId}
            className={styles.funnelRow}
            onClick={() => router.push(`/dashboard/comercial/pipeline?columnId=${s.columnId}`)}
            title={`${s.name} — ${s.leadCount} leads`}
          >
            <span className={styles.funnelLabel}>
              <span className={styles.funnelDot} style={{ background: s.color || 'var(--brand-500)' }} />
              {s.name}
            </span>
            <div className={styles.funnelBarWrap}>
              <div
                className={styles.funnelBar}
                style={{
                  width: `${Math.max(6, pct)}%`,
                  background: `linear-gradient(90deg, ${s.color || '#6366F1'}88, ${s.color || '#6366F1'})`,
                }}
              >
                {s.leadCount > 0 ? s.leadCount : ''}
              </div>
            </div>
            <span className={styles.funnelCount}>{s.leadCount || 0}</span>
            <span className={styles.funnelConv}>
              {s.conversionPct != null ? `${s.conversionPct}%` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
