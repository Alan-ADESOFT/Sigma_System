/**
 * components/contentPlanning/PlanCard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Card do Kanban de planejamentos. Mostra logo + nome do cliente, titulo,
 * objetivo (resumo), stats (total, aprovados), barra de progresso, due_date e
 * responsavel. Borda lateral com a cor do status atual.
 *
 * Drag-and-drop nativo HTML5: o container Kanban controla via dataTransfer.
 *
 * Props:
 *   plan       — registro retornado por /api/content-planning/plans
 *   onOpen     — () => void  (click no card)
 *   onMenu     — (planId, action) => void  ('info' | 'edit' | 'clone' | 'share' | 'delete')
 *   onDragStart, onDragEnd — handlers nativos
 *   dragging   — bool (estado visual)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useEffect } from 'react';
import styles from '../../assets/style/contentPlanning.module.css';

function initials(name) {
  return (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function formatDueDate(d) {
  if (!d) return null;
  try {
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch { return null; }
}

export default function PlanCard({ plan, onOpen, onMenu, onDragStart, onDragEnd, dragging }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  const total = Number(plan.creative_count || 0);
  const approved = Number(plan.approved_count || 0);
  const progress = total > 0 ? Math.round((approved / total) * 100) : 0;
  const dueLabel = formatDueDate(plan.due_date);
  const objectivePreview = (plan.objective || '').slice(0, 110);

  function handleMenuClick(e, action) {
    e.stopPropagation();
    setMenuOpen(false);
    onMenu?.(plan.id, action);
  }

  return (
    <div
      className={`${styles.planCard} ${dragging ? styles.planCardDragging : ''}`}
      style={{ '--statusColor': plan.status_color || 'var(--text-muted)' }}
      draggable
      onDragStart={(e) => onDragStart?.(e, plan)}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      <div className={styles.planCardHeader}>
        {plan.client_logo_url ? (
          <img src={plan.client_logo_url} alt="" className={styles.planLogo} />
        ) : (
          <div className={styles.planLogo}>{initials(plan.client_company_name)}</div>
        )}
        <div className={styles.planCardClient} title={plan.client_company_name || ''}>
          {plan.client_company_name || '—'}
        </div>

        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={styles.planCardMenuBtn}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
            title="Opções"
            aria-label="Opções do planejamento"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="animate-scale-in"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                minWidth: 170,
                background: 'linear-gradient(145deg, rgba(17,17,17,0.99), rgba(10,10,10,0.99))',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
              <MenuItem label="Ver detalhes" iconPath="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" onClick={(e) => handleMenuClick(e, 'info')} />
              <MenuItem label="Editar" iconPath="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" onClick={(e) => handleMenuClick(e, 'edit')} />
              <MenuItem label="Duplicar" iconPath="M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" onClick={(e) => handleMenuClick(e, 'clone')} />
              <MenuItem label="Gerar link" iconPath="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" onClick={(e) => handleMenuClick(e, 'share')} />
              <div style={{ height: 1, background: 'var(--border-default)' }} />
              <MenuItem label="Excluir" iconPath="M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6" danger onClick={(e) => handleMenuClick(e, 'delete')} />
            </div>
          )}
        </div>
      </div>

      <div className={styles.planCardTitle}>{plan.title}</div>

      {objectivePreview && (
        <div style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
          lineHeight: 1.45,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {objectivePreview}{plan.objective && plan.objective.length > 110 ? '…' : ''}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div className={styles.planCardStats}>
        <span className={styles.planCardStatChip}>
          <Icon path="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          {total} {total === 1 ? 'peça' : 'peças'}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span className={styles.planCardStatChip}>
          <Icon path="M20 6L9 17l-5-5" />
          {approved}/{total}
        </span>
      </div>

      <div className={styles.planCardProgressBar}>
        <div className={styles.planCardProgressFill} style={{ width: `${progress}%` }} />
      </div>

      <div className={styles.planCardFooter}>
        {dueLabel ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon path="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18" />
            {dueLabel}
          </span>
        ) : <span style={{ opacity: 0.5 }}>Sem prazo</span>}
        {plan.owner_name && (
          <span className={styles.planCardOwner}>
            <Icon path="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            {plan.owner_name.split(' ')[0].toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

function MenuItem({ label, iconPath, onClick, danger }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 12px',
        background: hover ? (danger ? 'rgba(255,0,51,0.06)' : 'rgba(255,255,255,0.03)') : 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.65rem',
        letterSpacing: '0.06em',
        textAlign: 'left',
        color: danger ? 'var(--brand-400)' : 'var(--text-secondary)',
      }}
    >
      {iconPath && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
          <path d={iconPath} />
        </svg>
      )}
      {label}
    </button>
  );
}

function Icon({ path }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}
