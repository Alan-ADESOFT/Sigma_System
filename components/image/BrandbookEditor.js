/**
 * components/image/BrandbookEditor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor estruturado do JSON `structured_data` do brandbook ativo.
 * Auto-save após 2s de inatividade; manual save via botão sticky.
 *
 * Props:
 *   · brandbook: linha completa (ou seed com structured_data preenchido)
 *   · clientId
 *   · onSaved(updatedBrandbook): callback após persistência
 *
 * Se `brandbook` for null mas `seedStructuredData` existir, cria novo
 * (POST) na primeira save.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/brandbook.module.css';

const EMPTY_SCHEMA = {
  palette:    { primary: '', secondary: '', accent: '', neutral: [], text: '' },
  typography: { primary_font: '', secondary_font: '', weights: [] },
  tone: '',
  style_keywords: [],
  do: [],
  dont: [],
  references: [],
  notes: '',
};

function parseStructured(raw) {
  if (!raw) return { ...EMPTY_SCHEMA };
  if (typeof raw === 'string') {
    try { return { ...EMPTY_SCHEMA, ...JSON.parse(raw) }; } catch { return { ...EMPTY_SCHEMA }; }
  }
  return { ...EMPTY_SCHEMA, ...raw };
}

function isHex(v) {
  return typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);
}

function ColorField({ label, value, onChange }) {
  const v = value || '';
  return (
    <div className={styles.colorField}>
      <span className={styles.colorFieldLabel}>{label}</span>
      <div className={styles.colorRow}>
        <span
          className={styles.colorSwatch}
          style={{ background: isHex(v) ? v : 'rgba(255,255,255,0.04)' }}
        />
        <input
          className={styles.colorInput}
          value={v}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          maxLength={20}
        />
      </div>
    </div>
  );
}

function TagInput({ value = [], onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  function commit() {
    const v = draft.trim();
    if (!v) return;
    if (value.includes(v)) { setDraft(''); return; }
    onChange([...value, v]);
    setDraft('');
  }
  return (
    <div className={styles.tagInput}>
      {value.map((t, i) => (
        <span key={i} className={styles.tag}>
          {t}
          <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label={`Remover ${t}`}>
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
      <input
        className={styles.tagInputField}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
          if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
      />
    </div>
  );
}

function ListField({ items = [], onChange, kind = 'do', placeholder }) {
  function update(i, val) {
    const next = items.slice();
    next[i] = val;
    onChange(next);
  }
  return (
    <div className={styles.listField}>
      {items.map((row, i) => (
        <div key={i} className={styles.listRow}>
          <span className={`${styles.listIndex} ${styles[kind]}`}>{kind === 'do' ? '✓' : kind === 'dont' ? '✕' : i + 1}</span>
          <input
            className={styles.listInput}
            value={row}
            onChange={e => update(i, e.target.value)}
            placeholder={placeholder}
          />
          <button
            type="button"
            className={styles.listRemove}
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            aria-label="Remover item"
          >
            <Icon name="trash" size={11} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.addListBtn}
        onClick={() => onChange([...items, ''])}
      >
        <Icon name="plus" size={11} /> Adicionar
      </button>
    </div>
  );
}

// ── Fixed References (sprint v1.1) ─────────────────────────────────────────
// Até 5 imagens da marca que SEMPRE são injetadas como contexto visual em
// toda geração desse cliente. Independentes do JSON estruturado — usa
// endpoint dedicado (/api/image/brandbook/[clientId]/fixed-refs).
function FixedRefsSection({ clientId, brandbookId }) {
  const { notify } = useNotification();
  const fileRef = useRef(null);
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [editingIdx, setEditingIdx] = useState(null);

  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/image/brandbook/${clientId}/fixed-refs`)
      .then(r => r.json())
      .then(j => {
        if (j.success) setRefs(j.data?.fixedRefs || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId, brandbookId]);

  async function persist(next) {
    setRefs(next);
    try {
      const res = await fetch(`/api/image/brandbook/${clientId}/fixed-refs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixedRefs: next }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      notify('Referências fixas salvas', 'success', 1500);
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  async function uploadAndAdd(file, label) {
    if (refs.length >= 5) { notify('Máximo 5 referências fixas', 'warning'); return; }
    if (!label || label.length > 50) { notify('Label obrigatório (max 50 chars)', 'error'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.success || !json.url) throw new Error(json.error || 'falha no upload');
      const url = json.url.startsWith('/') ? json.url : new URL(json.url).pathname;
      await persist([...refs, { url, label }]);
      setDraftLabel('');
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setUploading(false);
    }
  }

  function remove(idx) {
    persist(refs.filter((_, i) => i !== idx));
  }

  function updateLabel(idx, label) {
    const next = refs.slice();
    next[idx] = { ...next[idx], label };
    persist(next);
  }

  return (
    <div className={`glass-card ${styles.section}`}>
      <div className={styles.sectionTitle}><Icon name="image" size={12} /> Referências fixas da marca</div>
      <div className={styles.sectionHint}>
        Até 5 imagens que entram em <strong>toda geração de imagem</strong> deste cliente como contexto visual.
        Use pra modelos da marca, produtos hero, fotos de campanha aprovada.
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Carregando...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginTop: 10 }}>
            {refs.map((r, i) => (
              <div key={r.url + i} style={{
                position: 'relative',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                overflow: 'hidden',
                padding: 8,
              }}>
                <img src={r.url} alt={r.label || `Ref ${i + 1}`} style={{
                  width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 4, marginBottom: 6,
                }} />
                {editingIdx === i ? (
                  <input
                    autoFocus
                    defaultValue={r.label || ''}
                    onBlur={e => { updateLabel(i, e.target.value); setEditingIdx(null); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { updateLabel(i, e.target.value); setEditingIdx(null); }
                      if (e.key === 'Escape') setEditingIdx(null);
                    }}
                    maxLength={50}
                    className="sigma-input"
                    style={{ fontSize: '0.65rem', padding: '3px 6px' }}
                  />
                ) : (
                  <div
                    onClick={() => setEditingIdx(i)}
                    title="Clique pra editar"
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >{r.label || 'sem label'}</div>
                )}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remover"
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(0,0,0,0.7)', color: '#fff',
                    border: 'none', borderRadius: '50%', width: 22, height: 22,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                ><Icon name="x" size={11} /></button>
              </div>
            ))}

            {refs.length < 5 && (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(255,255,255,0.15)',
                borderRadius: 6,
                padding: 10,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <input
                  className="sigma-input"
                  placeholder="Label (ex: Modelo principal)"
                  value={draftLabel}
                  onChange={e => setDraftLabel(e.target.value)}
                  maxLength={50}
                  style={{ fontSize: '0.7rem' }}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) uploadAndAdd(file, draftLabel.trim());
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={uploading || !draftLabel.trim()}
                  onClick={() => fileRef.current?.click()}
                  style={{ width: '100%' }}
                >
                  {uploading ? '...' : <><Icon name="plus" size={11} /> Adicionar imagem</>}
                </button>
              </div>
            )}
          </div>
          <div style={{ marginTop: 8, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            {refs.length}/5 referências fixas
          </div>
        </>
      )}
    </div>
  );
}

export default function BrandbookEditor({ brandbook, clientId, onSaved, seedStructuredData }) {
  const { notify } = useNotification();
  const [data, setData] = useState(() => parseStructured(brandbook?.structured_data || seedStructuredData));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const debounceRef = useRef(null);

  // Sync quando trocar brandbook externo
  useEffect(() => {
    setData(parseStructured(brandbook?.structured_data || seedStructuredData));
    setDirty(false);
  }, [brandbook?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(updater) {
    setData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      return next;
    });
    setDirty(true);
  }

  // Auto-save após 2s de inatividade
  useEffect(() => {
    if (!dirty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(true), 2000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dirty]);

  // UX: Ctrl/Cmd + S força save manual sem esperar o auto-save
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (dirty && !saving) save(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, data]);

  async function save(silent = false) {
    if (saving) return;
    setSaving(true);
    try {
      let res, json;
      if (brandbook?.id) {
        res = await fetch(`/api/image/brandbook/${clientId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredData: data }),
        });
      } else {
        // Cria novo (vem de "manual" ou de fluxos sem POST anterior)
        res = await fetch(`/api/image/brandbook/${clientId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: brandbook?.source || 'manual',
            structuredData: data,
          }),
        });
      }
      json = await res.json();
      if (!json.success) throw new Error(json.error || 'falha ao salvar');
      setLastSaved(new Date());
      setDirty(false);
      if (!silent) notify('Brandbook salvo', 'success');
      else notify('Salvo automaticamente', 'info', 2000);
      onSaved?.(json.data);
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  const palette = data.palette || EMPTY_SCHEMA.palette;
  const typography = data.typography || EMPTY_SCHEMA.typography;

  return (
    <div className={styles.editor}>
      {/* Paleta */}
      <div className={`glass-card ${styles.section}`}>
        <div className={styles.sectionTitle}><Icon name="palette" size={12} /> Paleta de cores</div>
        <div className={styles.sectionHint}>Hex codes (ex: #ff0033). Aceita também descrições textuais.</div>
        <div className={styles.palette}>
          <ColorField label="Primária"  value={palette.primary}   onChange={v => patch({ palette: { ...palette, primary: v } })} />
          <ColorField label="Secundária" value={palette.secondary} onChange={v => patch({ palette: { ...palette, secondary: v } })} />
          <ColorField label="Accent"    value={palette.accent}    onChange={v => patch({ palette: { ...palette, accent: v } })} />
          <ColorField label="Texto"     value={palette.text}      onChange={v => patch({ palette: { ...palette, text: v } })} />
        </div>
        <div style={{ marginTop: 12 }}>
          <span className={styles.colorFieldLabel}>Neutras (lista)</span>
          <div style={{ marginTop: 6 }}>
            <TagInput
              value={Array.isArray(palette.neutral) ? palette.neutral : []}
              onChange={v => patch({ palette: { ...palette, neutral: v } })}
              placeholder="Adicione hex e tecle Enter"
            />
          </div>
        </div>
      </div>

      {/* Tipografia */}
      <div className={`glass-card ${styles.section}`}>
        <div className={styles.sectionTitle}><Icon name="edit" size={12} /> Tipografia</div>
        <div className={styles.typoRow}>
          <div>
            <span className={styles.colorFieldLabel}>Fonte primária</span>
            <input
              className="sigma-input"
              style={{ marginTop: 6 }}
              value={typography.primary_font || ''}
              onChange={e => patch({ typography: { ...typography, primary_font: e.target.value } })}
              placeholder="Ex: Inter, Helvetica"
            />
          </div>
          <div>
            <span className={styles.colorFieldLabel}>Fonte secundária</span>
            <input
              className="sigma-input"
              style={{ marginTop: 6 }}
              value={typography.secondary_font || ''}
              onChange={e => patch({ typography: { ...typography, secondary_font: e.target.value } })}
              placeholder="Ex: Playfair Display"
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <span className={styles.colorFieldLabel}>Pesos disponíveis</span>
          <div style={{ marginTop: 6 }}>
            <TagInput
              value={Array.isArray(typography.weights) ? typography.weights : []}
              onChange={v => patch({ typography: { ...typography, weights: v } })}
              placeholder="regular, bold, light..."
            />
          </div>
        </div>
      </div>

      {/* Tom + keywords */}
      <div className={`glass-card ${styles.section}`}>
        <div className={styles.sectionTitle}><Icon name="sparkles" size={12} /> Tom visual</div>
        <textarea
          className="textarea"
          rows={3}
          value={data.tone || ''}
          onChange={e => patch({ tone: e.target.value })}
          placeholder="Descreva o tom visual da marca em poucas frases (ex: 'minimalista, premium, fotografia editorial...')"
        />
        <div style={{ marginTop: 12 }}>
          <span className={styles.colorFieldLabel}>Palavras-chave de estilo</span>
          <div style={{ marginTop: 6 }}>
            <TagInput
              value={data.style_keywords || []}
              onChange={v => patch({ style_keywords: v })}
              placeholder="Adicione e tecle Enter"
            />
          </div>
        </div>
      </div>

      {/* Faça */}
      <div className={`glass-card ${styles.section}`}>
        <div className={styles.sectionTitle} style={{ color: 'var(--success)' }}><Icon name="check" size={12} /> Faça</div>
        <ListField
          kind="do"
          items={data.do || []}
          onChange={v => patch({ do: v })}
          placeholder="Ex: Sempre use fundo escuro"
        />
      </div>

      {/* Não Faça */}
      <div className={`glass-card ${styles.section}`}>
        <div className={styles.sectionTitle} style={{ color: 'var(--error)' }}><Icon name="x" size={12} /> Não Faça</div>
        <ListField
          kind="dont"
          items={data.dont || []}
          onChange={v => patch({ dont: v })}
          placeholder="Ex: Evite imagens com pessoas frontais"
        />
      </div>

      {/* Referências */}
      <div className={`glass-card ${styles.section}`}>
        <div className={styles.sectionTitle}><Icon name="image" size={12} /> Referências visuais</div>
        <ListField
          kind="ref"
          items={data.references || []}
          onChange={v => patch({ references: v })}
          placeholder="URL ou descrição (ex: estilo Apple, paleta Nike)"
        />
      </div>

      {/* Notas */}
      <div className={`glass-card ${styles.section}`}>
        <div className={styles.sectionTitle}><Icon name="terminal" size={12} /> Notas</div>
        <textarea
          className="textarea"
          rows={3}
          value={data.notes || ''}
          onChange={e => patch({ notes: e.target.value })}
          placeholder="Qualquer observação adicional sobre a identidade visual..."
        />
      </div>

      {/* Fixed Refs (sprint v1.1) */}
      {clientId && brandbook?.id && (
        <FixedRefsSection clientId={clientId} brandbookId={brandbook.id} />
      )}

      {/* Save bar */}
      <div className={styles.saveBar}>
        <span className={`${styles.saveBarLeft} ${dirty ? styles.dirty : (lastSaved ? styles.saved : '')}`}>
          {saving
            ? 'Salvando...'
            : dirty
              ? 'Alterações não salvas'
              : lastSaved
                ? `Salvo às ${lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Pronto'}
        </span>
        <button
          type="button"
          className="sigma-btn-primary"
          onClick={() => save(false)}
          disabled={saving || !dirty}
        >
          {saving ? '...' : 'Salvar agora'}
        </button>
      </div>
    </div>
  );
}
