/**
 * components/image/BrandbookPdfUploadModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de upload de PDF/HTML/DOCX. Fluxo:
 *   1. Upload do arquivo via /api/upload (já existe) → URL interna
 *   2. POST /api/image/brandbook/:clientId/extract com fileUrl + mimeType
 *   3. Volta com structured_data → onExtracted(...) abre o editor
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/brandbook.module.css';

const ALLOWED = [
  'application/pdf',
  'text/html',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
];
const MAX_BYTES = 25 * 1024 * 1024;

function detectSourceFromMime(mime) {
  if (!mime) return 'pdf';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('html')) return 'html';
  return 'manual_description';
}

export default function BrandbookPdfUploadModal({ clientId, onClose, onExtracted }) {
  const { notify } = useNotification();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | uploading | extracting

  useEffect(() => {
    function onEsc(e) { if (e.key === 'Escape' && phase === 'idle') onClose?.(); }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, phase]);

  function pick(files) {
    const f = files?.[0];
    if (!f) return;
    if (!ALLOWED.includes(f.type) && !f.name.match(/\.(pdf|html|docx|txt)$/i)) {
      notify('Formato não suportado (PDF, HTML, DOCX, TXT)', 'error');
      return;
    }
    if (f.size > MAX_BYTES) {
      notify(`Arquivo excede ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB`, 'error');
      return;
    }
    setFile(f);
  }

  async function process() {
    if (!file) return;
    setPhase('uploading');
    try {
      // 1. Upload
      const fd = new FormData();
      fd.append('file', file);
      const up = await fetch('/api/upload', { method: 'POST', body: fd });
      const upJson = await up.json();
      if (!upJson.success || !upJson.url) {
        throw new Error(upJson.error || 'falha no upload');
      }

      // Normaliza pra path relativo /uploads/... — /api/upload às vezes
      // devolve URL absoluta com hostname (ngrok/prod/dev) e o backend de
      // /extract precisa de path interno pra ler o arquivo do disco.
      let fileUrl = upJson.url;
      if (!fileUrl.startsWith('/')) {
        try {
          const parsed = new URL(fileUrl);
          fileUrl = parsed.pathname + (parsed.search || '');
        } catch {}
      }

      // 2. Extract
      setPhase('extracting');
      const ext = await fetch(`/api/image/brandbook/${clientId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          source: detectSourceFromMime(file.type),
        }),
      });
      const extJson = await ext.json();
      if (!extJson.success) throw new Error(extJson.error || 'falha na extração');

      notify('Brandbook extraído — revise e salve', 'success');
      onExtracted?.(
        extJson.data.structured_data,
        {
          source: detectSourceFromMime(file.type) === 'pdf' ? 'pdf_upload' : 'html_upload',
          file_url: fileUrl,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          extracted_text: extJson.data.extracted_text,
        }
      );
    } catch (err) {
      console.error('[ERRO][Frontend:BrandbookPdfUpload]', err.message);
      notify(`Erro: ${err.message}`, 'error');
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';

  return (
    <div
      className={styles.modalOverlay}
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={`glass-card animate-scale-in ${styles.modalCard}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Upload de brandbook</div>
            <div className={styles.modalSub}>
              Envie o brandbook em PDF, HTML, DOCX ou TXT. A IA extrai a estrutura automaticamente.
              Limite: 25 MB.
            </div>
          </div>
          <button type="button" className="btn btn-icon btn-secondary" onClick={onClose} disabled={busy} aria-label="Fechar">
            <Icon name="x" size={12} />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.html,.docx,.txt,application/pdf,text/html,text/plain"
          style={{ display: 'none' }}
          onChange={e => pick(e.target.files)}
        />

        <div
          className={`${styles.dropZone} ${over ? styles.over : ''}`}
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); if (!busy) setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); if (!busy) pick(e.dataTransfer.files); }}
        >
          <Icon name="upload" size={22} />
          <div style={{ marginTop: 8 }}>
            {file ? 'Arquivo selecionado' : 'Arraste o arquivo aqui ou clique para escolher'}
          </div>
          {file && (
            <div className={styles.filename}>
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          )}
        </div>

        {phase === 'uploading' && (
          <div className={styles.loadingInline}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            Enviando arquivo...
          </div>
        )}
        {phase === 'extracting' && (
          <div className={styles.loadingInline}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            Extraindo dados (~10-20s)...
          </div>
        )}

        <div className={styles.modalFooter}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="sigma-btn-primary"
            onClick={process}
            disabled={!file || busy}
          >
            <Icon name="sparkles" size={12} />
            {busy ? 'Processando...' : 'Extrair com IA'}
          </button>
        </div>
      </div>
    </div>
  );
}
