/**
 * components/image/HistoryStrip.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Strip horizontal de thumbnails do histórico.
 * Substitui o grid 2D embaixo do preview no ImageGeneratorModal.
 *
 *   ◀  [thumb] [thumb] [thumb] [thumb] ...  ▶
 *
 * Recursos:
 *   · Scroll horizontal com `scroll-behavior: smooth`
 *   · Setas flutuantes nas extremidades (scrollBy ±300px)
 *   · Border colorido (--accent / --brand-500) na thumb selecionada
 *   · Click numa thumb: troca preview principal sem fechar modal (já é
 *     o comportamento — só repassamos onClick)
 *   · onContextMenu emite evento pra parent abrir menu custom
 *   · Tecla → no parent: rola pra próxima thumb
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState, useEffect } from 'react';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageModal.module.css';

const STATUS_LABELS = {
  queued:  'Na fila',
  running: 'Gerando',
  done:    'Pronto',
  error:   'Falha',
  cancelled: 'Cancelado',
};

export default function HistoryStrip({
  jobs,
  selectedId,
  loading,
  onSelect,
  onContextMenu,
}) {
  const stripRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  function updateArrows() {
    const el = stripRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }

  useEffect(() => {
    updateArrows();
    const el = stripRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [jobs.length]);

  // Quando muda a seleção, garante que a thumb selecionada está visível
  useEffect(() => {
    if (!selectedId || !stripRef.current) return;
    const node = stripRef.current.querySelector(`[data-job-id="${selectedId}"]`);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [selectedId]);

  function scrollBy(dir) {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 300, behavior: 'smooth' });
  }

  return (
    <div className={styles.historyStripWrap}>
      {canLeft && (
        <button
          type="button"
          className={`${styles.historyStripArrow} ${styles.left}`}
          onClick={() => scrollBy(-1)}
          aria-label="Rolar histórico para a esquerda"
        >
          <Icon name="chevronLeft" size={14} />
        </button>
      )}

      <div ref={stripRef} className={styles.historyStrip}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${styles.historyStripThumb} skeleton`} />
          ))
        ) : jobs.length === 0 ? (
          <div className={styles.historyStripEmpty}>
            Nenhuma imagem ainda — gere a primeira pelo painel à esquerda.
          </div>
        ) : (
          jobs.map((j) => {
            const isSelected = selectedId === j.id;
            const isDone = j.status === 'done' && j.result_thumbnail_url;
            const isRunning = j.status === 'queued' || j.status === 'running';
            const isError = j.status === 'error';
            return (
              <div
                key={j.id}
                data-job-id={j.id}
                className={`${styles.historyStripThumb} ${isSelected ? styles.selected : ''}`}
                onClick={() => onSelect?.(j)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu?.(j, { x: e.clientX, y: e.clientY });
                }}
                title={j.raw_description?.slice(0, 100) || STATUS_LABELS[j.status]}
              >
                {isDone && <img src={j.result_thumbnail_url} alt="" loading="lazy" />}
                {isRunning && (
                  <div className={`${styles.historyStripStatus} ${styles.running}`}>
                    <span className={styles.dot} />
                    <span>{STATUS_LABELS[j.status]}</span>
                  </div>
                )}
                {isError && (
                  <div className={`${styles.historyStripStatus} ${styles.error}`}>
                    <Icon name="alert" size={12} />
                    <span>Falha</span>
                  </div>
                )}
                {!isDone && !isRunning && !isError && (
                  <div className={styles.historyStripStatus}>
                    <span style={{ fontSize: '0.55rem' }}>{j.status}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {canRight && (
        <button
          type="button"
          className={`${styles.historyStripArrow} ${styles.right}`}
          onClick={() => scrollBy(1)}
          aria-label="Rolar histórico para a direita"
        >
          <Icon name="chevronRight" size={14} />
        </button>
      )}
    </div>
  );
}
