/**
 * components/image/ImageWorkspace.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Workspace central do Gerador de Imagem.
 *
 * Sprint v1.1 — abril 2026:
 *   · Refs armazenadas como [{ url, mode }] (3 modos: inspiration|character|scene)
 *   · Modelo default 'auto' (smart mode ou heurística decide no worker)
 *   · Botão "Ver prompt" → abre modal com prompt otimizado + decisão
 *   · Sugestões inline de keywords contextuais
 *
 * Polling visibility-aware quando há job ativo no grid.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Skeleton } from '../Skeleton';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageWorkspace.module.css';

import FormatSelector, { FORMATS } from './FormatSelector';
import AspectRatioSelector, { RATIOS } from './AspectRatioSelector';
import ModelSelector, { MODELS } from './ModelSelector';
import ReferenceUploader from './ReferenceUploader';
import PromptViewer from './PromptViewer';
import ImageCard from './ImageCard';
import TemplateModal from './TemplateModal';

// Sprint v1.1 — histórico horizontal com setas de navegação.
// Substitui o grid por uma linha única scrollável.
function HistoryStrip({ jobs, renderCard }) {
  const scrollerRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  function updateArrows() {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < (el.scrollWidth - el.clientWidth - 4));
  }

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [jobs.length]);

  function scrollBy(dir) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8 * (dir === 'left' ? -1 : 1);
    el.scrollBy({ left: amount, behavior: 'smooth' });
  }

  return (
    <div className={styles.stripWrap}>
      {canPrev && (
        <button
          type="button"
          className={`${styles.stripBtn} ${styles.stripBtnLeft}`}
          onClick={() => scrollBy('left')}
          aria-label="Anterior"
        >
          <Icon name="chevronLeft" size={14} />
        </button>
      )}
      <div className={styles.stripScroll} ref={scrollerRef}>
        {jobs.map((j, idx) => (
          <div
            key={j.id}
            className={`${styles.stripItem} animate-fade-in-up`}
            style={{ animationDelay: `${Math.min(idx, 7) * 40}ms` }}
          >
            {renderCard(j, idx)}
          </div>
        ))}
      </div>
      {canNext && (
        <button
          type="button"
          className={`${styles.stripBtn} ${styles.stripBtnRight}`}
          onClick={() => scrollBy('right')}
          aria-label="Próximo"
        >
          <Icon name="chevronRight" size={14} />
        </button>
      )}
    </div>
  );
}

const STATUS_FILTERS = [
  { id: 'all',    label: 'Todas' },
  { id: 'done',   label: 'Concluídas' },
  { id: 'queued', label: 'Gerando' },
  { id: 'error',  label: 'Falhas' },
];

const MAX_DESC = 4000;

// Sugestões inline de keywords. Aparecem como chips abaixo do textarea
// quando o regex correspondente NÃO bate no texto atual.
const SUGGESTION_CHIPS = [
  { keyword: 'hora dourada',         match: /\b(golden|dourad|sunset|crep[uú]sculo)\b/i,                       insert: 'hora dourada (golden hour)' },
  { keyword: 'lente 85mm f/1.8',     match: /\b(lente|mm|aperture|f\/)\b/i,                                    insert: 'lente 85mm f/1.8 com profundidade rasa' },
  { keyword: 'estilo editorial',     match: /\b(editorial|magazine|fashion)\b/i,                               insert: 'estilo editorial fotográfico' },
  { keyword: 'mood cinematográfico', match: /\b(cinemat|filme|cinema)\b/i,                                     insert: 'mood cinematográfico' },
  { keyword: 'composição central',   match: /\b(composi|enquadr|framing|rule\s+of\s+thirds|terç)\b/i,          insert: 'composição central com simetria' },
];

// ── Edit Panel (sprint v1.1) ───────────────────────────────────────────────
// Substitui os controles de criação quando uma imagem está selecionada para
// edição. User digita a mudança, escolhe modelo (default GPT Image 2), clica
// "Aplicar edição" e o sistema usa a imagem selecionada como ref `character`.
const EDIT_MODELS = [
  { id: 'fal-ai/flux-pro/kontext', label: 'Flux Kontext Pro', desc: 'Preserva pessoa exata (default)' },
  { id: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2', desc: 'Versátil, multi-imagem' },
  { id: 'gpt-image-1', label: 'GPT Image 1', desc: 'Rápido, sem verificação de org' },
  { id: 'auto', label: 'Auto', desc: 'Sistema decide' },
];

function EditPanel({ job, onClose, onApplied, onOpenDetail }) {
  const { notify } = useNotification();
  const [editPrompt, setEditPrompt] = useState('');
  const [editModel, setEditModel] = useState('fal-ai/flux-pro/kontext');
  const [submitting, setSubmitting] = useState(false);
  const taRef = useRef(null);

  useEffect(() => {
    setEditPrompt('');
    setEditModel('fal-ai/flux-pro/kontext');
    // Foca textarea ao trocar de job
    setTimeout(() => taRef.current?.focus(), 50);
  }, [job?.id]);

  async function applyEdit() {
    if (!editPrompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/image/jobs/${job.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editPrompt: editPrompt.trim(), model: editModel }),
      });
      const json = await res.json();
      if (res.status === 429) {
        notify(json.error || 'Limite atingido', 'warning', 6000);
        return;
      }
      if (!json.success) throw new Error(json.error || 'falha');
      notify(`Edição em fila (${json.data.model})`, 'success', 4000);
      setEditPrompt('');
      onApplied?.(json.data);
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`glass-card ${styles.controls}`} style={{ borderColor: 'rgba(168, 85, 247, 0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span className="label-micro" style={{ color: '#a855f7' }}>Modo edição</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
          (Esc ou Ctrl+D pra nova imagem)
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          title="Sair do modo edição (Esc / Ctrl+D)"
        >
          <Icon name="plus" size={11} />
          Nova imagem
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <img
          src={job.result_thumbnail_url || job.result_image_url}
          alt={job.title || 'Editando'}
          style={{
            width: 120, height: 120, objectFit: 'cover',
            borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer',
          }}
          onClick={() => onOpenDetail?.(job)}
          title="Clique pra ver detalhes"
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.7rem' }}>
          <div style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', fontWeight: 500 }}>
            {job.title || 'Sem título'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem' }}>
            {job.format} · {job.aspect_ratio} · {job.model}
          </div>
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 4, maxHeight: 60, overflow: 'hidden' }}>
            {job.raw_description?.slice(0, 200)}{job.raw_description?.length > 200 ? '…' : ''}
          </div>
        </div>
      </div>

      <div className={styles.controlGroup}>
        <div className={styles.controlLabel}>O que mudar? <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', marginLeft: 6 }}>Ctrl+Enter pra aplicar</span></div>
        <textarea
          ref={taRef}
          className={`textarea ${styles.smallTextarea}`}
          value={editPrompt}
          onChange={e => setEditPrompt(e.target.value)}
          placeholder="Ex: trocar fundo pra azul · adicionar texto 'Promoção 50% off' · remover o relógio do canto · mudar a cor do produto pra preto"
          disabled={submitting}
          rows={4}
          onKeyDown={e => {
            // Ctrl+Enter (sem Cmd, evita conflito com macOS) aplica edição
            if (e.ctrlKey && !e.metaKey && e.key === 'Enter' && editPrompt.trim() && !submitting) {
              e.preventDefault();
              console.log('[INFO][EditPanel] Ctrl+Enter detectado — aplicando edição');
              applyEdit();
            }
            // Cmd+Enter (macOS) também
            if (e.metaKey && e.key === 'Enter' && editPrompt.trim() && !submitting) {
              e.preventDefault();
              console.log('[INFO][EditPanel] Cmd+Enter detectado — aplicando edição');
              applyEdit();
            }
          }}
        />
      </div>

      <div className={styles.controlGroup}>
        <div className={styles.controlLabel}>Modelo de edição</div>
        <select
          className="select"
          value={editModel}
          onChange={e => setEditModel(e.target.value)}
          disabled={submitting}
        >
          {EDIT_MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
          ))}
        </select>
      </div>

      <div className={styles.actionsRow}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onOpenDetail?.(job)}
        >
          <Icon name="terminal" size={11} />
          Ver detalhes
        </button>
        <button
          type="button"
          className="sigma-btn-primary"
          onClick={applyEdit}
          disabled={!editPrompt.trim() || submitting}
          title="Aplicar edição (Ctrl/Cmd+Enter)"
        >
          <Icon name="zap" size={12} />
          {submitting ? 'Enviando...' : 'Aplicar edição'}
        </button>
      </div>
    </div>
  );
}

function PreviewPromptModal({ open, onClose, payload, onConfirm }) {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setData(null);
    setError(null);
    fetch('/api/image/preview-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(j => {
        if (!j.success) throw new Error(j.error || 'falha no preview');
        setData(j.data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, payload]);

  if (!open) return null;

  return (
    <div className={styles.detailOverlay || 'detailOverlay'} onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-1, #1a1a1a)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        maxWidth: 720, width: '100%', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label-micro">Preview do prompt otimizado</span>
          <button type="button" className="btn btn-icon btn-secondary" onClick={onClose}>
            <Icon name="x" size={12} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Otimizando prompt...
            </div>
          )}
          {error && (
            <div style={{ color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
              Erro: {error}
            </div>
          )}
          {data && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Modelo escolhido</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{data.modelChosen}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Custo estimado</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>~ US$ {Number(data.costEstimate || 0).toFixed(4)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Cache</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: data.fromCache ? '#22c55e' : 'var(--text-secondary)' }}>
                    {data.fromCache ? 'HIT (0 tokens)' : `${data.tokens?.input || 0} in · ${data.tokens?.output || 0} out`}
                  </div>
                </div>
              </div>

              {data.smartDecision?.reasoning && (
                <div style={{ marginBottom: 14, padding: 10, background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: 4, fontFamily: 'var(--font-sans)', fontSize: '0.72rem', lineHeight: 1.45 }}>
                  <strong style={{ color: '#a855f7' }}>{data.smartDecision.used_smart_mode ? 'Smart Mode' : 'Heurística'}:</strong> {data.smartDecision.reasoning}
                </div>
              )}

              <div style={{ marginBottom: 8, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Prompt final que vai pro provider:
              </div>
              <pre style={{
                background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 4,
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 280, overflowY: 'auto',
                color: 'var(--text-primary)', lineHeight: 1.5,
              }}>{data.optimizedPrompt}</pre>

              <div style={{ marginTop: 12, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {data.brandbookInjected && <span>✓ Brandbook injetado · </span>}
                {data.fixedRefsCount > 0 && <span>✓ {data.fixedRefsCount} refs fixas · </span>}
                <span>refs: {data.refsByMode.inspiration} insp + {data.refsByMode.character} char + {data.refsByMode.scene} scene</span>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="sigma-btn-primary btn-sm"
            disabled={!data}
            onClick={() => { onConfirm?.(); onClose(); }}
          >
            <Icon name="zap" size={11} />
            Gerar com este prompt
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ImageWorkspace({
  clientId,
  selectedFolderId,
  brandbookActive,
  ignoreBrandbook,
  settings,
  onGenerate,
  onOpenJob,
  onRegenerateJob,
  onSaveTemplate,
  onJobCountChange,
  refreshKey = 0,
}) {
  const { notify } = useNotification();

  // ─── Estado dos controles ──────────────────────────────────────────────
  const [format, setFormat] = useState('square_post');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [model, setModel] = useState('auto');
  const [description, setDescription] = useState('');
  const [observations, setObservations] = useState('');
  const [referenceImages, setReferenceImages] = useState([]); // [{ url, mode }]
  const [submitting, setSubmitting] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [lastOptimized, setLastOptimized] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  // Sprint v1.1 — modo edição inline. Quando setado, substitui o painel
  // de criação por um EditPanel pré-carregado com a imagem como ref.
  const [editingJob, setEditingJob] = useState(null);

  // Atalhos globais: Esc OU Ctrl+D pra sair do modo edição.
  // (Cmd+I e Cmd+D conflitam com keybindings nativos do macOS Chrome)
  useEffect(() => {
    function onKey(e) {
      if (!editingJob) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      // Esc só fora de inputs (Esc dentro de input cancela autocomplete)
      if (e.key === 'Escape' && tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
        setEditingJob(null);
        return;
      }
      // Ctrl+D (apenas Ctrl, não Cmd — Cmd+D no Mac = bookmark)
      if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setEditingJob(null);
        return;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editingJob]);

  useEffect(() => {
    const def = FORMATS.find(f => f.id === format);
    if (def && def.aspect !== '—' && aspectRatio !== def.aspect) {
      setAspectRatio(def.aspect);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  // ─── Grid ──────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('all');
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [hasActive, setHasActive] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (clientId) params.set('clientId', clientId);
      if (selectedFolderId && selectedFolderId !== 'all') params.set('folderId', selectedFolderId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', '40');

      const res = await fetch(`/api/image/jobs?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setJobs(json.data || []);
      const active = (json.data || []).some(j => j.status === 'queued' || j.status === 'running');
      setHasActive(active);
      onJobCountChange?.(json.pagination?.total || 0);
    } catch (err) {
      console.error('[ERRO][Frontend:ImageWorkspace] fetchJobs', err.message);
    } finally {
      setLoadingJobs(false);
    }
  }, [clientId, selectedFolderId, statusFilter, onJobCountChange]);

  useEffect(() => { setLoadingJobs(true); fetchJobs(); }, [fetchJobs, refreshKey]);

  useEffect(() => {
    if (!hasActive) return;
    let id;
    function start() { id = setInterval(fetchJobs, 3000); }
    function stop() { if (id) clearInterval(id); }
    function onVis() {
      stop();
      if (document.visibilityState === 'visible') start();
    }
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [hasActive, fetchJobs]);

  // ─── Submit ────────────────────────────────────────────────────────────
  const isBlocked = !description.trim();

  function buildPayload() {
    return {
      rawDescription: description.trim(),
      clientId: clientId || null,
      folderId: (selectedFolderId && selectedFolderId !== 'all' && selectedFolderId !== 'null') ? selectedFolderId : null,
      format,
      aspectRatio,
      model,
      observations: observations.trim() || null,
      referenceImages,  // [{ url, mode }]
      useBrandbook: !ignoreBrandbook,
    };
  }

  async function handleSubmit() {
    if (isBlocked) return;
    if (description.length > MAX_DESC) {
      notify('Descrição excede 4000 caracteres', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const body = buildPayload();
      console.log('[INFO][Frontend:ImageWorkspace] submit', {
        model, format, refs: referenceImages.length,
        modes: referenceImages.reduce((acc, r) => { acc[r.mode] = (acc[r.mode] || 0) + 1; return acc; }, {}),
      });

      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.status === 429) {
        notify(json.error || 'Limite atingido', 'warning', 6000);
        setSubmitting(false);
        return;
      }
      if (!json.success) throw new Error(json.error || 'falha ao gerar');

      onGenerate?.({
        jobId: json.data.jobId,
        model,
        provider: MODELS.find(m => m.id === model)?.provider || 'auto',
      });
      fetchJobs();
    } catch (err) {
      console.error('[ERRO][Frontend:ImageWorkspace] submit', err.message);
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function applyTemplate(tpl) {
    if (tpl.format) setFormat(tpl.format);
    if (tpl.aspect_ratio) setAspectRatio(tpl.aspect_ratio);
    if (tpl.model) setModel(tpl.model);
    if (tpl.raw_description) setDescription(tpl.raw_description);
    if (tpl.observations) setObservations(tpl.observations);
    if (tpl.optimized_prompt) {
      setLastOptimized({ prompt: tpl.optimized_prompt, model: tpl.model, fromCache: false, hash: null });
    }
  }

  async function toggleStar(job) {
    try {
      await fetch(`/api/image/jobs/${job.id}/star`, { method: 'POST' });
      fetchJobs();
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  async function deleteJob(job) {
    if (!window.confirm('Apagar esta imagem? Os arquivos serão removidos.')) return;
    try {
      const res = await fetch(`/api/image/jobs/${job.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      notify('Imagem apagada', 'success');
      fetchJobs();
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  const charCount = description.length;
  const overWarn = charCount > MAX_DESC * 0.9;
  const over = charCount > MAX_DESC;

  // Sugestões inline — só mostra chips cuja keyword AINDA não está no texto
  const activeSuggestions = SUGGESTION_CHIPS.filter(s => !s.match.test(description));

  function applySuggestion(s) {
    const sep = description.trim().endsWith('.') || description.trim().endsWith(',') ? ' ' : ', ';
    const next = description.trim() ? `${description.trim()}${sep}${s.insert}` : s.insert;
    setDescription(next);
  }

  if (typeof window !== 'undefined') {
    window.__sigmaApplyTemplate = applyTemplate;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ─── Modo edição (sprint v1.1) — substitui controles quando ativo ─── */}
      {editingJob ? (
        <EditPanel
          job={editingJob}
          onClose={() => setEditingJob(null)}
          onApplied={() => { fetchJobs(); /* mantém editingJob pro user ver progress */ }}
          onOpenDetail={onOpenJob}
        />
      ) : (
      <>
      {/* ─── Controles de criação ─── */}
      <div className={`glass-card ${styles.controls}`}>
        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>Formato</div>
          <FormatSelector value={format} onChange={setFormat} />
        </div>

        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>Modelo de IA</div>
          <ModelSelector
            value={model}
            onChange={setModel}
            settings={settings}
            enabledModels={settings?.enabled_models}
          />
        </div>

        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>Aspect ratio</div>
          <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />
        </div>

        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>
            Descrição <span className={styles.required}>*</span>
          </div>
          <div className={styles.bigTextareaWrap}>
            <textarea
              className={`textarea ${styles.bigTextarea}`}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descreva a imagem que você quer gerar... (Ctrl+Enter para gerar)"
              maxLength={MAX_DESC + 200}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isBlocked && !submitting && !over) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div className={`${styles.charCount} ${over ? styles.over : overWarn ? styles.warning : ''}`}>
              {charCount}/{MAX_DESC}
            </div>
          </div>
          {/* Chips de sugestão inline */}
          {description.trim() && activeSuggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {activeSuggestions.map(s => (
                <button
                  key={s.keyword}
                  type="button"
                  onClick={() => applySuggestion(s)}
                  style={{
                    fontSize: '0.62rem', fontFamily: 'var(--font-mono)',
                    padding: '3px 8px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-secondary)',
                    borderRadius: 12,
                    cursor: 'pointer',
                  }}
                >+ {s.keyword}</button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>Observações <span style={{ color: 'var(--text-muted)' }}>(opcional)</span></div>
          <textarea
            className={`textarea ${styles.smallTextarea}`}
            value={observations}
            onChange={e => setObservations(e.target.value)}
            placeholder="Ex: evite pessoas no fundo, sem texto na imagem..."
          />
        </div>

        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>
            Referências <span style={{ color: 'var(--text-muted)' }}>(opcional, até 5 imagens — escolha o modo de cada uma)</span>
          </div>
          <ReferenceUploader
            value={referenceImages}
            onChange={setReferenceImages}
            currentModel={model}
          />
        </div>

        <div className={styles.controlGroup}>
          <PromptViewer
            prompt={lastOptimized?.prompt}
            model={lastOptimized?.model}
            hash={lastOptimized?.hash}
            fromCache={lastOptimized?.fromCache}
          />
        </div>

        <div className={styles.actionsRow}>
          <div className={styles.actionsLeft}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowTemplateModal(true)}
              disabled={!description.trim() || !clientId}
              title={!clientId ? 'Selecione um cliente primeiro' : 'Salvar configuração atual como template'}
            >
              <Icon name="layers" size={11} />
              Salvar como template
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowPreview(true)}
              disabled={isBlocked || submitting}
              title="Otimiza o prompt sem gerar — útil pra revisar"
            >
              <Icon name="terminal" size={11} />
              Ver prompt
            </button>
          </div>

          <button
            type="button"
            className="sigma-btn-primary"
            onClick={handleSubmit}
            disabled={isBlocked || submitting || over}
            title={isBlocked ? 'Preencha a descrição' : 'Gerar imagem (Ctrl+Enter)'}
          >
            <Icon name="zap" size={12} />
            {submitting ? 'Enfileirando...' : 'Gerar imagem'}
          </button>
        </div>
      </div>
      </>
      )}

      {/* ─── Grid ─── */}
      <div className="glass-card" style={{ padding: 16 }}>
        <div className={styles.resultsHeader}>
          <span className="label-micro">Resultados</span>
          <div className={styles.resultsFilters}>
            <select
              className={styles.miniSelect}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              {STATUS_FILTERS.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loadingJobs ? (
          <div className={styles.stripScroll}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.stripItem}>
                <Skeleton style={{ aspectRatio: '1 / 1', borderRadius: 8 }} />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className={styles.gridEmpty}>
            Sem resultados — gere sua primeira imagem
          </div>
        ) : (
          // Sprint v1.1 — histórico em linha horizontal scrollável com setas
          <HistoryStrip
            jobs={jobs}
            renderCard={(j) => (
              <ImageCard
                job={j}
                onOpen={(jj) => {
                  if (jj.status === 'done' && jj.result_image_url) setEditingJob(jj);
                  else onOpenJob?.(jj);
                }}
                onViewDetail={onOpenJob}
                onRegenerate={onRegenerateJob}
                onSaveTemplate={onSaveTemplate}
                onDelete={deleteJob}
                onToggleStar={toggleStar}
                isSelected={editingJob?.id === j.id}
              />
            )}
          />
        )}
      </div>

      {showTemplateModal && (
        <TemplateModal
          sourceJob={{
            format,
            aspect_ratio: aspectRatio,
            model,
            raw_description: description,
            observations,
            optimized_prompt: lastOptimized?.prompt || null,
          }}
          clientId={clientId}
          onClose={() => setShowTemplateModal(false)}
          onSave={() => { setShowTemplateModal(false); }}
        />
      )}

      <PreviewPromptModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        payload={buildPayload()}
        onConfirm={handleSubmit}
      />
    </div>
  );
}
