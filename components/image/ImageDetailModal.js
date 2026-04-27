/**
 * components/image/ImageDetailModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal fullscreen para visualizar uma imagem específica + toda metadata.
 * Ações: Download, Variação, Salvar Template, Mover Pasta, Deletar.
 *
 * Sprint v1.1 — abril 2026:
 *   · Título editável inline (PUT /api/image/jobs/[id]/title)
 *   · Smart decision visível (modelo + reasoning + confidence)
 *   · Reference mode dos refs aplicados
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
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
  onTitleUpdate,
  onEditApplied,
  onPrev,    // v1.2: navegação com ←/→
  onNext,
  onSelectVersion,  // v1.2: click na strip de versões troca o job
}) {
  const { notify } = useNotification();
  const [title, setTitle] = useState(job?.title || '');
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  // v1.2: editor inline JÁ ABERTO por padrão quando job concluído
  const [showEditInput, setShowEditInput] = useState(
    !!(job?.status === 'done' && job?.result_image_url)
  );
  const [editPrompt, setEditPrompt] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  // v1.2: modelo de edição. Default 'gpt-image-2'; auto / fal-ai/flux-pro/kontext.
  const [editModel, setEditModel] = useState('gpt-image-2');
  const editInputRef = useRef(null);
  // v1.2: lineage de versões (job.parent_job_id chain)
  const [versions, setVersions] = useState([]);
  // v1.2: imagens anexadas no input de edição (até 3 — junto com original = 4)
  const [editRefs, setEditRefs] = useState([]); // Array<{url}>
  const [editUploading, setEditUploading] = useState(false);
  const editFileInputRef = useRef(null);

  useEffect(() => {
    setTitle(job?.title || '');
    setShowEditInput(!!(job?.status === 'done' && job?.result_image_url));
    setEditPrompt('');
    setEditRefs([]);
  }, [job?.id, job?.title, job?.status, job?.result_image_url]);

  // v1.2: upload das refs anexadas no editor
  async function handleEditUpload(files) {
    if (!files || files.length === 0) return;
    const remaining = 3 - editRefs.length;
    if (remaining <= 0) {
      notify('Máximo 3 imagens adicionais', 'warning');
      return;
    }
    const accepted = Array.from(files).slice(0, remaining);
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
    setEditUploading(true);
    const newRefs = [];
    for (const file of accepted) {
      if (!ALLOWED.includes(file.type)) {
        notify(`Formato inválido: ${file.name}`, 'error');
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        notify(`${file.name} excede 10 MB`, 'error');
        continue;
      }
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.success && json.url) {
          // Normaliza pra path interno
          let url = json.url;
          if (!url.startsWith('/')) {
            try { url = new URL(url).pathname; } catch { /* mantem */ }
          }
          newRefs.push({ url });
        } else {
          throw new Error(json.error || 'falha no upload');
        }
      } catch (err) {
        notify(`Erro: ${err.message}`, 'error');
      }
    }
    setEditUploading(false);
    if (newRefs.length) setEditRefs(prev => [...prev, ...newRefs]);
  }

  // v1.2: carrega lineage de versões (parent_job_id chain).
  // Se este job tem parent, usa o parent como root; senão, este job é o root.
  useEffect(() => {
    if (!job?.id) { setVersions([]); return; }
    const rootId = job.parent_job_id || job.id;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/image/jobs?parentJobId=${rootId}&limit=20`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          // Ordena cronologicamente (root → mais recente)
          const sorted = [...json.data].sort((a, b) =>
            new Date(a.created_at) - new Date(b.created_at)
          );
          setVersions(sorted);
        }
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [job?.id, job?.parent_job_id]);

  // Esc fecha + ←/→ navega + Cmd/Ctrl+E foca o input de edição (v1.2)
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isInputFocused = ['input', 'textarea'].includes(tag);

      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      // Cmd/Ctrl+E: foca campo de edição (mesmo se input está focado)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        setShowEditInput(true);
        // useEffect abaixo cuida de focar
        setTimeout(() => editInputRef.current?.focus(), 0);
        return;
      }
      // ←/→ só fora de inputs (senão atrapalha digitação)
      if (!isInputFocused) {
        if (e.key === 'ArrowLeft' && onPrev) {
          e.preventDefault();
          onPrev();
        } else if (e.key === 'ArrowRight' && onNext) {
          e.preventDefault();
          onNext();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

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

  async function applyEdit() {
    if (!editPrompt.trim()) return;
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/image/jobs/${job.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editPrompt: editPrompt.trim(),
          // v1.2: 'auto' não vai no body (deixa o backend escolher)
          ...(editModel && editModel !== 'auto' ? { model: editModel } : {}),
          // v1.2: imagens anexadas no input de edit (até 3)
          ...(editRefs.length > 0 ? { additionalRefs: editRefs } : {}),
        }),
      });
      const json = await res.json();
      if (res.status === 429) {
        notify(json.error || 'Limite atingido', 'warning', 6000);
        return;
      }
      if (!json.success) throw new Error(json.error || 'falha');
      notify(`Edição em fila — usando ${json.data.model}`, 'success', 4000);
      onEditApplied?.(json.data);
      setShowEditInput(false);
      setEditPrompt('');
      onClose?.();
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function saveTitle() {
    if (!title.trim() || title === job.title) {
      setTitleEditing(false);
      return;
    }
    setTitleSaving(true);
    try {
      const res = await fetch(`/api/image/jobs/${job.id}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'falha');
      notify('Título salvo', 'success', 1500);
      onTitleUpdate?.(json.data);
      setTitleEditing(false);
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setTitleSaving(false);
    }
  }

  // v1.2: detecção de divergência de brandbook. Se o job foi disparado com
  // brandbook ativo (brandbook_id setado) mas brandbook_used=false, alguma
  // coisa abortou a injeção (cache divergente, erro de query, etc).
  // Mostra banner pra o user saber que precisa regenerar.
  const brandbookDivergence = !!job.brandbook_id && !job.brandbook_used;

  // Refs com modo (formato novo) ou plano (legado)
  const refsArray = (() => {
    try {
      const meta = Array.isArray(job.reference_image_metadata)
        ? job.reference_image_metadata
        : JSON.parse(job.reference_image_metadata || '[]');
      if (Array.isArray(meta) && meta.length > 0) return meta;
      const urls = Array.isArray(job.reference_image_urls)
        ? job.reference_image_urls
        : JSON.parse(job.reference_image_urls || '[]');
      return (urls || []).map(url => ({ url, mode: 'inspiration' }));
    } catch { return []; }
  })();

  const smartDecision = (() => {
    try {
      return typeof job.smart_decision === 'string'
        ? JSON.parse(job.smart_decision)
        : job.smart_decision;
    } catch { return null; }
  })();

  return (
    <div className={styles.detailOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.detailCard} onClick={e => e.stopPropagation()}>
        <div className={styles.detailImageWrap}>
          {job.result_image_url ? (
            <img src={job.result_image_url} alt={job.title || job.raw_description?.slice(0, 80) || 'Imagem'} className={styles.detailImage} />
          ) : (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
              Imagem ainda não disponível
            </div>
          )}
        </div>

        <div className={styles.detailMeta}>
          {/* Título editável + botão fechar */}
          <div className={styles.detailMetaTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {titleEditing ? (
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') { setTitle(job.title || ''); setTitleEditing(false); }
                }}
                autoFocus
                style={{
                  flex: 1, fontFamily: 'var(--font-sans)', fontSize: '0.85rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'var(--text-primary)', padding: '4px 8px', borderRadius: 4,
                }}
                maxLength={80}
              />
            ) : (
              <span
                onClick={() => setTitleEditing(true)}
                title="Clique pra editar o título"
                style={{
                  flex: 1, cursor: 'pointer',
                  color: job.title ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontStyle: job.title ? 'normal' : 'italic',
                }}
              >
                {titleSaving ? 'Salvando...' : (job.title || 'Sem título — clique pra adicionar')}
              </span>
            )}
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
              {job.format} · {job.aspect_ratio}
            </span>
            <button type="button" className="btn btn-icon btn-secondary" onClick={onClose} aria-label="Fechar">
              <Icon name="x" size={12} />
            </button>
          </div>

          {brandbookDivergence && (
            <div style={{
              padding: '8px 12px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 4,
              fontSize: '0.7rem',
              color: '#f59e0b',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.4,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}>
              <Icon name="alert" size={12} />
              <div>
                <strong>BRANDBOOK NÃO INJETADO.</strong> Este job estava ligado a um brandbook
                mas o prompt não foi gerado a partir dele (provavelmente cache divergente
                ou erro). Clique em <strong>Variação</strong> ou regere a imagem com bypass
                de cache pra garantir que a marca seja respeitada.
              </div>
            </div>
          )}

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

          {/* Smart decision (se houver) */}
          {smartDecision && smartDecision.reasoning && (
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>
                Decisão de modelo · {smartDecision.used_smart_mode ? 'Smart Mode' : 'Heurística'}
                {typeof smartDecision.confidence === 'number' && (
                  <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>
                    ({Math.round(smartDecision.confidence * 100)}% confiança)
                  </span>
                )}
              </span>
              <span className={styles.detailFieldValue} style={{ fontStyle: 'italic' }}>
                {smartDecision.reasoning}
              </span>
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
                {job.timed_out && <span style={{ marginLeft: 6, color: '#f59e0b' }}>(timeout)</span>}
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
                {job.brandbook_used
                  ? `Sim${job.client_name ? ` · ${job.client_name}` : ''}`
                  : (job.brandbook_id ? 'Não (divergência)' : 'Não')}
              </span>
            </div>
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Criada</span>
              <span className={`${styles.detailFieldValue} mono`}>{formatDate(job.created_at)}</span>
            </div>
          </div>

          {refsArray.length > 0 && (
            <div className={styles.detailField}>
              <span className={styles.detailFieldLabel}>Referências usadas ({refsArray.length})</span>
              <div className={styles.detailRefsRow}>
                {refsArray.map((r, i) => (
                  <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={r.url} alt={`Ref ${i + 1}`} />
                    <span style={{
                      position: 'absolute', bottom: 2, left: 2, right: 2,
                      background: 'rgba(0,0,0,0.7)', color: '#fff',
                      fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
                      textAlign: 'center', padding: '1px 0', borderRadius: 2,
                    }}>{r.mode || 'inspiration'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Editor inline — sprint v1.1 */}
          {showEditInput && (
            <div style={{
              padding: 12, marginTop: 4,
              background: 'rgba(168, 85, 247, 0.05)',
              border: '1px solid rgba(168, 85, 247, 0.2)',
              borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Editar com IA
              </div>
              <textarea
                ref={editInputRef}
                className="textarea"
                rows={3}
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
                placeholder="O que mudar? Ex: trocar fundo pra azul · adicionar legenda 'Promoção 50% off' · remover o relógio do canto direito"
                disabled={editSubmitting}
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') applyEdit();
                  if (e.key === 'Escape') { e.target.blur(); }
                }}
              />

              {/* v1.2: anexar até 3 imagens adicionais como referência */}
              <input
                ref={editFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                style={{ display: 'none' }}
                onChange={e => { handleEditUpload(e.target.files); e.target.value = ''; }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => editFileInputRef.current?.click()}
                  disabled={editUploading || editSubmitting || editRefs.length >= 3}
                  title="Anexar imagem como referência adicional (até 3)"
                >
                  <Icon name={editUploading ? 'sparkles' : 'plus'} size={11} />
                  {editUploading ? 'Subindo...' : `Anexar (${editRefs.length}/3)`}
                </button>
                {editRefs.map((r, i) => (
                  <div
                    key={r.url + i}
                    style={{
                      position: 'relative',
                      width: 44, height: 44,
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: '1px solid rgba(168,85,247,0.4)',
                    }}
                  >
                    <img src={r.url} alt={`Ref ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      onClick={() => setEditRefs(prev => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remover anexo"
                      style={{
                        position: 'absolute', top: -4, right: -4,
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.85)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: 0,
                      }}
                    >
                      <Icon name="x" size={9} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                <select
                  value={editModel}
                  onChange={e => setEditModel(e.target.value)}
                  disabled={editSubmitting}
                  className="select"
                  style={{ fontSize: '0.7rem', padding: '4px 8px', maxWidth: 180 }}
                  title="Modelo de IA usado pra edição"
                >
                  <option value="auto">Auto (recomendado)</option>
                  <option value="gpt-image-2">GPT Image 2</option>
                  <option value="fal-ai/flux-pro/kontext">Flux Kontext Pro</option>
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setShowEditInput(false); setEditPrompt(''); }}
                    disabled={editSubmitting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="sigma-btn-primary btn-sm"
                    onClick={applyEdit}
                    disabled={editSubmitting || !editPrompt.trim()}
                  >
                    <Icon name="zap" size={11} />
                    {editSubmitting ? 'Enviando...' : 'Aplicar edição'}
                  </button>
                </div>
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                A imagem atual vira referência (modo Personagem) e o modelo escolhido aplica sua mudança preservando o resto.
              </div>
            </div>
          )}

          {/* v1.2: strip de versões (lineage do parent_job_id). Mostra
              apenas se há mais de 1 (root + N edições). */}
          {versions.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <span className={styles.detailFieldLabel}>
                Versões deste lineage ({versions.length})
              </span>
              <div style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                paddingBottom: 4,
              }}>
                {versions.map((v) => {
                  const isCurrent = v.id === job.id;
                  return (
                    <div
                      key={v.id}
                      onClick={() => {
                        if (!isCurrent && onSelectVersion) onSelectVersion(v);
                      }}
                      title={`${v.title || 'Sem título'} · ${new Date(v.created_at).toLocaleString('pt-BR')}${v.parent_job_id ? ' · edição' : ' · original'}`}
                      style={{
                        position: 'relative',
                        flex: '0 0 auto',
                        width: 64, height: 64,
                        borderRadius: 4,
                        border: isCurrent
                          ? '2px solid var(--brand-500)'
                          : '1px solid var(--border-default)',
                        overflow: 'hidden',
                        cursor: isCurrent ? 'default' : 'pointer',
                        opacity: isCurrent ? 1 : 0.75,
                      }}
                    >
                      {v.result_thumbnail_url
                        ? <img src={v.result_thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', background: 'var(--surface-card)' }} />
                      }
                      {!v.parent_job_id && (
                        <span style={{
                          position: 'absolute', top: 2, left: 2,
                          background: 'rgba(0,0,0,0.7)', color: '#fff',
                          fontFamily: 'var(--font-mono)', fontSize: '0.5rem',
                          padding: '1px 4px', borderRadius: 2, letterSpacing: '0.05em',
                        }}>ORIG</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.detailActions}>
            <button type="button" className="sigma-btn-primary btn-sm" onClick={download} disabled={!job.result_image_url}>
              <Icon name="download" size={11} />
              Download
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRegenerate?.(job)} title="Gera nova imagem com mesmo prompt mas seed/render diferente">
              <Icon name="refresh" size={11} />
              Variação
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowEditInput(v => !v)}
              disabled={!job.result_image_url}
              title="Aplica uma mudança específica usando esta imagem como referência"
              style={showEditInput ? { background: 'rgba(168, 85, 247, 0.15)', borderColor: '#a855f7', color: '#a855f7' } : undefined}
            >
              <Icon name="edit" size={11} />
              Editar com IA
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
