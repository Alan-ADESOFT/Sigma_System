/**
 * components/image/ImageCard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Card de imagem no grid do workspace.
 *   · Status badge (queued/running/done/error)
 *   · Thumbnail lazy
 *   · Star toggle (canto superior direito)
 *   · Hover overlay com ações: Ver, Variação, Salvar Template, Mover, Deletar
 *   · Drag start: notifica o pai (FolderSidebar) que recebe o drop
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageWorkspace.module.css';

function formatRelative(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function ImageCard({
  job,
  onOpen,
  onRegenerate,
  onSaveTemplate,
  onDelete,
  onToggleStar,
  onMove,
  onDragStart,
  isSelected,
  onViewDetail,
}) {
  const isDone    = job.status === 'done' && job.result_thumbnail_url;
  const isRunning = job.status === 'queued' || job.status === 'running';
  const isError   = job.status === 'error';

  const [ctxMenu, setCtxMenu] = useState(null);
  useEffect(() => {
    if (!ctxMenu) return;
    function close() { setCtxMenu(null); }
    document.addEventListener('click', close);
    document.addEventListener('contextmenu', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
    };
  }, [ctxMenu]);

  function downloadImage() {
    if (!job.result_image_url) return;
    const a = document.createElement('a');
    a.href = job.result_image_url;
    a.download = `${job.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div
      className={styles.card}
      onClick={() => onOpen?.(job)}
      onContextMenu={(e) => {
        if (!isDone) return;
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      draggable={isDone}
      onDragStart={e => {
        if (!isDone) return;
        e.dataTransfer.setData('text/plain', job.id);
        onDragStart?.(job);
      }}
      style={isSelected ? {
        outline: '2px solid #a855f7',
        outlineOffset: 2,
        boxShadow: '0 0 0 4px rgba(168, 85, 247, 0.15)',
      } : undefined}
    >
      {/* Menu de contexto (right-click) */}
      {ctxMenu && (
        <div
          onClick={e => { e.stopPropagation(); setCtxMenu(null); }}
          style={{
            position: 'fixed',
            top: ctxMenu.y, left: ctxMenu.x,
            zIndex: 9999,
            background: 'var(--surface-1, #1a1a1a)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            padding: 4,
            minWidth: 180,
            display: 'flex', flexDirection: 'column',
          }}
        >
          {[
            { icon: 'edit',     label: 'Editar com IA',  fn: () => onOpen?.(job) },
            { icon: 'eye',      label: 'Ver detalhes',   fn: () => onViewDetail?.(job) },
            { icon: 'refresh',  label: 'Variação',       fn: () => onRegenerate?.(job) },
            { icon: 'download', label: 'Baixar',         fn: downloadImage },
            { icon: 'layers',   label: 'Salvar template', fn: () => onSaveTemplate?.(job) },
            { icon: 'star',     label: job.is_starred ? 'Remover favorito' : 'Favoritar', fn: () => onToggleStar?.(job) },
            { icon: 'trash',    label: 'Apagar',         fn: () => onDelete?.(job), danger: true },
          ].map((it, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => { e.stopPropagation(); setCtxMenu(null); it.fn(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                color: it.danger ? '#ff6680' : 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.75rem',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 4,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon name={it.icon} size={12} />
              {it.label}
            </button>
          ))}
        </div>
      )}

      {/* Status badge */}
      {isRunning && (
        <span className={`${styles.cardStatusBadge} ${styles.running}`}>
          <span className={styles.cardStatusDot} />
          gerando
        </span>
      )}
      {isError && (
        <span className={`${styles.cardStatusBadge} ${styles.error}`}>
          <Icon name="x" size={9} />
          falha
        </span>
      )}

      {/* Star toggle */}
      {isDone && (
        <button
          type="button"
          className={`${styles.cardStar} ${job.is_starred ? styles.starred : ''}`}
          onClick={e => { e.stopPropagation(); onToggleStar?.(job); }}
          title={job.is_starred ? 'Remover dos favoritos' : 'Marcar favorito'}
          aria-label="Toggle favorito"
        >
          <Icon name="star" size={12} />
        </button>
      )}

      {/* Thumbnail ou placeholder */}
      {isDone ? (
        <img
          src={job.result_thumbnail_url || job.result_image_url}
          alt={job.raw_description?.slice(0, 60) || 'Imagem gerada'}
          loading="lazy"
          className={styles.cardThumb}
          // Fix: o <img> nativo intercepta o context menu mostrando "Salvar
          // imagem como…" do browser. preventDefault aqui faz nosso menu vencer.
          onContextMenu={(e) => {
            if (!isDone) return;
            e.preventDefault();
            e.stopPropagation();
            setCtxMenu({ x: e.clientX, y: e.clientY });
          }}
          // Drag também precisa ser desabilitado pra não conflitar com
          // o drag-and-drop nosso (pasta).
          draggable={false}
        />
      ) : (
        <div className={styles.cardEmpty}>
          {isError ? (
            <>
              <Icon name="alert" size={20} />
              <div style={{ marginTop: 8 }}>{(job.error_message || 'Erro').slice(0, 60)}</div>
            </>
          ) : (
            <>
              <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              <div style={{ marginTop: 8 }}>{job.status}</div>
            </>
          )}
        </div>
      )}

      {/* Hover overlay com ações + meta */}
      {isDone && (
        <div
          className={styles.cardOverlay}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCtxMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <div className={styles.cardActions}>
            <button type="button" className={styles.cardBtn} onClick={e => { e.stopPropagation(); onOpen?.(job); }}>
              <Icon name="eye" size={11} />
              Ver
            </button>
            <button type="button" className={styles.cardBtn} onClick={e => { e.stopPropagation(); onRegenerate?.(job); }}>
              <Icon name="refresh" size={11} />
              Variação
            </button>
            <button type="button" className={styles.cardBtn} onClick={e => { e.stopPropagation(); onSaveTemplate?.(job); }}>
              <Icon name="layers" size={11} />
              Template
            </button>
            {onMove && (
              <button type="button" className={styles.cardBtn} onClick={e => { e.stopPropagation(); onMove(job); }}>
                <Icon name="folder" size={11} />
                Mover
              </button>
            )}
            <button type="button" className={`${styles.cardBtn} ${styles.danger}`} onClick={e => { e.stopPropagation(); onDelete?.(job); }}>
              <Icon name="trash" size={11} />
            </button>
          </div>
          <div className={styles.cardMeta}>
            <span>{job.model}</span>
            <span>{formatRelative(job.created_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
