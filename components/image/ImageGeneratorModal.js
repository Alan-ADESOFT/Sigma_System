/**
 * components/image/ImageGeneratorModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal fullscreen 90vw × 90vh do Gerador de Imagem.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Header: Cliente · Pasta ▾ · Brandbook badge · ações · ✕     │
 *   ├──────────────────────┬──────────────────────────────────────┤
 *   │  Controles (380px)   │  Preview da imagem (60% altura)      │
 *   │  - Formato           │  + meta + ações (download/variação)  │
 *   │  - Modelo            ├──────────────────────────────────────┤
 *   │  - Aspect ratio      │  Histórico (40% altura)              │
 *   │  - Descrição         │  Grid de thumbs clicáveis            │
 *   │  - Observações       │                                      │
 *   │  - Referências       │                                      │
 *   │  - Prompt técnico    │                                      │
 *   │                      │                                      │
 *   │  [Salvar tpl] [Gerar]│                                      │
 *   └──────────────────────┴──────────────────────────────────────┘
 *
 * Emite eventos pra o pai chamar Overlay/Toast quando jobId vier.
 * NÃO altera lógica do back: usa os mesmos endpoints existentes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import FormatSelector, { FORMATS } from './FormatSelector';
import AspectRatioSelector from './AspectRatioSelector';
import ModelSelector, { MODELS } from './ModelSelector';
import ReferenceUploader from './ReferenceUploader';
import PromptViewer from './PromptViewer';
import FolderModal from './FolderModal';
import TemplateModal from './TemplateModal';
import HistoryStrip from './HistoryStrip';
import ContextMenu from './ContextMenu';
import TemplatesList from './TemplatesList';
import styles from '../../assets/style/imageModal.module.css';

const MAX_DESC = 4000;
const STATUS_FILTERS = [
  { id: 'all',    label: 'Todas' },
  { id: 'done',   label: 'Concluídas' },
  { id: 'queued', label: 'Gerando' },
  { id: 'error',  label: 'Falhas' },
];

function fmtRelative(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function ImageGeneratorModal({
  client,
  initialFolderId,
  initialFolder,       // objeto da pasta vindo do FolderBrowser (já tem nome)
  brandbook,
  brandbookLoading,
  settings,
  advancedMode = false,  // v1.2: toggle Cmd+Shift+A
  onClose,
  onGenerate,
  onEditJob,           // v1.2: parent abre detail modal com editor inline
  refreshTrigger = 0,
}) {
  const { notify } = useNotification();

  // ─── Estado dos controles ──────────────────────────────────────
  const [format, setFormat] = useState('square_post');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  // v1.2: default sempre 'auto'. Settings.default_model só vale em modo avançado.
  const [model, setModel] = useState('auto');
  const [description, setDescription] = useState('');
  const [observations, setObservations] = useState('');
  const [referenceUrls, setReferenceUrls] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [ignoreBrandbook, setIgnoreBrandbook] = useState(false);
  const [lastOptimized, setLastOptimized] = useState(null);

  // ─── Pastas ───────────────────────────────────────────────────
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId || 'all');
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const folderMenuRef = useRef(null);

  // ─── Histórico ────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('all');
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [hasActive, setHasActive] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  // ─── Template modal ───────────────────────────────────────────
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateSourceJob, setTemplateSourceJob] = useState(null);

  // ─── Context menu (v1.2) ──────────────────────────────────────
  const [contextMenu, setContextMenu] = useState(null); // { x, y, job } | null

  // ─── Templates (v1.2 — montado no workspace) ──────────────────
  // refreshKey força reload da lista quando salvar um template novo
  const [templatesRefresh, setTemplatesRefresh] = useState(0);
  // Aplica template aos campos do workspace (chamado pelo TemplatesList.onUse)
  function applyTemplate(tpl) {
    if (!tpl) return;
    if (tpl.format) setFormat(tpl.format);
    if (tpl.aspect_ratio) setAspectRatio(tpl.aspect_ratio);
    // tpl.model é só sugestão — em modo normal sempre 'auto'. Em advanced
    // respeita o que veio.
    if (advancedMode && tpl.model) setModel(tpl.model);
    if (tpl.raw_description) setDescription(tpl.raw_description);
    if (tpl.observations) setObservations(tpl.observations);
    if (Array.isArray(tpl.reference_image_metadata) && tpl.reference_image_metadata.length > 0) {
      setReferenceUrls(tpl.reference_image_metadata);
    }
  }

  // ─── Refs pra evitar dependências instáveis em useCallback ─────
  // Sem isso, `selectedJob` nas deps de `loadJobs` recriava a função
  // a cada auto-select, derrubando e recriando o setInterval do polling
  // numa cascata que multiplicava as requests (5+/s observado em dev).
  const selectedJobRef = useRef(selectedJob);
  useEffect(() => { selectedJobRef.current = selectedJob; }, [selectedJob]);

  // Guard contra fetches concorrentes — protege contra Strict Mode duplicar
  // chamadas em dev e contra ticks acumulados do setInterval.
  const inFlightRef = useRef(false);

  // ─── Sync formato → aspect ratio ───────────────────────────────
  useEffect(() => {
    const def = FORMATS.find(f => f.id === format);
    if (def && def.aspect !== '—' && aspectRatio !== def.aspect) {
      setAspectRatio(def.aspect);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  // ─── Carrega pastas do cliente ─────────────────────────────────
  const loadFolders = useCallback(async () => {
    if (!client?.id) return;
    try {
      const res = await fetch(`/api/image/folders?clientId=${client.id}`);
      const json = await res.json();
      if (json.success) setFolders(json.data || []);
    } catch (err) {
      console.error('[ERRO][Frontend:ImageGeneratorModal] folders', err.message);
    }
  }, [client?.id]);

  useEffect(() => { loadFolders(); }, [loadFolders, refreshTrigger]);

  // ─── Carrega histórico ─────────────────────────────────────────
  // IMPORTANTE: NÃO incluir `selectedJob` nas deps. Auto-selecionamos via
  // ref pra evitar recriação da função a cada select.
  const loadJobs = useCallback(async () => {
    if (inFlightRef.current) return;        // protege contra concorrência
    inFlightRef.current = true;
    try {
      const params = new URLSearchParams();
      if (client?.id) params.set('clientId', client.id);
      if (selectedFolderId && selectedFolderId !== 'all') {
        params.set('folderId', selectedFolderId);
      }
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', '40');

      const res = await fetch(`/api/image/jobs?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const items = json.data || [];
      setJobs(items);
      setHasActive(items.some(j => j.status === 'queued' || j.status === 'running'));

      // Auto-seleciona primeira imagem concluída como preview — usa ref
      // pra não estourar o useCallback quando selectedJob muda.
      if (!selectedJobRef.current) {
        const firstDone = items.find(j => j.status === 'done' && j.result_image_url);
        if (firstDone) {
          selectedJobRef.current = firstDone;
          setSelectedJob(firstDone);
        }
      }
    } catch (err) {
      console.error('[ERRO][Frontend:ImageGeneratorModal] jobs', err.message);
    } finally {
      setLoadingJobs(false);
      inFlightRef.current = false;
    }
  }, [client?.id, selectedFolderId, statusFilter]);

  useEffect(() => {
    setLoadingJobs(true);
    loadJobs();
  }, [client?.id, selectedFolderId, statusFilter, refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling visibility-aware enquanto há job ativo. 5s é confortável pro
  // Neon e suficiente pra UI sentir "ao vivo" — 3s estava sobrepondo com
  // o polling do overlay (2s) quando ambos estavam abertos.
  useEffect(() => {
    if (!hasActive) return;
    let id;
    function tick() { loadJobs(); }
    function start() { id = setInterval(tick, 5000); }
    function stop() { if (id) clearInterval(id); }
    function onVis() {
      stop();
      if (document.visibilityState === 'visible') start();
    }
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [hasActive, loadJobs]);

  // Click outside folder menu
  useEffect(() => {
    if (!folderMenuOpen) return;
    function onClick(e) {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target)) {
        setFolderMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [folderMenuOpen]);

  // Esc fecha modal (a menos que esteja gerando) + ←/→ navega histórico
  useEffect(() => {
    function onKey(e) {
      // Ignora se foco em input/textarea — não atrapalha digitação
      const tag = (e.target?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;

      if (e.key === 'Escape' && !submitting) {
        onClose?.();
        return;
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && jobs.length > 0) {
        e.preventDefault();
        const idx = jobs.findIndex(j => j.id === selectedJob?.id);
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const nextIdx = idx === -1 ? 0 : Math.max(0, Math.min(jobs.length - 1, idx + dir));
        const next = jobs[nextIdx];
        if (next) setSelectedJob(next);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting, jobs, selectedJob?.id]);

  const isBlocked = !description.trim();
  const charCount = description.length;
  const overWarn = charCount > MAX_DESC * 0.9;
  const over = charCount > MAX_DESC;

  const currentFolder = useMemo(() => {
    if (!selectedFolderId || selectedFolderId === 'all') return null;
    return folders.find(f => f.id === selectedFolderId) || null;
  }, [selectedFolderId, folders]);

  // ─── Submit ────────────────────────────────────────────────────
  async function handleSubmit() {
    if (isBlocked) return;
    if (description.length > MAX_DESC) {
      notify('Descrição excede 4000 caracteres', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      // Sprint v1.2 — abril 2026: ReferenceUploader devolve [{url}] (sem mode).
      // O backend (refClassifier) classifica automaticamente. Strings legadas
      // viram { url } puro também.
      const refsNormalized = (referenceUrls || []).map(r =>
        typeof r === 'string' ? { url: r } : r
      );
      const body = {
        rawDescription: description.trim(),
        clientId: client?.id || null,
        folderId: (selectedFolderId && selectedFolderId !== 'all') ? selectedFolderId : null,
        format,
        aspectRatio,
        model,
        observations: observations.trim() || null,
        referenceImages: refsNormalized,
        useBrandbook: !ignoreBrandbook,
      };

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

      const provider = MODELS.find(m => m.id === model)?.provider || 'vertex';
      onGenerate?.({ jobId: json.data.jobId, model, provider });
      loadJobs();
    } catch (err) {
      console.error('[ERRO][Frontend:ImageGeneratorModal] submit', err.message);
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Ações no preview ──────────────────────────────────────────
  function downloadCurrent() {
    if (!selectedJob?.result_image_url) return;
    const a = document.createElement('a');
    a.href = selectedJob.result_image_url;
    a.download = `${selectedJob.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function regenerateCurrent() {
    if (!selectedJob?.id) return;
    try {
      const res = await fetch(`/api/image/jobs/${selectedJob.id}/regenerate`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const provider = MODELS.find(m => m.id === selectedJob.model)?.provider || selectedJob.provider;
      onGenerate?.({ jobId: json.data.jobId, model: selectedJob.model, provider });
      loadJobs();
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  async function deleteCurrent() {
    if (!selectedJob?.id) return;
    if (!window.confirm('Apagar esta imagem?')) return;
    try {
      const res = await fetch(`/api/image/jobs/${selectedJob.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      notify('Imagem apagada', 'success');
      setSelectedJob(null);
      loadJobs();
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  function saveAsTemplate() {
    if (!client?.id) {
      notify('Templates só funcionam com cliente selecionado', 'warning');
      return;
    }
    const source = selectedJob || {
      format,
      aspect_ratio: aspectRatio,
      model,
      raw_description: description,
      observations,
      optimized_prompt: lastOptimized?.prompt || null,
      result_thumbnail_url: null,
    };
    setTemplateSourceJob(source);
    setShowTemplateModal(true);
  }

  async function toggleStarCurrent() {
    if (!selectedJob?.id) return;
    try {
      await fetch(`/api/image/jobs/${selectedJob.id}/star`, { method: 'POST' });
      setSelectedJob(prev => prev ? { ...prev, is_starred: !prev.is_starred } : prev);
      loadJobs();
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  // ─── Brandbook indicator ───────────────────────────────────────
  const brandbookStatus = brandbookLoading ? null : (brandbook ? 'ready' : 'missing');

  return (
    <div className={styles.backdrop} onClick={submitting ? undefined : onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* ─── Header ─── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.brandTag}>Gerador</span>
            <span className={styles.headerSeparator} />
            <span className={styles.clientName} title={client?.company_name || 'Sem cliente'}>
              {client?.company_name || 'Geração livre'}
            </span>

            {/* Folder picker */}
            {client?.id && (
              <div ref={folderMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={styles.folderPicker}
                  onClick={() => setFolderMenuOpen(v => !v)}
                  aria-expanded={folderMenuOpen}
                >
                  <Icon name="folder" size={11} />
                  {currentFolder ? currentFolder.name : 'Todas as pastas'}
                  <Icon name="chevronDown" size={10} />
                </button>
                {folderMenuOpen && (
                  <div className={styles.folderMenu}>
                    <div
                      className={styles.folderMenuItem}
                      aria-selected={selectedFolderId === 'all'}
                      onClick={() => { setSelectedFolderId('all'); setFolderMenuOpen(false); }}
                    >
                      <Icon name="layers" size={11} />
                      Todas as pastas
                    </div>
                    {folders.length > 0 && <div className={styles.folderMenuDivider} />}
                    {folders.map(f => (
                      <div
                        key={f.id}
                        className={styles.folderMenuItem}
                        aria-selected={selectedFolderId === f.id}
                        onClick={() => { setSelectedFolderId(f.id); setFolderMenuOpen(false); }}
                      >
                        <span style={{ color: f.color || 'currentColor' }}>
                          <Icon name="folder" size={11} />
                        </span>
                        <span style={{
                          flex: 1, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{f.name}</span>
                        <span className={styles.folderMenuCount}>{f.job_count || 0}</span>
                      </div>
                    ))}
                    <div className={styles.folderMenuDivider} />
                    <div className={styles.folderMenuFooter}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFolder(null);
                          setShowFolderModal(true);
                          setFolderMenuOpen(false);
                        }}
                      >
                        <Icon name="folderPlus" size={11} />
                        Nova pasta
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Brandbook indicator */}
            {client?.id && brandbookStatus && (
              <button
                type="button"
                onClick={() => setIgnoreBrandbook(v => !v)}
                className={`${styles.brandbookIndicator} ${styles[brandbookStatus]}`}
                title={
                  brandbookStatus === 'ready'
                    ? (ignoreBrandbook
                        ? 'Brandbook ignorado nesta sessão (clique para reativar)'
                        : 'Brandbook ativo (clique para ignorar)')
                    : 'Sem brandbook configurado'
                }
                style={{ cursor: brandbookStatus === 'ready' ? 'pointer' : 'default' }}
              >
                <Icon
                  name={brandbookStatus === 'ready' ? (ignoreBrandbook ? 'x' : 'check') : 'alert'}
                  size={10}
                />
                {brandbookStatus === 'ready' ? (ignoreBrandbook ? 'Ignorando' : 'Brandbook') : 'Sem brandbook'}
              </button>
            )}
          </div>

          <div className={styles.headerRight}>
            <button
              type="button"
              className={styles.btnIcon}
              onClick={onClose}
              aria-label="Fechar"
              disabled={submitting}
              title="Fechar (Esc)"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>

        {/* ─── Body ─── */}
        <div className={styles.body}>
          {/* Coluna esquerda — Controles */}
          <div className={styles.controlsCol}>
            <div className={styles.controlsScroll}>
              <div className={styles.controlGroup}>
                <div className={styles.controlLabel}>Formato</div>
                <FormatSelector value={format} onChange={setFormat} />
              </div>

              <div className={styles.controlGroup}>
                <div className={styles.controlLabel}>Modelo de IA</div>
                {advancedMode ? (
                  <ModelSelector
                    value={model}
                    onChange={setModel}
                    settings={settings}
                    enabledModels={settings?.enabled_models}
                  />
                ) : (
                  <div
                    className="glass-card"
                    style={{
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                    }}>
                      <Icon name="sparkles" size={11} />
                      <span style={{
                        color: 'var(--text-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        Modelo: auto
                      </span>
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                      lineHeight: 1.4,
                    }}>
                      O sistema escolhe o melhor modelo automaticamente para
                      cada pedido — baseado no seu texto, nas referências e
                      no que você quer preservar (pessoa, cenário, estilo).
                      Sem precisar configurar.
                    </div>
                  </div>
                )}
              </div>

              {/* Aspect ratio só aparece quando formato é "Custom".
                  Pros demais, o aspect já está embutido no chip de formato. */}
              {format === 'custom' && (
                <div className={styles.controlGroup}>
                  <div className={styles.controlLabel}>
                    Aspect ratio
                    <span className={styles.controlHint}>obrigatório em custom</span>
                  </div>
                  <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />
                </div>
              )}

              <div className={styles.controlGroup}>
                <div className={styles.controlLabel}>
                  Descrição <span className={styles.required}>*</span>
                  <span className={styles.controlHint}>Ctrl+Enter para gerar</span>
                </div>
                <div className={styles.bigTextareaWrap}>
                  <textarea
                    className={`textarea ${styles.bigTextarea}`}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Descreva a imagem que você quer gerar..."
                    maxLength={MAX_DESC + 200}
                    onKeyDown={e => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isBlocked && !submitting && !over) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                  />
                  <span className={`${styles.charCount} ${over ? styles.over : overWarn ? styles.warning : ''}`}>
                    {charCount}/{MAX_DESC}
                  </span>
                </div>
              </div>

              <div className={styles.controlGroup}>
                <div className={styles.controlLabel}>
                  Observações
                  <span className={styles.controlHint}>opcional</span>
                </div>
                <textarea
                  className={`textarea ${styles.smallTextarea}`}
                  value={observations}
                  onChange={e => setObservations(e.target.value)}
                  placeholder="Ex: evite pessoas no fundo, sem texto..."
                />
              </div>

              <div className={styles.controlGroup}>
                <div className={styles.controlLabel}>
                  Referências
                  <span className={styles.controlHint}>até 5</span>
                </div>
                <ReferenceUploader
                  value={referenceUrls}
                  onChange={setReferenceUrls}
                  advancedMode={advancedMode}
                />
              </div>

              <div className={styles.controlGroup}>
                <PromptViewer
                  prompt={lastOptimized?.prompt || selectedJob?.optimized_prompt}
                  model={lastOptimized?.model || selectedJob?.model}
                  hash={lastOptimized?.hash}
                  fromCache={lastOptimized?.fromCache}
                />
              </div>

              {/* v1.2: Templates (só com cliente — templates são por-cliente) */}
              {client?.id ? (
                <div className={styles.controlGroup}>
                  <TemplatesList
                    clientId={client.id}
                    onUse={applyTemplate}
                    refreshKey={templatesRefresh}
                  />
                </div>
              ) : (
                <div className={styles.controlGroup}>
                  <div
                    className="glass-card"
                    style={{
                      padding: '10px 12px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.55rem', color: 'var(--text-secondary)' }}>
                      TEMPLATES
                    </div>
                    Disponível só com cliente selecionado — templates são salvos por cliente.
                  </div>
                </div>
              )}
            </div>

            <div className={styles.controlsActions}>
              <button
                type="button"
                className={styles.btnSecondaryFull}
                onClick={saveAsTemplate}
                disabled={!description.trim() || !client?.id}
                title={!client?.id ? 'Selecione um cliente para salvar templates' : 'Salvar configuração como template'}
              >
                <Icon name="layers" size={11} />
                Template
              </button>

              <button
                type="button"
                className={styles.btnGenerate}
                onClick={handleSubmit}
                disabled={isBlocked || submitting || over}
                title={isBlocked ? 'Preencha a descrição' : 'Gerar imagem (Ctrl+Enter)'}
              >
                <Icon name="zap" size={13} />
                {submitting ? 'Enfileirando' : 'Gerar imagem'}
              </button>
            </div>
          </div>

          {/* Coluna direita */}
          <div className={styles.rightCol}>
            {/* Preview da imagem */}
            <div className={styles.previewArea}>
              <div className={styles.previewSurface}>
                {selectedJob?.result_image_url ? (
                  <img
                    key={selectedJob.id}
                    src={selectedJob.result_image_url}
                    alt={selectedJob.raw_description?.slice(0, 80) || 'Imagem gerada'}
                    className={`${styles.previewImage} animate-fade-in-up`}
                  />
                ) : selectedJob?.status === 'queued' || selectedJob?.status === 'running' ? (
                  <div className={styles.previewLoading}>
                    <div className={styles.previewLoadingOrb} />
                    <div>Gerando imagem...</div>
                  </div>
                ) : (
                  <div className={styles.previewEmpty}>
                    <div className={styles.previewEmptyIcon}>
                      <Icon name="sparkles" size={28} />
                    </div>
                    <div className={styles.previewEmptyTitle}>Pronto para gerar</div>
                    <div className={styles.previewEmptyDesc}>
                      Preencha a descrição à esquerda e clique em Gerar imagem.
                      Sua geração vai aparecer aqui em alguns segundos.
                    </div>
                  </div>
                )}
              </div>

              {/* Meta + ações */}
              <div className={styles.previewMeta}>
                <div className={styles.previewMetaInfo}>
                  {selectedJob ? (
                    <>
                      <span><strong>{selectedJob.model}</strong></span>
                      <span>{selectedJob.format} · {selectedJob.aspect_ratio}</span>
                      {selectedJob.duration_ms && (
                        <span>{(selectedJob.duration_ms / 1000).toFixed(1)}s</span>
                      )}
                      {selectedJob.cost_usd && (
                        <span>${parseFloat(selectedJob.cost_usd).toFixed(4)}</span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>
                      Aguardando primeira geração
                    </span>
                  )}
                </div>
                <div className={styles.previewActions}>
                  {selectedJob && (
                    <>
                      <button
                        type="button"
                        className={styles.previewActionBtn}
                        onClick={toggleStarCurrent}
                        title="Favoritar"
                      >
                        <Icon name="star" size={11} style={{ color: selectedJob.is_starred ? '#fbbf24' : undefined }} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.previewActionBtn} ${styles.primary}`}
                        onClick={downloadCurrent}
                        disabled={!selectedJob.result_image_url}
                      >
                        <Icon name="download" size={11} />
                        Download
                      </button>
                      <button
                        type="button"
                        className={styles.previewActionBtn}
                        onClick={regenerateCurrent}
                        title="Gerar variação"
                      >
                        <Icon name="refresh" size={11} />
                        Variação
                      </button>
                      <button
                        type="button"
                        className={styles.previewActionBtn}
                        onClick={() => {
                          setTemplateSourceJob(selectedJob);
                          setShowTemplateModal(true);
                        }}
                        title="Salvar como template"
                        disabled={!client?.id}
                      >
                        <Icon name="layers" size={11} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.previewActionBtn} ${styles.danger}`}
                        onClick={deleteCurrent}
                        title="Apagar"
                      >
                        <Icon name="trash" size={11} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Histórico */}
            <div className={styles.historyArea}>
              <div className={styles.historyHeader}>
                <span className={styles.historyTitle}>Histórico</span>
                <span className={styles.historyCount}>{jobs.length} {jobs.length === 1 ? 'item' : 'itens'}</span>
                <select
                  className={styles.historyFilter}
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  {STATUS_FILTERS.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              <HistoryStrip
                jobs={jobs}
                selectedId={selectedJob?.id || null}
                loading={loadingJobs}
                onSelect={(j) => setSelectedJob(j)}
                onContextMenu={(j, pos) => setContextMenu({ ...pos, job: j })}
              />
            </div>
          </div>
        </div>

        {/* Modais auxiliares */}
        {showFolderModal && (
          <FolderModal
            clientId={client?.id}
            folder={editingFolder}
            onClose={() => { setShowFolderModal(false); setEditingFolder(null); }}
            onSave={(folder) => {
              setShowFolderModal(false);
              setEditingFolder(null);
              loadFolders();
              if (folder?.id) setSelectedFolderId(folder.id);
            }}
          />
        )}

        {showTemplateModal && templateSourceJob && (
          <TemplateModal
            sourceJob={templateSourceJob}
            clientId={client?.id}
            onClose={() => { setShowTemplateModal(false); setTemplateSourceJob(null); }}
            onSave={() => {
              setShowTemplateModal(false);
              setTemplateSourceJob(null);
              setTemplatesRefresh(k => k + 1);  // v1.2: re-fetch lista
              notify('Template salvo', 'success');
            }}
          />
        )}

        {/* Context menu (botão direito numa thumb) — v1.2 */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            job={contextMenu.job}
            onClose={() => setContextMenu(null)}
            actions={[
              {
                id: 'edit',
                label: 'Editar com IA',
                icon: 'edit',
                disabled: !contextMenu.job?.result_image_url,
                onClick: (j) => {
                  // v1.2: pede pro parent abrir o detail modal (que tem o
                  // editor inline ja aberto). Sem isso, "Editar com IA" so
                  // mudava a thumb selecionada e nao acontecia nada visivel.
                  if (onEditJob) onEditJob(j);
                  else setSelectedJob(j);
                },
              },
              {
                id: 'variation',
                label: 'Variação fresca',
                icon: 'refresh',
                onClick: regenerateCurrent,
              },
              {
                id: 'download',
                label: 'Download',
                icon: 'download',
                disabled: !contextMenu.job?.result_image_url,
                onClick: (j) => {
                  if (!j?.result_image_url) return;
                  const a = document.createElement('a');
                  a.href = j.result_image_url;
                  a.download = `${j.id}.png`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                },
              },
              {
                id: 'template',
                label: 'Salvar como template',
                icon: 'layers',
                disabled: !client?.id,
                onClick: (j) => {
                  setTemplateSourceJob(j);
                  setShowTemplateModal(true);
                },
              },
              { divider: true },
              {
                id: 'delete',
                label: 'Apagar',
                icon: 'trash',
                danger: true,
                onClick: async (j) => {
                  if (!j?.id) return;
                  if (!window.confirm('Apagar esta imagem?')) return;
                  try {
                    await fetch(`/api/image/jobs/${j.id}`, { method: 'DELETE' });
                    if (selectedJob?.id === j.id) setSelectedJob(null);
                    loadJobs();
                    notify('Imagem apagada', 'success');
                  } catch (err) {
                    notify(`Erro: ${err.message}`, 'error');
                  }
                },
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
