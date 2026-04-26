/**
 * components/comercial/ProposalCard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Card de proposta na listagem.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRouter } from 'next/router';
import styles from '../../assets/style/proposalsList.module.css';
import { useNotification } from '../../context/NotificationContext';

const STATUS_LABEL = {
  draft:     'Rascunho',
  published: 'Publicada',
  expired:   'Expirada',
  won:       'Ganha',
  lost:      'Perdida',
};
const STATUS_CLASS = {
  draft:     styles.statusDraft,
  published: styles.statusPublished,
  expired:   styles.statusExpired,
  won:       styles.statusWon,
  lost:      styles.statusLost,
};

function fmtTime(secs) {
  if (!secs) return '0s';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ' ' + (m % 60) + 'min' : ''}`;
}

function fmtExpires(iso, status) {
  if (status === 'expired') return 'expirada';
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expirada';
  const d = Math.floor(ms / 86400000);
  if (d > 0) return `${d}d restantes`;
  const h = Math.floor(ms / 3600000);
  return `${h}h restantes`;
}

export default function ProposalCard({ proposal, onDelete, onDuplicate, onOpenEdit, baseUrl }) {
  const router = useRouter();
  const { notify } = useNotification();

  const status = proposal.status || 'draft';
  const statusClass = STATUS_CLASS[status] || styles.statusDraft;
  const publicUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/proposta/${proposal.slug}` : `/proposta/${proposal.slug}`;

  function copy(text, label = 'Copiado') {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => notify(label, 'success', { duration: 1800 }));
  }

  function open() {
    if (onOpenEdit) { onOpenEdit(proposal); return; }
    router.push(`/dashboard/comercial/propostas/${proposal.id}/edit`);
  }

  return (
    <div className={`glass-card glass-card-hover ${styles.card}`} onClick={open}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>{proposal.client_name || proposal.prospect_name || 'Proposta'}</span>
        <span className={`${styles.statusBadge} ${statusClass}`}>{STATUS_LABEL[status]}</span>
      </div>

      <div className={styles.slugRow} onClick={e => e.stopPropagation()}>
        <code>/proposta/{proposal.slug}</code>
        <button className={styles.slugCopy} onClick={() => copy(publicUrl, 'Link copiado')} title="Copiar link público">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>

      <div className={styles.metaRow}>
        <span>
          {proposal.published_at
            ? `Publicada em ${new Date(proposal.published_at).toLocaleDateString('pt-BR')}`
            : `Criada em ${new Date(proposal.created_at).toLocaleDateString('pt-BR')}`}
        </span>
        <span>{fmtExpires(proposal.expires_at, status)}</span>
      </div>

      {status !== 'draft' && (
        <div className={styles.kpisRow}>
          <span className="kpi" title="Visualizações totais" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <strong>{proposal.view_count || 0}</strong>
          </span>
          <span className="kpi" title="Tempo total na página" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <strong>{fmtTime(proposal.total_time_seconds || 0)}</strong>
          </span>
          <span className="kpi" title="Scroll máximo" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6"  y1="20" x2="6"  y2="14" />
            </svg>
            <strong>{proposal.max_scroll_pct || 0}%</strong>
          </span>
        </div>
      )}

      <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
        <button className={styles.iconBtn} onClick={open}>Editar</button>
        {status === 'published' && (
          <a className={styles.iconBtn} href={publicUrl} target="_blank" rel="noreferrer">Ver pública</a>
        )}
        <button className={styles.iconBtn} onClick={() => copy(publicUrl, 'Link copiado')}>Copiar link</button>
        <button className={styles.iconBtn} onClick={() => onDuplicate?.(proposal)}>Duplicar</button>
        <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete?.(proposal)}>Deletar</button>
      </div>
    </div>
  );
}
