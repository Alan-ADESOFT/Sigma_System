/**
 * components/MediaUploader.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Componente de upload de mídia (imagem ou vídeo).
 *
 * Props:
 *   accept       'image' | 'video' | 'both'  (default: 'both')
 *   multiple     boolean — permite múltiplos uploads (carrossel)
 *   value        Array<{ url, kind, mime, size }> — uploads atuais
 *   onChange     (newValue) => void
 *   label        string — label customizado
 *
 * Validação client-side básica antes do upload (defesa em profundidade,
 * a validação real fica no backend /api/upload).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef } from 'react';
import { useNotification } from '../context/NotificationContext';
import styles from '../assets/style/mediaUploader.module.css';

// Presets nomeados. `accept` aceita também uma string CSV livre de MIMEs
// (ex: "application/pdf,image/png") — sprint Central de Suporte ampliou o
// componente sem quebrar quem usa os presets antigos.
const ACCEPT_MAP = {
  image:    'image/jpeg,image/png,image/webp,image/gif',
  video:    'video/mp4,video/quicktime,video/webm',
  both:     'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm',
  document: 'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword',
};

const MAX_IMAGE_BYTES    = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES    = 100 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Resolve o `accept` da prop: preset nomeado OU string CSV livre. */
function resolveAccept(accept) {
  if (typeof accept !== 'string') return ACCEPT_MAP.both;
  if (ACCEPT_MAP[accept]) return ACCEPT_MAP[accept];
  // Considera CSV livre se contém '/' (sniff básico de MIME) ou vírgula
  if (accept.includes('/') || accept.includes(',')) return accept;
  return ACCEPT_MAP.both;
}

/** Classifica o MIME pra escolher o limite de tamanho certo. */
function maxBytesFor(mime) {
  if (mime?.startsWith('video/')) return MAX_VIDEO_BYTES;
  if (mime === 'application/pdf'
      || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || mime === 'application/msword') return MAX_DOCUMENT_BYTES;
  return MAX_IMAGE_BYTES;
}

function limitLabelFor(mime) {
  if (mime?.startsWith('video/')) return '100MB';
  if (mime === 'application/pdf'
      || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || mime === 'application/msword') return '25MB';
  return '10MB';
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MediaUploader({
  accept = 'both',
  multiple = false,
  value = [],
  onChange,
  label,
}) {
  const { notify } = useNotification();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files) {
    if (!files || files.length === 0) return;

    const list = Array.from(files);

    // Filtra por tipo aceito (validação CLIENT-side, complemento ao backend)
    const acceptedTypes = resolveAccept(accept).split(',').map((s) => s.trim()).filter(Boolean);
    const filtered = list.filter((f) => acceptedTypes.includes(f.type));
    if (filtered.length < list.length) {
      notify('Alguns arquivos foram ignorados (tipo não aceito)', 'info');
    }
    if (filtered.length === 0) {
      notify('Tipo de arquivo não aceito', 'error');
      return;
    }

    // Valida tamanho — limite varia por tipo (vídeo 100MB, doc 25MB, imagem 10MB)
    for (const f of filtered) {
      const max = maxBytesFor(f.type);
      if (f.size > max) {
        notify(`${f.name}: excede ${limitLabelFor(f.type)}`, 'error');
        return;
      }
    }

    setUploading(true);
    const uploaded = [];

    for (const file of filtered) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
          uploaded.push({
            url: data.url,
            localPath: data.localPath,
            kind: data.kind,
            mime: data.mimeType,
            size: data.sizeBytes,
            name: file.name,
          });
        } else {
          notify(`${file.name}: ${data.error || 'falha no upload'}`, 'error');
        }
      } catch (err) {
        notify(`${file.name}: erro de rede`, 'error');
      }
    }

    setUploading(false);

    if (uploaded.length > 0) {
      notify(`${uploaded.length} arquivo(s) enviado(s)`, 'success');
      const next = multiple ? [...value, ...uploaded] : [uploaded[0]];
      onChange?.(next);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleRemove(i) {
    const next = value.filter((_, idx) => idx !== i);
    onChange?.(next);
  }

  return (
    <div className={styles.wrapper}>
      {label && <div className={styles.label}>{label}</div>}

      <div
        className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''} ${uploading ? styles.uploading : ''}`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <>
            <div className="spinner" />
            <div className={styles.dropText}>// enviando...</div>
          </>
        ) : (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className={styles.dropText}>
              Arraste {accept === 'video' ? 'um vídeo'
                : accept === 'image' ? 'uma imagem'
                : accept === 'document' ? 'um documento'
                : 'um arquivo'} ou clique para selecionar
            </div>
            <div className={styles.dropHint}>
              {accept === 'video' && 'MP4, MOV, WebM · até 100MB'}
              {accept === 'image' && 'JPG, PNG, WebP, GIF · até 10MB'}
              {accept === 'document' && 'PDF, DOCX · até 25MB'}
              {accept === 'both' && 'JPG/PNG/WebP/GIF (10MB) · MP4/MOV/WebM (100MB)'}
              {accept !== 'video' && accept !== 'image' && accept !== 'document' && accept !== 'both'
                && 'Tipos aceitos: ver o seu acesso · vídeo 100MB · documento 25MB · imagem 10MB'}
            </div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={resolveAccept(accept)}
          multiple={multiple}
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />
      </div>

      {value.length > 0 && (
        <div className={styles.previews}>
          {value.map((item, i) => (
            <div key={i} className={styles.previewItem}>
              {item.kind === 'video' ? (
                <video src={item.url} className={styles.previewMedia} muted playsInline />
              ) : (
                <img src={item.url} alt="" className={styles.previewMedia} />
              )}
              <div className={styles.previewMeta}>
                <span className={styles.previewKind}>{(item.kind || 'image').toUpperCase()}</span>
                {item.size && <span className={styles.previewSize}>{fmtSize(item.size)}</span>}
              </div>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={(e) => { e.stopPropagation(); handleRemove(i); }}
                title="Remover"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
