/**
 * components/StageModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de etapa reutilizável — usado em Base de Dados e em Info Cliente.
 * Esquerda : rich-text editor (Bold · Italic · Highlight toggle · Link)
 * Direita  : painel do agente (tabs por agente, prompt, referências)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';

/* ── Constantes de agentes por etapa ── */
const AGENTS = {
  diagnosis:   [{ id: 'a1',  label: 'Agente 01 — Diagnóstico',    hint: 'Organiza e interpreta os dados do formulário' }],
  competitors: [
    { id: 'a2a', label: 'Agente 2A — Pesquisador',  hint: 'Pesquisa concorrentes e coleta dados brutos' },
    { id: 'a2b', label: 'Agente 2B — Analista',     hint: 'Analisa os dados brutos e monta o relatório' },
  ],
  audience:    [{ id: 'a3',  label: 'Agente 03 — Público-Alvo',   hint: 'Define perfis demográfico, psicográfico e comportamental' }],
  avatar:      [
    { id: 'a4a', label: 'Agente 4A — Pesquisador',  hint: 'Pesquisa dores e linguagem real do público' },
    { id: 'a4b', label: 'Agente 4B — Construtor',   hint: 'Constrói o avatar completo com base nos dados' },
  ],
  positioning: [{ id: 'a5',  label: 'Agente 05 — Posicionamento', hint: 'Posicionamento, vantagem competitiva e promessa' }],
  offer:       [
    { id: 'a6p', label: 'Agente 6P — Pesquisador',  hint: 'Pesquisa referências de oferta do mercado' },
    { id: 'a6a', label: 'Agente 6A — Anúncios',     hint: 'Gera copies para Meta, Google, TikTok' },
    { id: 'a6b', label: 'Agente 6B — Página',       hint: 'Gera copy da landing page / página de vendas' },
  ],
};

const STATUS_CFG = {
  pending:     { label: 'Pendente',     color: '#525252', bg: 'rgba(82,82,82,0.12)',   border: 'rgba(82,82,82,0.3)'   },
  in_progress: { label: 'Em andamento', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
  done:        { label: 'Concluído',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)'  },
};

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
      borderRadius: 20, background: c.bg, border: `1px solid ${c.border}`,
      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase', color: c.color,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.color }} />
      {c.label}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
      letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

/**
 * @param {object} props
 * @param {{ key, index, label, desc }} props.meta
 * @param {object|null} props.stage  — row from marketing_stages
 * @param {string} props.clientId
 * @param {function} props.onClose
 * @param {function} props.onSaved  — called with (updatedStage) after any save
 */
export default function StageModal({ meta, stage, clientId, onClose, onSaved }) {
  const editorRef  = useRef(null);
  const [agentTab, setAgentTab  ] = useState(0);
  const [refLink,  setRefLink   ] = useState('');
  const [stageStatus, setStageStatus] = useState(stage?.status || 'pending');
  const [savingN,  setSavingN   ] = useState(false);
  const [savedN,   setSavedN    ] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const agents = AGENTS[meta.key] || [];

  useEffect(() => {
    if (editorRef.current && stage?.notes) {
      editorRef.current.innerHTML = stage.notes;
    }
  }, []);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  function exec(cmd, value) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value ?? null);
  }

  function toggleHighlight() {
    editorRef.current?.focus();
    const current = document.queryCommandValue('backColor');
    const isOn = current && current !== 'transparent' && current !== 'rgba(0, 0, 0, 0)' && current !== '';
    document.execCommand('backColor', false, isOn ? 'transparent' : '#3a1515');
    setHighlighted(!isOn);
  }

  async function saveNotes() {
    const html = editorRef.current?.innerHTML || '';
    setSavingN(true);
    try {
      const res  = await fetch(`/api/clients/${clientId}/stages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_key: meta.key, notes: html }),
      });
      const json = await res.json();
      if (json.success) { setSavedN(true); onSaved?.({ ...stage, notes: html }); }
    } catch (e) { console.error(e); }
    finally { setSavingN(false); }
  }

  async function changeStatus(s) {
    setStageStatus(s);
    try {
      const res  = await fetch(`/api/clients/${clientId}/stages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_key: meta.key, status: s }),
      });
      const json = await res.json();
      if (json.success) onSaved?.({ ...stage, status: s });
    } catch (e) { console.error(e); }
  }

  const btnStyle = (active) => ({
    width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer',
    background: active ? 'rgba(255,0,51,0.12)' : 'transparent',
    color: active ? '#ff6680' : 'var(--text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700,
    transition: 'all 0.15s',
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1100, height: '88vh',
          background: 'linear-gradient(145deg, rgba(14,14,14,0.99), rgba(8,8,8,0.99))',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.15)',
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: '#ff6680', flexShrink: 0,
            }}>
              {String(meta.index).padStart(2, '0')}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {meta.label}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 1 }}>
                {meta.desc}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={stageStatus} />
            <div style={{ display: 'flex', gap: 3 }}>
              {Object.entries(STATUS_CFG).map(([s, c]) => (
                <button key={s} onClick={() => changeStatus(s)} style={{
                  padding: '3px 9px', borderRadius: 20, cursor: 'pointer',
                  border: `1px solid ${stageStatus === s ? c.border : 'rgba(255,255,255,0.06)'}`,
                  background: stageStatus === s ? c.bg : 'transparent',
                  color: stageStatus === s ? c.color : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                }}>
                  {c.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── LEFT: Rich-text notepad ── */}
          <div style={{ flex: '0 0 58%', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{
              padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Notas
              </span>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <button title="Negrito (⌘B)" style={btnStyle(false)} onClick={() => exec('bold')}>
                  <strong style={{ fontSize: '0.75rem' }}>B</strong>
                </button>
                <button title="Itálico (⌘I)" style={btnStyle(false)} onClick={() => exec('italic')}>
                  <em style={{ fontSize: '0.75rem' }}>I</em>
                </button>
                <button title="Destaque (toggle)" style={btnStyle(highlighted)} onClick={toggleHighlight}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <rect x="3" y="14" width="18" height="4" rx="1"/>
                    <path d="M7 14V6l5 3 5-3v8" fill="none" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </button>
                <button title="Inserir link" style={btnStyle(false)} onClick={() => {
                  const url = prompt('URL do link:');
                  if (url) exec('createLink', url);
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                </button>
                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.07)', margin: '0 3px' }} />
                <button onClick={saveNotes} disabled={savingN} style={{
                  padding: '3px 10px', borderRadius: 5,
                  border: savedN ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,0,51,0.2)',
                  background: savedN ? 'rgba(34,197,94,0.06)' : 'rgba(255,0,51,0.06)',
                  color: savedN ? '#22c55e' : '#ff6680',
                  fontFamily: 'var(--font-mono)', fontSize: '0.6rem', cursor: savingN ? 'not-allowed' : 'pointer',
                }}>
                  {savingN ? 'Salvando...' : savedN ? '✓ Salvo' : 'Salvar'}
                </button>
              </div>
            </div>

            {/* Editor */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => setSavedN(false)}
              data-placeholder="Escreva as notas desta etapa..."
              style={{
                flex: 1, padding: '18px 22px', outline: 'none', overflow: 'auto',
                fontFamily: 'var(--font-mono)', fontSize: '0.82rem', lineHeight: 1.8,
                color: 'var(--text-secondary)', caretColor: '#ff0033',
              }}
            />
            <style>{`
              [contenteditable][data-placeholder]:empty:before {
                content: attr(data-placeholder); color: #2a2a2a; pointer-events: none;
              }
              [contenteditable] b, [contenteditable] strong { color: var(--text-primary); font-weight: 700; }
              [contenteditable] i, [contenteditable] em { color: #ff6680; font-style: italic; }
              [contenteditable] a { color: #3b82f6; text-decoration: underline; }
              [contenteditable] span[style*="background"] { padding: 0 3px; border-radius: 2px; }
            `}</style>
          </div>

          {/* ── RIGHT: Agent panel ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {agents.length > 1 && (
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0 14px', flexShrink: 0, gap: 2 }}>
                {agents.map((ag, i) => (
                  <button key={ag.id} onClick={() => setAgentTab(i)} style={{
                    padding: '10px 12px', border: 'none', cursor: 'pointer', background: 'transparent',
                    borderBottom: agentTab === i ? '2px solid #ff0033' : '2px solid transparent',
                    color: agentTab === i ? '#ff6680' : 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}>
                    {ag.label}
                  </button>
                ))}
              </div>
            )}

            {agents.length === 1 && (
              <div style={{ padding: '10px 18px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {agents[0]?.label}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {agents[0]?.hint}
                </div>
              </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {agents.length > 1 && agents[agentTab] && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)' }}>
                  {agents[agentTab].hint}
                </div>
              )}

              <div>
                <SectionLabel>Prompt do Agente</SectionLabel>
                <textarea
                  placeholder="O prompt template será carregado aqui automaticamente..."
                  rows={8}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                    background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8, color: 'var(--text-secondary)', fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)', lineHeight: 1.7, outline: 'none', resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <SectionLabel>Referência — Link</SectionLabel>
                <input
                  type="url" placeholder="https://..."
                  value={refLink} onChange={e => setRefLink(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '8px 12px',
                    background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8, color: 'var(--text-secondary)', fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)', outline: 'none',
                  }}
                />
              </div>

              <div>
                <SectionLabel>Referências — Imagens / Arquivos</SectionLabel>
                <div style={{
                  border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8, padding: '18px',
                  textAlign: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.01)',
                }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'var(--text-muted)' }}>
                    Arraste arquivos ou clique para selecionar
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: '#2a2a2a', marginTop: 3 }}>
                    PNG · JPG · PDF · DOCX
                  </div>
                </div>
              </div>

              <button disabled style={{
                width: '100%', padding: '10px', borderRadius: 8, marginTop: 'auto',
                background: 'rgba(255,0,51,0.04)', border: '1px solid rgba(255,0,51,0.12)',
                color: 'rgba(255,102,128,0.35)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                fontWeight: 600, letterSpacing: '0.04em', cursor: 'not-allowed',
              }}>
                Executar Agente — em breve
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
