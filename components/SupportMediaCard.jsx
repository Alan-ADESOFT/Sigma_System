/**
 * components/SupportMediaCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Card visual de UM anexo (PDF, DOCX, imagem ou genérico) na página do módulo.
 *
 * Imagens ganham miniatura clicável que abre lightbox fullscreen no parent.
 * PDFs/DOCX/outros mostram ícone + botão "Baixar".
 *
 * Props:
 *   - media: registro de support_media (kind='attachment')
 *   - onDelete(media): se presente, mostra botão de lixeira (admin)
 *   - onPreviewImage(media): abre lightbox no parent (só p/ imagens)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import styles from '../assets/style/support.module.css';

function fmtSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function classifyMedia(media) {
  const mime = (media?.mime_type || '').toLowerCase();
  if (mime.startsWith('image/'))  return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('word') || mime.includes('document')) return 'doc';
  return 'generic';
}

/* ─── Ícones inline (consistente com o resto do projeto) ──────────────── */
function IconPdf() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <text x="7" y="18" fontSize="6" fontFamily="monospace" fill="currentColor" stroke="none">PDF</text>
    </svg>
  );
}
function IconDoc() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}
function IconFile() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </svg>
  );
}

export default function SupportMediaCard({ media, onDelete, onPreviewImage }) {
  if (!media) return null;
  const kind = classifyMedia(media);
  const label = (media.title || media.file_name || 'Arquivo').toString();
  const sizeLabel = fmtSize(media.file_size_bytes);

  return (
    <div className={styles.mediaCard}>
      <div className={styles.mediaCardTop}>
        {kind === 'image' ? (
          <img
            src={media.file_url}
            alt={label}
            className={styles.mediaThumb}
            onClick={() => onPreviewImage && onPreviewImage(media)}
          />
        ) : (
          <span
            className={`${styles.mediaIcon} ${
              kind === 'pdf' ? styles.mediaIconPdf
              : kind === 'doc' ? styles.mediaIconDoc
              : ''
            }`}
          >
            {kind === 'pdf' ? <IconPdf /> : kind === 'doc' ? <IconDoc /> : <IconFile />}
          </span>
        )}
        <div className={styles.mediaInfo}>
          <span className={styles.mediaName} title={label}>{label}</span>
          {sizeLabel && <span className={styles.mediaSize}>{sizeLabel}</span>}
          {media.description && (
            <span className={styles.mediaSize} style={{ textTransform: 'none', letterSpacing: 0 }}>
              {media.description}
            </span>
          )}
        </div>
      </div>

      <div className={styles.mediaActions}>
        <a
          className={styles.downloadBtn}
          href={media.file_url}
          download={media.file_name || ''}
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconDownload /> Baixar
        </a>
        {onDelete && (
          <button
            type="button"
            className={styles.mediaDeleteBtn}
            title="Excluir mídia"
            onClick={() => onDelete(media)}
          >
            <IconTrash />
          </button>
        )}
      </div>
    </div>
  );
}
