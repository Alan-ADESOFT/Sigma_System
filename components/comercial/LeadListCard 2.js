/**
 * components/comercial/LeadListCard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Card de uma lista de leads (Apify ou CSV).
 * Mostra status, totais, countdown de expiração e ações.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRouter } from 'next/router';
import styles from '../../assets/style/comercialCaptacao.module.css';

const STATUS_LABEL = {
  pending:   'Pendente',
  running:   'Rodando',
  completed: 'Concluída',
  failed:    'Falhou',
};

const STATUS_CLASS = {
  pending:   styles.statusPending,
  running:   styles.statusRunning,
  completed: styles.statusCompleted,
  failed:    styles.statusFailed,
};

function formatExpiresIn(expiresAt) {
  if (!expiresAt) return '—';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expirada';
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export default function LeadListCard({ list, onDelete, onExport, onImport }) {
  const router = useRouter();
  const statusClass = STATUS_CLASS[list.status] || styles.statusPending;

  function handleOpen() {
    router.push(`/dashboard/comercial/captacao/${list.id}`);
  }

  return (
    <div className={`glass-card glass-card-hover ${styles.listCard}`} onClick={handleOpen}>
      <div className={styles.listCardHeader}>
        <span className={styles.listCardName}>{list.name}</span>
        <span className={`${styles.statusBadge} ${statusClass}`}>
          {STATUS_LABEL[list.status] || list.status}
        </span>
      </div>

      <div className={styles.metaRow}>
        <span className={styles.sourceTag}>{list.source}</span>
        <span>
          <strong>{list.leadsCount ?? list.totalLeads ?? 0}</strong> leads
          {' · '}
          <strong>{list.importedCount ?? 0}</strong> importados
        </span>
      </div>

      <div className={styles.metaRow}>
        <span>Expira em <strong>{formatExpiresIn(list.expiresAt)}</strong></span>
        <span>{new Date(list.createdAt).toLocaleDateString('pt-BR')}</span>
      </div>

      {list.status === 'failed' && list.errorMessage && (
        <div className={styles.smallMuted} style={{ color: 'var(--brand-400)' }}>
          ⚠ {String(list.errorMessage).slice(0, 80)}
        </div>
      )}

      <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
        <button className={styles.iconBtn} onClick={handleOpen}>Ver</button>
        <button className={styles.iconBtn} onClick={() => onExport?.(list)}>Exportar</button>
        <button className={styles.iconBtn} onClick={() => onImport?.(list)}>Importar</button>
        <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete?.(list)}>Deletar</button>
      </div>
    </div>
  );
}
