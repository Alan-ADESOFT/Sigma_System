/**
 * components/comercial/LeadActivityTimeline.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Timeline funcional na sidebar do LeadDetailModal.
 * Renderiza 11 tipos de activities com ícones diferentes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import styles from '../../assets/style/leadActivityTimeline.module.css';

const TYPE_CONFIG = {
  note:             { icon: '💬', cls: 'iconNote',    label: 'adicionou uma nota' },
  call_logged:      { icon: '📞', cls: 'iconCall',    label: 'registrou uma ligação' },
  whatsapp_sent:    { icon: '📨', cls: 'iconWhats',   label: 'enviou WhatsApp' },
  email_sent:       { icon: '✉',  cls: 'iconWhats',   label: 'enviou e-mail' },
  status_change:    { icon: '↪',  cls: 'iconStatus',  label: 'moveu o lead' },
  ai_analysis:      { icon: '🤖', cls: 'iconAi',      label: 'rodou análise IA' },
  proposal_created: { icon: '📄', cls: 'iconProp',    label: 'criou proposta' },
  proposal_sent:    { icon: '🚀', cls: 'iconProp',    label: 'publicou proposta' },
  proposal_viewed:  { icon: '👁',  cls: 'iconViewed',  label: 'cliente abriu a proposta' },
  contract_won:     { icon: '✅', cls: 'iconWon',     label: 'fechou contrato' },
  contract_lost:    { icon: '❌', cls: 'iconLost',    label: 'marcou como perdido' },
  lead_created:     { icon: '⚡', cls: 'iconCreated', label: 'lead criado' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000)    return 'agora';
  if (ms < 3600000)  return `há ${Math.floor(ms / 60000)} min`;
  if (ms < 86400000) return `há ${Math.floor(ms / 3600000)}h`;
  return `há ${Math.floor(ms / 86400000)}d`;
}

function buildPublicLink(slug) {
  if (!slug || typeof window === 'undefined') return '';
  return `${window.location.origin}/proposta/${slug}`;
}

function renderActionLink(item) {
  const m = item.metadata || {};
  switch (item.type) {
    case 'proposal_created':
    case 'proposal_sent':
      if (m.proposalId) {
        return (
          <a
            className={styles.linkAction}
            href={`/dashboard/comercial/propostas/${m.proposalId}/edit`}
            onClick={e => e.stopPropagation()}
          >
            Abrir editor ↗
          </a>
        );
      }
      return null;
    case 'proposal_viewed':
      if (m.slug) {
        return (
          <a
            className={styles.linkAction}
            href={buildPublicLink(m.slug)}
            target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
          >
            Abrir pública ↗
          </a>
        );
      }
      return null;
    case 'contract_won':
      if (m.clientId) {
        return (
          <a
            className={styles.linkAction}
            href={`/dashboard/clients/${m.clientId}`}
            onClick={e => e.stopPropagation()}
          >
            Ver cliente ↗
          </a>
        );
      }
      return null;
    default:
      return null;
  }
}

function buildSnippet(item) {
  const m = item.metadata || {};
  if (item.content) return item.content;
  if (item.type === 'whatsapp_sent' && m.contentSnippet) {
    return `📨 ${m.contentSnippet}${m.contentSnippet.length >= 120 ? '...' : ''}`;
  }
  if (item.type === 'status_change' && m.fromColumnName && m.toColumnName) {
    return `${m.fromColumnName} → ${m.toColumnName}`;
  }
  if (item.type === 'ai_analysis' && m.sigmaScore != null) {
    return `Sigma Score: ${m.sigmaScore}/100`;
  }
  if (item.type === 'contract_lost' && m.reason) {
    return m.reason;
  }
  return null;
}

export default function LeadActivityTimeline({
  activities = [],
  currentUserId = null,
  onDelete,
  onActivityClick,
}) {
  if (activities.length === 0) {
    return (
      <div className={styles.emptyState}>
        Nenhuma atividade ainda.<br />
        Use a caixa abaixo pra adicionar uma nota.
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {activities.map(a => {
        const cfg = TYPE_CONFIG[a.type] || { icon: '●', cls: 'iconNote', label: a.type };
        const snippet = buildSnippet(a);
        const isViewedHot = a.type === 'proposal_viewed';
        const canDelete = a.created_by && a.created_by === currentUserId;

        return (
          <div
            key={a.id}
            className={styles.item}
            onClick={() => onActivityClick?.(a)}
            style={{ cursor: onActivityClick ? 'pointer' : 'default' }}
          >
            <div className={`${styles.icon} ${styles[cfg.cls]}`}>{cfg.icon}</div>
            <div className={styles.content}>
              <div className={styles.titleRow}>
                <span className={styles.title}>
                  <strong>{a.author_name || 'Sistema'}</strong> {cfg.label}
                </span>
                {isViewedHot && <span className={styles.hotBadge}>HOT</span>}
                {canDelete && (
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); onDelete?.(a); }}
                    title="Remover"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className={styles.time}>{timeAgo(a.created_at)}</div>
              {snippet && <div className={styles.snippet}>{snippet}</div>}
              {renderActionLink(a)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
