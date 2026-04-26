/**
 * components/comercial/KanbanCard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Card de lead arrastável no Kanban.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import styles from '../../assets/style/comercialKanban.module.css';

function shortDomain(u) {
  if (!u) return '';
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000)        return 'agora';
  if (ms < 3600000)      return `${Math.floor(ms / 60000)}min`;
  if (ms < 86400000)     return `${Math.floor(ms / 3600000)}h`;
  return `${Math.floor(ms / 86400000)}d`;
}

function scoreClass(score) {
  if (score >= 70) return styles.scoreHigh;
  if (score >= 40) return styles.scoreMid;
  return styles.scoreLow;
}

function initials(name) {
  if (!name) return '·';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function KanbanCard({ lead, isDragging, isSelected, onDragStart, onDragEnd, onClick, onToggleSelect, onDelete }) {
  const score = Number(lead.sigma_score || 0);

  function handleClick(e) {
    // Shift+click ou Cmd/Ctrl+click → seleciona pra bulk
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onToggleSelect?.(lead.id);
      return;
    }
    onClick?.(e);
  }

  function handleDeleteClick(e) {
    e.stopPropagation();
    e.preventDefault();
    onDelete?.(lead);
  }

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      className={`${styles.card} ${isDragging ? styles.dragging : ''}`}
      style={isSelected ? { outline: '2px solid var(--brand-500)', outlineOffset: '-2px' } : undefined}
    >
      {onDelete && (
        <button
          type="button"
          className={styles.cardDeleteBtn}
          onClick={handleDeleteClick}
          title="Excluir lead"
          aria-label="Excluir lead"
          onMouseDown={(e) => e.stopPropagation()}
          draggable={false}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      )}

      <div className={styles.cardCompany} title={lead.company_name} style={{ paddingRight: 24 }}>
        {lead.company_name}
      </div>

      {lead.phone && (
        <div className={styles.cardRow}>
          <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.phone}
          </span>
        </div>
      )}

      {lead.website && (
        <div className={styles.cardRow}>
          <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shortDomain(lead.website)}
          </span>
        </div>
      )}

      <div className={styles.cardFooter}>
        <span className={`${styles.scoreBadge} ${scoreClass(score)}`}>
          {score}/100
        </span>
        <span className={styles.lastActivity}>{timeAgo(lead.last_activity_at)}</span>
        {lead.assigned_to && (
          <div className={styles.assignedAvatar} title={lead.assigned_name || ''}>
            {lead.assigned_avatar
              ? <img src={lead.assigned_avatar} alt="" />
              : <span>{initials(lead.assigned_name)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
