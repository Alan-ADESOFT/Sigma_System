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
}) {
  const isDone    = job.status === 'done' && job.result_thumbnail_url;
  const isRunning = job.status === 'queued' || job.status === 'running';
  const isError   = job.status === 'error';

  return (
    <div
      className={styles.card}
      onClick={() => onOpen?.(job)}
      draggable={isDone}
      onDragStart={e => {
        if (!isDone) return;
        e.dataTransfer.setData('text/plain', job.id);
        onDragStart?.(job);
      }}
    >
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
        <div className={styles.cardOverlay}>
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
