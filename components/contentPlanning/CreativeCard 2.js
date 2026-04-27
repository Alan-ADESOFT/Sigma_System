/**
 * components/contentPlanning/CreativeCard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Card editavel de UM criativo dentro de um plano.
 *
 * Estrutura visual:
 *   - Header: drag handle, indice, dropdown custom de tipo, data/hora,
 *             decisao do cliente, menu
 *   - 2 colunas:
 *       MIDIA (esquerda): upload single/carrossel via /api/content-planning/upload-media
 *       COPY  (direita): legenda (campo grande, com contador) + importar do
 *                        Gerador de Copy + notas internas privadas
 *
 * Auto-save: debounce 1s ao mudar qualquer campo, via PUT /creatives/[id]
 * Validacao de aspecto/MIME espelhada do backend (defesa em profundidade).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import styles from '../../assets/style/contentPlanning.module.css';
import { useNotification } from '../../context/NotificationContext';

const CopyImporterDrawer = dynamic(
  () => import('../CopyImporterDrawer'),
  { ssr: false, loading: () => null }
);

const TYPES = [
  { id: 'post',     label: 'Post' },
  { id: 'reel',     label: 'Reel' },
  { id: 'carousel', label: 'Carrossel' },
  { id: 'story',    label: 'Story' },
];

/* Regras de aspect / kind por tipo de criativo. Espelham exatamente o que
   o backend valida em infra/contentPlanMedia.js — defesa em profundidade. */
const ASPECT_RULES = {
  reel:     { minAspect: 0.50, maxAspect: 0.60, allowedKinds: ['video'],          targetLabel: '9:16 vertical', hint: 'Vídeo vertical 9:16 (1080×1920).' },
  story:    { minAspect: 0.50, maxAspect: 0.60, allowedKinds: ['image', 'video'], targetLabel: '9:16 vertical', hint: 'Imagem ou vídeo 9:16 (1080×1920).' },
  post:     { minAspect: 0.78, maxAspect: 1.95, allowedKinds: ['image', 'video'], targetLabel: '1:1, 4:5 ou 1.91:1', hint: '1:1 (1080×1080), 4:5 (1080×1350) ou 1.91:1 (1080×566).' },
  carousel: { minAspect: 0.78, maxAspect: 1.95, allowedKinds: ['image', 'video'], targetLabel: '1:1 ou 4:5 (mesmo p/ todos)', hint: 'Todos os itens devem ter o mesmo aspecto. Recomendado 1:1 ou 4:5.' },
};

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const CAPTION_LIMIT = 2200;

function kindOf(mime) {
  if (ALLOWED_IMAGE_MIMES.has(mime)) return 'image';
  if (ALLOWED_VIDEO_MIMES.has(mime)) return 'video';
  return null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image-decode-failed')); };
    img.src = url;
  });
}

function readVideoDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    let settled = false;
    const done = (val, err) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      err ? reject(err) : resolve(val);
    };
    v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    v.onerror = () => done(null, new Error('video-decode-failed'));
    setTimeout(() => done(null, new Error('video-probe-timeout')), 8000);
    v.src = url;
  });
}

export default function CreativeCard({
  creative,
  index,
  planId,
  clientId,
  onUpdate,
  onRequestDelete,
  onRequestUnlock,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  dragging,
  dragOver,
}) {
  const isApproved = creative.client_decision === 'approved';
  // adjust legacy é tratado igual a rejected na UI
  const needsRework = creative.client_decision === 'rejected' || creative.client_decision === 'adjust';
  const { notify } = useNotification();

  const [type,            setType]            = useState(creative.type || 'post');
  const [scheduledFor,    setScheduledFor]    = useState(creative.scheduled_for ? String(creative.scheduled_for).slice(0, 10) : '');
  const [scheduledTime,   setScheduledTime]   = useState(creative.scheduled_time || '');
  const [caption,         setCaption]         = useState(creative.caption || '');
  const [internalNotes,   setInternalNotes]   = useState(creative.internal_notes || '');
  const [mediaUrls,       setMediaUrls]       = useState(creative.media_urls || []);
  const [carouselMode,    setCarouselMode]    = useState(creative.type === 'carousel' || (creative.media_urls || []).length > 1);

  const [importerOpen,  setImporterOpen]  = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [typeMenuOpen,  setTypeMenuOpen]  = useState(false);
  const menuRef     = useRef(null);
  const typeMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const debounceRef = useRef(null);
  const skipFirstSave = useRef(true);

  // Sincroniza state quando o prop muda (refresh externo)
  useEffect(() => {
    setType(creative.type || 'post');
    setScheduledFor(creative.scheduled_for ? String(creative.scheduled_for).slice(0, 10) : '');
    setScheduledTime(creative.scheduled_time || '');
    setCaption(creative.caption || '');
    setInternalNotes(creative.internal_notes || '');
    setMediaUrls(creative.media_urls || []);
    setCarouselMode(creative.type === 'carousel' || (creative.media_urls || []).length > 1);
    skipFirstSave.current = true;
  }, [creative.id]);

  // Auto-save debounced
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(persist, 1000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, scheduledFor, scheduledTime, caption, internalNotes, mediaUrls]);

  async function persist() {
    try {
      const r = await fetch(`/api/content-planning/creatives/${creative.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          scheduled_for: scheduledFor || null,
          scheduled_time: scheduledTime || null,
          caption,
          internal_notes: internalNotes,
          media_urls: mediaUrls,
        }),
      });
      const d = await r.json();
      if (d.success && d.creative) onUpdate?.(d.creative);
      else if (!d.success) notify(d.error || 'Erro ao salvar criativo', 'error');
    } catch {
      notify('Falha de rede ao salvar', 'error');
    }
  }

  // Click fora → fecha menus
  useEffect(() => {
    if (!menuOpen && !typeMenuOpen) return;
    function handler(e) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (typeMenuOpen && typeMenuRef.current && !typeMenuRef.current.contains(e.target)) setTypeMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, typeMenuOpen]);

  function handleTypeChange(newType) {
    setType(newType);
    setTypeMenuOpen(false);
    if (newType === 'carousel') setCarouselMode(true);
    if (newType !== 'carousel' && mediaUrls.length > 1) setMediaUrls(mediaUrls.slice(0, 1));
  }

  async function handleUpload(files) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const rule = ASPECT_RULES[type] || null;
    const uploaded = [];
    try {
      for (const file of Array.from(files)) {
        const fileKind = kindOf(file.type);
        if (!fileKind) { notify(`${file.name}: tipo não aceito`, 'error'); continue; }

        const max = fileKind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (file.size > max) {
          const limit = fileKind === 'video' ? '100MB' : '10MB';
          notify(`${file.name}: excede ${limit}`, 'error');
          continue;
        }

        if (rule && !rule.allowedKinds.includes(fileKind)) {
          notify(`${file.name}: ${rule.targetLabel} não aceita ${fileKind}. ${rule.hint}`, 'error');
          continue;
        }

        let dims = null;
        try {
          dims = fileKind === 'image' ? await readImageDimensions(file) : await readVideoDimensions(file);
        } catch {
          notify(`${file.name}: não foi possível ler o formato`, 'error');
          continue;
        }

        if (rule && dims?.width && dims?.height) {
          const ratio = dims.width / dims.height;
          if (ratio < rule.minAspect || ratio > rule.maxAspect) {
            notify(
              `${file.name}: formato ${dims.width}×${dims.height} fora do esperado (${rule.targetLabel}).`,
              'error', { duration: 7000 }
            );
            continue;
          }
        }

        const base64 = await fileToBase64(file);
        const r = await fetch('/api/content-planning/upload-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId,
            fileName: file.name,
            mimeType: file.type,
            base64,
            creativeType: type,
            dimensions: dims ? { width: dims.width, height: dims.height } : null,
          }),
        });
        const d = await r.json();
        if (d.success) uploaded.push(d.url);
        else notify(`${file.name}: ${d.error || 'falha no upload'}`, 'error', { duration: 7000 });
      }
    } finally {
      setUploading(false);
    }
    if (uploaded.length > 0) {
      const next = carouselMode ? [...mediaUrls, ...uploaded] : [uploaded[0]];
      setMediaUrls(next);
      notify(`${uploaded.length} arquivo(s) enviado(s)`, 'success');
    }
  }

  function removeMedia(idx) {
    setMediaUrls(mediaUrls.filter((_, i) => i !== idx));
  }

  function handleImporterPick(text) {
    setCaption((prev) => prev ? `${prev}\n\n${text}` : text);
    setImporterOpen(false);
    notify('Copy importada para a legenda', 'success');
  }

  const currentType = TYPES.find(t => t.id === type) || TYPES[0];
  const currentRule = ASPECT_RULES[type];
  const captionCount = caption.length;
  const captionOver = captionCount > CAPTION_LIMIT;

  const decisionBadge = creative.client_decision ? (
    <span className={`${styles.decisionBadge} ${
      creative.client_decision === 'approved' ? styles.decisionApproved
        : creative.client_decision === 'rejected' ? styles.decisionRejected
        : styles.decisionAdjust
    }`}>
      {creative.client_decision === 'approved' ? 'Aprovado'
        : creative.client_decision === 'rejected' ? 'Reprovado'
        : 'Ajuste pedido'}
    </span>
  ) : null;

  return (
    <div style={{ position: 'relative' }}>
    {isApproved && (
      <div className={styles.creativeLockOverlay}>
        <span className={styles.creativeLockBadge}>
          <LockCheckIcon /> Aprovado pelo cliente
          <button
            type="button"
            className={styles.creativeLockEditBtn}
            onClick={() => onRequestUnlock?.(creative)}
          >
            Editar
          </button>
        </span>
      </div>
    )}
    <div
      className={`${styles.creativeRow} ${dragging ? styles.creativeRowDragging : ''} ${dragOver ? styles.creativeRowDragOver : ''} ${isApproved ? styles.creativeRowLocked : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className={styles.creativeRowHeader}>
        <span
          className={styles.creativeRowDrag}
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Arrastar para reordenar"
          aria-label="Arrastar"
        >
          <DragHandleIcon />
        </span>
        <span className={styles.creativeIndex}>#{String(index).padStart(2, '0')}</span>

        {/* Dropdown custom de tipo */}
        <div ref={typeMenuRef} className={styles.typeDropdownWrap}>
          <button
            type="button"
            className={styles.typeDropdownBtn}
            onClick={() => setTypeMenuOpen(v => !v)}
            aria-haspopup="listbox"
            aria-expanded={typeMenuOpen}
          >
            <TypeIcon kind={currentType.id} />
            <span>{currentType.label}</span>
            <ChevronDownIcon />
          </button>
          {typeMenuOpen && (
            <div className={styles.typeDropdownMenu} role="listbox">
              {TYPES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={t.id === type}
                  className={`${styles.typeDropdownItem} ${t.id === type ? styles.typeDropdownItemActive : ''}`}
                  onClick={() => handleTypeChange(t.id)}
                >
                  <TypeIcon kind={t.id} />
                  <span>{t.label}</span>
                  {t.id === type && <CheckIcon />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.creativeDateGroup}>
          <input
            type="date"
            className={styles.creativeDateInput}
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            aria-label="Data"
          />
          <input
            type="time"
            className={styles.creativeDateInput}
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            style={{ width: 86 }}
            aria-label="Horário"
          />
        </div>

        <div style={{ flex: 1 }} />
        {decisionBadge}

        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setMenuOpen(v => !v)}
            title="Opções"
            aria-label="Opções do criativo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div className={styles.creativeMenuDropdown}>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onRequestDelete?.(creative); }}
                className={styles.creativeMenuItemDanger}
              >
                <TrashIconSm /> Excluir criativo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MIDIA */}
      <div className={styles.creativeMediaPanel}>
        <div className={styles.creativePanelLabel}>Mídia</div>
        {currentRule && (
          <div className={styles.aspectHint}>
            <strong style={{ color: 'var(--brand-300)' }}>{currentRule.targetLabel}</strong>
            <span> · {currentRule.hint}</span>
          </div>
        )}

        {mediaUrls.length === 0 ? (
          <button
            type="button"
            className={styles.mediaThumb}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <div className={styles.mediaThumbHint}>
              {uploading ? 'Enviando...' : '+ Upload de mídia'}
            </div>
          </button>
        ) : (
          <>
            {mediaUrls.length === 1 && !carouselMode ? (
              <div className={styles.mediaThumb} onClick={() => fileInputRef.current?.click()}>
                <MediaPreview url={mediaUrls[0]} />
                <button
                  type="button"
                  className={styles.mediaRemoveBtn}
                  onClick={(e) => { e.stopPropagation(); removeMedia(0); }}
                  title="Remover"
                >×</button>
              </div>
            ) : (
              <div className={styles.mediaCarouselGrid}>
                {mediaUrls.map((url, i) => (
                  <div key={i} className={styles.mediaThumb} style={{ aspectRatio: '1' }}>
                    <MediaPreview url={url} />
                    <button
                      type="button"
                      className={styles.mediaRemoveBtn}
                      onClick={() => removeMedia(i)}
                      title="Remover"
                    >×</button>
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.mediaThumb}
                  style={{ aspectRatio: '1' }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <div className={styles.mediaThumbHint}>+</div>
                </button>
              </div>
            )}
          </>
        )}

        {/* Toggle carrossel — moderno */}
        <label className={styles.carouselToggle}>
          <span
            className={`${styles.carouselSwitch} ${carouselMode ? styles.carouselSwitchOn : ''}`}
            role="switch"
            aria-checked={carouselMode}
          >
            <span className={styles.carouselKnob} />
          </span>
          <input
            type="checkbox"
            checked={carouselMode}
            onChange={(e) => {
              setCarouselMode(e.target.checked);
              if (e.target.checked && type !== 'carousel') setType('carousel');
            }}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className={styles.carouselToggleLabel}>Múltiplas mídias</span>
            <span className={styles.carouselToggleHint}>
              Ative para usar várias imagens no formato carrossel
            </span>
          </div>
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept={(ASPECT_RULES[type]?.allowedKinds || ['image', 'video']).flatMap(k =>
            k === 'video'
              ? ['video/mp4', 'video/quicktime', 'video/webm']
              : ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
          ).join(',')}
          multiple={carouselMode}
          style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {/* COPY */}
      <div className={styles.creativeCopyPanel}>
        <div className={styles.creativePanelLabel}>Copy</div>

        <div className={styles.captionField}>
          <div className={styles.captionHeader}>
            <span className={styles.formLabel}>Legenda</span>
            <span className={`${styles.captionCounter} ${captionOver ? styles.captionCounterOver : ''}`}>
              {captionCount.toLocaleString('pt-BR')} / {CAPTION_LIMIT.toLocaleString('pt-BR')}
            </span>
          </div>
          <textarea
            className={styles.captionTextarea}
            rows={9}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={`Texto que vai no Instagram. Inclua aqui o gancho, a chamada para ação e as hashtags relevantes.\n\nEx: A noite certa para...\n\n👉 Reserve sua mesa no link\n\n#bentivi #churrasco`}
          />
          <button
            type="button"
            className={styles.copyImporterBtn}
            onClick={() => setImporterOpen(true)}
            title="Importar legenda do Gerador de Copy"
          >
            <CopyGenIcon />
            <span>Importar do Gerador de Copy</span>
          </button>
        </div>

        <div className={styles.formField} style={{ marginTop: 12 }}>
          <label className={styles.formLabel}>Notas internas (privadas)</label>
          <textarea
            className="sigma-input"
            rows={2}
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="Lembretes da equipe (não aparecem para o cliente)..."
          />
        </div>

        {needsRework && (
          <div className={`${styles.clientFeedbackBanner} ${styles.clientFeedbackBannerRejected}`}>
            <div className={styles.clientFeedbackHeader}>
              <span className={styles.clientFeedbackBadge}>
                Cliente reprovou
              </span>
              <button
                type="button"
                className={styles.clientFeedbackBtn}
                onClick={() => onRequestUnlock?.(creative)}
                title="Reabrir para nova revisão"
              >
                Liberar para nova revisão
              </button>
            </div>
            {creative.client_reason && (
              <div className={styles.clientFeedbackText}>
                <strong>Motivo:</strong> {creative.client_reason}
              </div>
            )}
            {creative.client_notes && (
              <div className={styles.clientFeedbackText}>
                <strong>Observações:</strong> {creative.client_notes}
              </div>
            )}
          </div>
        )}
      </div>

      <CopyImporterDrawer
        open={importerOpen}
        clientId={clientId}
        onClose={() => setImporterOpen(false)}
        onPick={handleImporterPick}
      />
    </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Subcomponentes
───────────────────────────────────────────────────────────── */

function MediaPreview({ url }) {
  if (!url) return null;
  const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(url);
  if (isVideo) return <video src={url} muted loop playsInline />;
  return <img src={url} alt="" />;
}

function TypeIcon({ kind }) {
  if (kind === 'reel') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </svg>
    );
  }
  if (kind === 'carousel') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="13" height="13" rx="2" />
        <path d="M21 11v8a2 2 0 0 1-2 2h-8" />
      </svg>
    );
  }
  if (kind === 'story') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <circle cx="12" cy="18" r="0.5" fill="currentColor" />
      </svg>
    );
  }
  // post
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-400)' }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

/* Mesmo SVG do item "Gerador de Copy" no sidebar (icon `edit`) */
function CopyGenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIconSm() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function LockCheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
