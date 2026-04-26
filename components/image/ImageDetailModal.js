/**
 * components/image/ImageDetailModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal fullscreen para visualizar uma imagem específica + toda metadata.
 * Ações: Download, Variação, Salvar Template, Mover Pasta, Deletar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageGeneration.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

export default function ImageDetailModal({
  job,
  onClose,
  onRegenerate,
  onSaveTemplate,
  onDelete,
  onToggleStar,
}) {
  const { notify } = useNotification();

  useEffect(() => {
    function onEsc(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  if (!job) return null;

  function download() {
    if (!job.result_image_url) return;
    const link = document.createElement('a');
    link.href = job.result_image_url;
    link.download = `${job.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('Download iniciado', 'success');
  }

  function copyPrompt() {
    if (!job.optimized_prompt) return;
    try {
      navigator.clipboard.writeText(job.optimized_prompt);
      notify('Prompt copiado', 'success');
    } catch {
      notify('Não foi possível copiar', 'error');
    }
  }

  const refsArray = (() => {
    try {
      return Array.isArray(job.reference_image_urls)
        ? job.reference_image_urls
        : JSON.parse(job.reference_image_urls || '[]');
    } catch { return []; }
  })();

  return (
    <div className={styles.detailOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.detailCard} onClick={e => e.stopPropagation()}>
        {/* Imagem grande */}
        <div className={styles.detailImageWrap}>
          {job.result_image_url ? (
            <img src={job.result_image_url} alt={job.raw_description?.slice(0, 80) || 'Imagem'} className={styles.detailImage} />
          ) : (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
              Imagem ainda não disponível
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className={styles.detailMeta}>
          <div className={styles.detailMetaTitle}>
            <span>{job.format} · {job.aspect_ratio}</span>
            <button type="button" className="btn btn-icon btn-secondary" onClick={onClose} aria-label="Fechar">
              <Icon name="x" size={12} />
            </button>
          </div>

          <div className={styles.detailField}>
            <span className={styles.detailFieldLabel}>Descrição</span>
            <span className={styles.detailFieldValue}>{job.raw_description}</span>
          </div>

          {job.observations && (
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Observações</span>
              <span className={styles.detailFieldValue}>{job.observations}</span>
            </div>
          )}

          {job.optimized_prompt && (
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Prompt otimizado</span>
              <span className={`${styles.detailFieldValue} mono`} style={{ whiteSpace: 'pre-wrap' }}>{job.optimized_prompt}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={copyPrompt} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                <Icon name="copy" size={11} />
                copiar
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Modelo</span>
              <span className={`${styles.detailFieldValue} mono`}>{job.model}</span>
            </div>
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Provedor</span>
              <span className={`${styles.detailFieldValue} mono`}>{job.provider}</span>
            </div>
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Tempo</span>
              <span className={`${styles.detailFieldValue} mono`}>
                {job.duration_ms ? `${(job.duration_ms / 1000).toFixed(1)}s` : '—'}
              </span>
            </div>
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Custo</span>
              <span className={`${styles.detailFieldValue} mono`}>
                {job.cost_usd ? `$${parseFloat(job.cost_usd).toFixed(4)}` : '—'}
              </span>
            </div>
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Brandbook usado</span>
              <span className={`${styles.detailFieldValue} mono`}>
                {job.brandbook_used ? 'Sim' : 'Não'}
              </span>
            </div>
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Criada</span>
              <span className={`${styles.detailFieldValue} mono`}>{formatDate(job.created_at)}</span>
            </div>
          </div>

          {refsArray.length > 0 && (
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Referências usadas</span>
              <div className={styles.detailRefsRow}>
                {refsArray.map((url, i) => (
                  <img key={i} src={url} alt={`Ref ${i + 1}`} />
                ))}
              </div>
            </div>
          )}

          <div className={styles.detailActions}>
            <button type="button" className="sigma-btn-primary btn-sm" onClick={download} disabled={!job.result_image_url}>
              <Icon name="download" size={11} />
              Download
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRegenerate?.(job)}>
              <Icon name="refresh" size={11} />
              Variação
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSaveTemplate?.(job)}>
              <Icon name="layers" size={11} />
              Salvar Template
            </button>
            {onToggleStar && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onToggleStar(job)}>
                <Icon name="star" size={11} />
                {job.is_starred ? 'Remover favorito' : 'Favoritar'}
              </button>
            )}
            <button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete?.(job)}>
              <Icon name="trash" size={11} />
              Apagar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
