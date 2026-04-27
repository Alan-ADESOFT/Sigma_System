/**
 * components/image/ImageWorkspace.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Workspace central do Gerador de Imagem.
 *
 * Seção 1 — Controles:
 *   · FormatSelector
 *   · ModelSelector
 *   · AspectRatioSelector
 *   · Textarea de descrição (max 4000)
 *   · Textarea de observações
 *   · ReferenceUploader (até 5 imagens)
 *   · PromptViewer (último optimized_prompt)
 *   · Botão "Salvar como template" + "Gerar imagem"
 *
 * Seção 2 — Grid:
 *   · Filtros (status, pasta)
 *   · Cards das gerações
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

const STATUS_FILTERS = [
  { id: 'all',    label: 'Todas' },
  { id: 'done',   label: 'Concluídas' },
  { id: 'queued', label: 'Gerando' },
  { id: 'error',  label: 'Falhas' },
];

const MAX_DESC = 4000;

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
  const [model, setModel] = useState(settings?.default_model || 'imagen-4');
  const [description, setDescription] = useState('');
  const [observations, setObservations] = useState('');
  const [referenceUrls, setReferenceUrls] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [lastOptimized, setLastOptimized] = useState(null);

  // Quando o formato muda, reseta aspect ratio para o default do formato
  useEffect(() => {
    const def = FORMATS.find(f => f.id === format);
    if (def && def.aspect !== '—' && aspectRatio !== def.aspect) {
      setAspectRatio(def.aspect);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  // Sincroniza modelo default das settings
  useEffect(() => {
    if (settings?.default_model && model === 'imagen-4') {
      setModel(settings.default_model);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.default_model]);

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

  // Polling visibility-aware (só roda se há job ativo + aba visível)
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

  async function handleSubmit() {
    if (isBlocked) return;
    if (description.length > MAX_DESC) {
      notify('Descrição excede 4000 caracteres', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        rawDescription: description.trim(),
        clientId: clientId || null,
        folderId: (selectedFolderId && selectedFolderId !== 'all' && selectedFolderId !== 'null') ? selectedFolderId : null,
        format,
        aspectRatio,
        model,
        observations: observations.trim() || null,
        referenceImageUrls: referenceUrls,
        useBrandbook: !ignoreBrandbook,
      };
      console.log('[INFO][Frontend:ImageWorkspace] submit', { model, format, hasBrandbook: !ignoreBrandbook && !!brandbookActive });

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
        provider: MODELS.find(m => m.id === model)?.provider || 'vertex',
      });
      // Limpa descrição apenas se preferir; mantemos observations/refs pra reuso
      // setDescription('');
      fetchJobs();
    } catch (err) {
      console.error('[ERRO][Frontend:ImageWorkspace] submit', err.message);
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Aplica template no formulário (chamado por TemplatesList).
   */
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

  /**
   * Toggle star
   */
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

  // Expor applyTemplate para o pai
  if (typeof window !== 'undefined') {
    window.__sigmaApplyTemplate = applyTemplate;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ─── Controles ─── */}
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
                // UX: Ctrl/Cmd + Enter dispara geração sem precisar do mouse
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
            Referências <span style={{ color: 'var(--text-muted)' }}>(opcional, até 5 imagens)</span>
          </div>
          <ReferenceUploader value={referenceUrls} onChange={setReferenceUrls} />
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

      {/* ─── Grid de resultados ─── */}
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
          <div className={styles.grid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} style={{ aspectRatio: '1 / 1', borderRadius: 8 }} />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className={styles.gridEmpty}>
            Sem resultados — gere sua primeira imagem
          </div>
        ) : (
          <div className={styles.grid}>
            {jobs.map((j, idx) => (
              <div
                key={j.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${Math.min(idx, 7) * 40}ms` }}
              >
                <ImageCard
                  job={j}
                  onOpen={onOpenJob}
                  onRegenerate={onRegenerateJob}
                  onSaveTemplate={onSaveTemplate}
                  onDelete={deleteJob}
                  onToggleStar={toggleStar}
                />
              </div>
            ))}
          </div>
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
    </div>
  );
}
