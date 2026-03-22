/**
 * components/CopyWorkspace.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal fullscreen — CopyCreator Workspace.
 * Esquerda : configuracao (base de dados, estrutura, tom, complementos)
 * Direita  : editor de output + area de prompt para gerar/modificar com IA
 *
 * Nota: innerHTML usado com mdToHtml que escapa HTML antes de formatar —
 * mesmo padrao do StageModal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotification } from '../context/NotificationContext';
import styles from '../assets/style/copyWorkspace.module.css';

const TONES = ['Direto', 'Formal', 'Descontraido', 'Provocativo', 'Inspiracional'];

const MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (Recomendado)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini (Rapido)' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (Maximo)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet (Equilibrado)' },
];

const PROMPT_PLACEHOLDERS = [
  'Crie uma copy direta focada no beneficio principal...',
  'Reescreva com mais urgencia e escassez...',
  'Adapte o tom para um publico mais jovem...',
  'Use os arquivos enviados para enriquecer o contexto...',
  'Adicione 3 objecoes e suas respostas na secao FAQ...',
  'Crie 3 variacoes de headline para teste A/B...',
];

const KB_LABELS = {
  diagnostico: 'Diagnostico', concorrentes: 'Concorrentes',
  publico_alvo: 'Publico', avatar: 'Avatar',
  posicionamento: 'Posicionamento', oferta: 'Oferta',
};

/** Escapa HTML e converte markdown basico — mesmo padrao do StageModal */
function mdToHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '&bull; $1')
    .replace(/\n/g, '<br>');
}

export default function CopyWorkspace({ folder, client: clientProp, account, onClose }) {
  const { notify } = useNotification();
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);

  // ── Estado da sessao ──
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [structures, setStructures] = useState([]);
  const [history, setHistory] = useState([]);
  const [clients, setClients] = useState([]);

  // ── Configuracao (coluna esquerda) ──
  const [kbMode, setKbMode] = useState('existing');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [selectedTone, setSelectedTone] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [kbCategories, setKbCategories] = useState([]);

  // ── Editor (coluna direita) ──
  const [outputText, setOutputText] = useState('');
  const [saved, setSaved] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [phVisible, setPhVisible] = useState(true);
  const [historyDraftLabel, setHistoryDraftLabel] = useState(null);

  // ── Complementos ──
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploadedDocs, setUploadedDocs] = useState([]);

  // ── Popups ──
  const [showHistory, setShowHistory] = useState(false);
  const [viewingHistoryItem, setViewingHistoryItem] = useState(null);
  const [showStructuresModal, setShowStructuresModal] = useState(false);

  // ── Lifecycle ──
  useEffect(() => { loadSession(); }, [folder.id]);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape' && !showHistory && !showStructuresModal) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, showHistory, showStructuresModal]);

  useEffect(() => {
    const id = setInterval(() => {
      setPhVisible(false);
      setTimeout(() => { setPlaceholderIdx(p => (p + 1) % PROMPT_PLACEHOLDERS.length); setPhVisible(true); }, 300);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // ── Data loading ──
  async function loadSession() {
    setLoading(true);
    try {
      const r = await fetch('/api/copy/session?contentId=' + folder.id);
      const d = await r.json();
      if (d.success) {
        setSession(d.data.session);
        setStructures(d.data.structures);
        setHistory(d.data.history);
        setClients(d.data.clients);
        const s = d.data.session;
        // Pre-seleciona cliente: da sessao salva OU da prop passada pelo social.js
        if (s.client_id) {
          setSelectedClientId(s.client_id); setKbMode('existing');
        } else if (clientProp?.id) {
          setSelectedClientId(clientProp.id); setKbMode('existing');
        }
        if (s.structure_id) setSelectedStructureId(s.structure_id);
        if (s.tone) setSelectedTone(s.tone);
        if (s.model_used) setSelectedModel(s.model_used);
        if (s.output_text) {
          setOutputText(s.output_text);
          setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = mdToHtml(s.output_text); }, 0);
        }
        setSaved(s.status === 'saved');
        // Carrega preview da KB do cliente selecionado
        const activeClientId = s.client_id || clientProp?.id;
        if (activeClientId) loadKbPreview(activeClientId);
      }
    } catch (err) {
      console.error('[ERRO][CopyWorkspace] Falha ao carregar sessao', err);
      notify('Erro ao carregar workspace', 'error');
    } finally { setLoading(false); }
  }

  async function loadKbPreview(clientId) {
    try {
      const r = await fetch('/api/agentes/knowledge?clientId=' + clientId);
      const d = await r.json();
      if (d.success && d.data) {
        const cats = Object.keys(d.data).filter(k => d.data[k] && Object.keys(d.data[k]).length > 0);
        setKbCategories(cats);
      } else { setKbCategories([]); }
    } catch { setKbCategories([]); }
  }

  function handleClientChange(cId) {
    setSelectedClientId(cId);
    if (cId) loadKbPreview(cId);
    else setKbCategories([]);
  }

  // ── Editor actions ──
  function handleEditorInput() { setSaved(false); setHistoryDraftLabel(null); }
  function execCmd(cmd) { editorRef.current?.focus(); document.execCommand(cmd, false, null); }

  async function handleCopy() {
    const text = editorRef.current?.innerText || '';
    if (!text.trim()) { notify('Editor vazio', 'warning'); return; }
    try { await navigator.clipboard.writeText(text); notify('Texto copiado', 'success'); } catch { notify('Erro ao copiar', 'error'); }
  }

  async function handleSave() {
    if (!session) return;
    try {
      await fetch('/api/copy/session?sessionId=' + session.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_text: editorRef.current?.innerText || '', status: 'saved' }),
      });
      setSaved(true);
      setHistoryDraftLabel(null);
      notify('Salvo', 'success');
    } catch { notify('Erro ao salvar', 'error'); }
  }

  // ── Gerar / Modificar ──
  async function handleGenerate() {
    if (!promptInput.trim() || generating || !session) return;
    setGenerating(true);
    try {
      const imagesB64 = [];
      for (const img of uploadedImages) {
        const b64 = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(img.file); });
        imagesB64.push({ base64: b64, mimeType: img.file.type });
      }
      const filesB64 = [];
      for (const doc of uploadedDocs) {
        const b64 = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(doc.file); });
        filesB64.push({ base64: b64, mimeType: doc.file.type, fileName: doc.name });
      }

      const hasOutput = !!(editorRef.current?.innerText?.trim());
      const endpoint = hasOutput ? '/api/copy/improve' : '/api/copy/generate';

      const body = hasOutput
        ? { sessionId: session.id, currentOutput: editorRef.current.innerText, instruction: promptInput.trim(), clientId: selectedClientId || undefined, modelOverride: selectedModel, ...(imagesB64.length ? { images: imagesB64 } : {}), ...(filesB64.length ? { files: filesB64 } : {}) }
        : { sessionId: session.id, contentId: folder.id, clientId: selectedClientId || undefined, structureId: selectedStructureId || undefined, modelOverride: selectedModel, promptRaiz: promptInput.trim(), tone: selectedTone || undefined, ...(imagesB64.length ? { images: imagesB64 } : {}), ...(filesB64.length ? { files: filesB64 } : {}) };

      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);

      const newText = d.data.text;
      setOutputText(newText);
      if (editorRef.current) { editorRef.current.innerHTML = mdToHtml(newText); editorRef.current.scrollTop = 0; }
      setPromptInput('');
      setSaved(false);
      // Reload history
      try { const hr = await fetch('/api/copy/session?contentId=' + folder.id); const hd = await hr.json(); if (hd.success) setHistory(hd.data.history); } catch {}
      notify('Copy gerada — revise e salve quando estiver pronto', 'success');
    } catch (err) {
      notify(err.message?.includes('Limite') ? err.message : 'Falha ao gerar copy. Verifique o prompt e tente novamente.', 'error');
    } finally { setGenerating(false); }
  }

  // ── Historico ──
  function applyHistoryAsDraft(item) {
    if (!item || !editorRef.current) return;
    editorRef.current.innerHTML = mdToHtml(item.output_text || '');
    const dateLabel = new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    setHistoryDraftLabel(dateLabel);
    setOutputText(item.output_text);
    setSaved(false);
    setViewingHistoryItem(null);
    setShowHistory(false);
    notify('Rascunho carregado do historico — clique em Salvar para confirmar', 'info');
  }

  const hasOutput = !!(outputText?.trim());

  // ── Loading state ──
  if (loading) {
    return (
      <div className={styles.backdrop}>
        <div className={styles.modal}>
          <div className={styles.emptyState}>
            <div className={styles.spinner} />
            <div className={styles.emptyDesc}>Carregando workspace...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        {/* ── HEADER ── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.badge}>COPY CREATOR</span>
            <span className={styles.folderName}>{folder.name}</span>
            {clientProp && <span className={styles.accountBadge}>{clientProp.company_name}</span>}
          </div>
          <button className={styles.btnClose} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        {/* ── BODY ── */}
        <div className={styles.body}>

          {/* ══ COLUNA ESQUERDA ══ */}
          <div className={styles.sidebar}>

            {/* Bloco 1: Base de Dados */}
            <div className={styles.sidebarBlock}>
              <div className={styles.sectionLabelRed}>BASE DE DADOS</div>
              <div className={styles.sectionHint}>Contexto injetado automaticamente na geracao</div>
              <div className={styles.pillGroup}>
                <button className={kbMode === 'existing' ? styles.pillActive : styles.pill} onClick={() => setKbMode('existing')}>Base Existente</button>
                <button className={kbMode === 'none' ? styles.pillActive : styles.pill} onClick={() => { setKbMode('none'); setSelectedClientId(''); setKbCategories([]); }}>Nenhuma</button>
              </div>
              {kbMode === 'existing' && (
                <>
                  <select className={styles.selectWrap} value={selectedClientId} onChange={e => handleClientChange(e.target.value)}>
                    <option value="">Selecione o cliente...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}{c.niche ? ' — ' + c.niche : ''}</option>)}
                  </select>
                  {clients.length === 0 && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                      Nenhuma base disponivel. Complete o formulario e execute o pipeline de um cliente primeiro.
                    </div>
                  )}
                  {selectedClientId && (
                    <div className={styles.kbBadges}>
                      {Object.keys(KB_LABELS).map(cat => (
                        <span key={cat} className={kbCategories.includes(cat) ? styles.kbBadgeOn : styles.kbBadgeOff}>
                          <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
                          {KB_LABELS[cat]}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bloco 2: Estrutura */}
            <div className={styles.sidebarBlock}>
              <div className={styles.sectionLabel}>ESTRUTURA</div>
              <div className={styles.sectionHint}>Define o formato e as secoes da copy</div>
              <div className={styles.structGrid}>
                {structures.map(s => (
                  <div key={s.id} className={selectedStructureId === s.id ? styles.structCardActive : styles.structCard} onClick={() => setSelectedStructureId(selectedStructureId === s.id ? '' : s.id)}>
                    <div className={styles.structName}>{s.name}</div>
                    <div className={styles.structDesc}>{s.description}</div>
                  </div>
                ))}
              </div>
              {selectedStructureId && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--brand-300)', marginTop: 2 }}>
                  Estrutura ativa: {structures.find(s => s.id === selectedStructureId)?.name}
                </div>
              )}
              <button onClick={() => setShowStructuresModal(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', textAlign: 'left', padding: 0, marginTop: 2 }}>
                Gerenciar Estruturas &rarr;
              </button>
            </div>

            {/* Bloco 3: Configuracoes */}
            <div className={styles.sidebarBlock}>
              <div className={styles.sectionLabel}>CONFIGURACOES</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginBottom: 4 }}>Tom de comunicacao</div>
              <div className={styles.pillGroup}>
                {TONES.map(t => (
                  <button key={t} className={selectedTone === t ? styles.pillActive : styles.pill} onClick={() => setSelectedTone(selectedTone === t ? '' : t)}>{t}</button>
                ))}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginBottom: 4, marginTop: 8 }}>Agente de IA</div>
              <select className={styles.selectWrap} value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            {/* Bloco 4: Complementos */}
            <div className={styles.sidebarBlock}>
              <div className={styles.sectionLabel}>COMPLEMENTOS</div>
              <div className={styles.sectionHint}>Mencione &quot;use os arquivos&quot; no prompt para inclui-los</div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginBottom: 4 }}>Imagens (max 10)</div>
                <input ref={imageInputRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); const v = f.filter(x => /\.(png|jpe?g|webp)$/i.test(x.name)); const r = 10 - uploadedImages.length; setUploadedImages(p => [...p, ...v.slice(0, r).map(x => ({ name: x.name, file: x, preview: URL.createObjectURL(x) }))]); e.target.value = ''; }} />
                <div className={styles.uploadZone} onClick={() => imageInputRef.current?.click()}>+ Imagens</div>
                {uploadedImages.length > 0 && (
                  <div className={styles.thumbGrid}>
                    {uploadedImages.map((img, i) => (
                      <div key={i} className={styles.thumb}>
                        <img src={img.preview} alt="" className={styles.thumbImg} />
                        <button className={styles.thumbX} onClick={() => { URL.revokeObjectURL(img.preview); setUploadedImages(p => p.filter((_, j) => j !== i)); }}>
                          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginBottom: 4 }}>Documentos (max 5)</div>
                <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); const v = f.filter(x => /\.(pdf|docx?|txt)$/i.test(x.name)); const r = 5 - uploadedDocs.length; setUploadedDocs(p => [...p, ...v.slice(0, r).map(x => ({ name: x.name, size: x.size, file: x }))]); e.target.value = ''; }} />
                <div className={styles.uploadZone} onClick={() => docInputRef.current?.click()}>+ Docs</div>
                {uploadedDocs.length > 0 && (
                  <div className={styles.docList}>
                    {uploadedDocs.map((f, i) => (
                      <div key={i} className={styles.docItem}>
                        <span className={styles.docName}>{f.name}</span>
                        <button className={styles.docX} onClick={() => setUploadedDocs(p => p.filter((_, j) => j !== i))}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══ COLUNA DIREITA ══ */}
          <div className={styles.main}>
            {/* Toolbar */}
            <div className={styles.toolbar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={styles.toolbarLabel}>OUTPUT</span>
                <span className={saved ? styles.statusSaved : styles.statusDraft}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
                  {saved ? 'Salvo' : 'Rascunho'}
                </span>
              </div>
              <div className={styles.toolbarBtns}>
                <button className={styles.toolBtn} title="Negrito" onClick={() => execCmd('bold')}><strong style={{ fontSize: '0.75rem' }}>B</strong></button>
                <button className={styles.toolBtn} title="Italico" onClick={() => execCmd('italic')}><em style={{ fontSize: '0.75rem' }}>I</em></button>
                <div className={styles.toolDivider} />
                <button className={styles.toolBtnWide} onClick={handleCopy}>Copiar</button>
                <button className={styles.toolBtnWide} onClick={handleSave}>Salvar</button>
                <div className={styles.toolDivider} />
                <button className={styles.toolBtnWide} onClick={() => setShowHistory(true)}>Historico</button>
              </div>
            </div>

            {/* Editor */}
            <div className={styles.editorWrap}>
              {historyDraftLabel && <div className={styles.historyDraftBadge}>Rascunho do historico &mdash; {historyDraftLabel} &mdash; nao salvo</div>}
              {!hasOutput && !generating ? (
                <div className={styles.emptyState}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--brand-300)" strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <div className={styles.emptyTitle}>Configure a estrutura e gere sua copy</div>
                  <div className={styles.emptyDesc}>Use o painel a esquerda para configurar o contexto, escolha uma estrutura e clique em Gerar.</div>
                </div>
              ) : (
                <div ref={editorRef} contentEditable={!generating} suppressContentEditableWarning onInput={handleEditorInput}
                  className={`${styles.editor} ${generating ? styles.editorGenerating : ''}`}
                  data-placeholder="A copy gerada aparecera aqui..." />
              )}
              {generating && (
                <div className={styles.generatingOverlay}>
                  <div className={styles.spinner} />
                  <div className={styles.generatingLabel}>Gerando copy...</div>
                </div>
              )}
            </div>

            <div className={styles.divider} />

            {/* Prompt area */}
            <div className={styles.promptArea}>
              <div className={styles.promptHeader}>
                <span className={styles.promptLabel}>{hasOutput ? 'MODIFICAR COM IA' : 'GERAR COM IA'}</span>
                <span className={styles.promptHint}>Descreva o que quer. Se ja tiver output, peca modificacoes.</span>
              </div>
              <textarea className={styles.promptTextarea} value={promptInput} onChange={e => setPromptInput(e.target.value.slice(0, 10000))}
                placeholder={phVisible ? PROMPT_PLACEHOLDERS[placeholderIdx] : ''}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }} />
              <div className={styles.promptFooter}>
                <span className={styles.charCount}>{promptInput.length > 0 ? promptInput.length.toLocaleString() + ' chars' : ''}</span>
                <button className={styles.btnGenerate} onClick={handleGenerate} disabled={!promptInput.trim() || generating}>
                  {generating ? (
                    <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Gerando...</>
                  ) : hasOutput ? '\u2192 Aplicar' : '\u203A Gerar'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── POPUP HISTORICO ── */}
        {showHistory && (
          <div onClick={() => { setShowHistory(false); setViewingHistoryItem(null); }} style={{ position: 'absolute', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 700, maxHeight: '80vh', background: 'linear-gradient(145deg, rgba(14,14,14,0.99), rgba(8,8,8,0.99))', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Historico de Geracoes</div>
                <button onClick={() => { setShowHistory(false); setViewingHistoryItem(null); }} className={styles.btnClose}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
                {history.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>Nenhuma geracao ainda</div>}
                {history.map(item => (
                  <div key={item.id}>
                    <div onClick={() => setViewingHistoryItem(viewingHistoryItem?.id === item.id ? null : item)} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 6, cursor: 'pointer', background: viewingHistoryItem?.id === item.id ? 'rgba(255,0,51,0.04)' : 'rgba(255,255,255,0.015)', border: '1px solid ' + (viewingHistoryItem?.id === item.id ? 'rgba(255,0,51,0.15)' : 'rgba(255,255,255,0.05)'), transition: 'all 0.15s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'var(--text-muted)' }}>{new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', fontWeight: 600, padding: '0 4px', borderRadius: 3, background: item.action === 'generate' ? 'rgba(34,197,94,0.08)' : 'rgba(59,130,246,0.08)', color: item.action === 'generate' ? 'var(--success)' : 'var(--info)' }}>{item.action}</span>
                        {item.model_used && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', color: 'var(--text-muted)' }}>{item.model_used}</span>}
                        {item.tokens_total && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', color: 'var(--text-muted)' }}>~{item.tokens_total} tokens</span>}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{(item.output_text || '').substring(0, 120)}</div>
                    </div>
                    {viewingHistoryItem?.id === item.id && (
                      <div style={{ padding: '10px 10px 8px', marginBottom: 8, borderRadius: '0 0 6px 6px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderTop: 'none', marginTop: -6 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', marginBottom: 8 }}>{item.output_text}</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={() => applyHistoryAsDraft(item)} className={styles.btnGenerate} style={{ fontSize: '0.58rem', padding: '5px 12px' }}>
                            &larr; Aplicar como Rascunho
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── POPUP GESTAO DE ESTRUTURAS ── */}
        {showStructuresModal && (
          <StructuresManager structures={structures} onClose={() => setShowStructuresModal(false)} onReload={loadSession} />
        )}

        <style>{`
          [contenteditable][data-placeholder]:empty:before { content: attr(data-placeholder); color: var(--dark-600); pointer-events: none; }
          [contenteditable] b, [contenteditable] strong { color: var(--text-primary); font-weight: 700; }
          [contenteditable] i, [contenteditable] em { color: var(--brand-300); font-style: italic; }
          [contenteditable] h1, [contenteditable] h2, [contenteditable] h3 { color: var(--text-primary); }
        `}</style>
      </div>
    </div>
  );
}

/* ── Mini-modal de gestao de estruturas ── */
function StructuresManager({ structures, onClose, onReload }) {
  const { notify } = useNotification();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', prompt_base: '', icon: 'file' });
  const [saving, setSaving] = useState(false);

  function startEdit(s) { setEditing(s.id); setForm({ name: s.name, prompt_base: s.prompt_base, icon: s.icon || 'file' }); }
  function startNew() { setEditing('new'); setForm({ name: '', prompt_base: '', icon: 'file' }); }

  async function handleSave() {
    if (!form.name.trim() || !form.prompt_base.trim()) { notify('Nome e prompt base sao obrigatorios', 'warning'); return; }
    setSaving(true);
    try {
      if (editing === 'new') {
        await fetch('/api/copy/structures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        notify('Estrutura criada', 'success');
      } else {
        await fetch('/api/copy/structures?id=' + editing, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        notify('Estrutura atualizada', 'success');
      }
      setEditing(null); onReload();
    } catch { notify('Erro ao salvar', 'error'); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(id) {
    try {
      const r = await fetch('/api/copy/structures?id=' + id, { method: 'DELETE' });
      const d = await r.json();
      if (!d.success) { notify(d.error, 'error'); return; }
      notify('Estrutura desativada', 'success'); onReload();
    } catch { notify('Erro ao desativar', 'error'); }
  }

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 450, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 600, maxHeight: '80vh', background: 'linear-gradient(145deg, rgba(14,14,14,0.99), rgba(8,8,8,0.99))', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Gerenciar Estruturas</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
          {structures.map(s => (
            <div key={s.id} style={{ padding: '10px 12px', marginBottom: 8, borderRadius: 8, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editing === s.id ? 10 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', fontWeight: 600, padding: '0 4px', borderRadius: 3, background: s.is_default ? 'rgba(59,130,246,0.08)' : 'rgba(34,197,94,0.08)', color: s.is_default ? 'var(--info)' : 'var(--success)' }}>{s.is_default ? 'PADRAO' : 'CUSTOM'}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => editing === s.id ? setEditing(null) : startEdit(s)} style={{ padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--info)', fontFamily: 'var(--font-mono)', fontSize: '0.48rem', fontWeight: 600 }}>{editing === s.id ? 'Cancelar' : 'Editar'}</button>
                  {!s.is_default && <button onClick={() => handleDeactivate(s.id)} style={{ padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,51,51,0.06)', border: '1px solid rgba(255,51,51,0.2)', color: 'var(--error)', fontFamily: 'var(--font-mono)', fontSize: '0.48rem', fontWeight: 600 }}>Desativar</button>}
                </div>
              </div>
              {editing === s.id && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'rgba(10,10,10,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', outline: 'none' }} />
                  <textarea value={form.prompt_base} onChange={e => setForm(f => ({ ...f, prompt_base: e.target.value }))} placeholder="Prompt base..." style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'rgba(10,10,10,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', outline: 'none', resize: 'vertical', minHeight: 120 }} />
                  <button onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-end', padding: '5px 14px', borderRadius: 6, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, var(--action-primary), var(--brand-600))', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, opacity: saving ? 0.5 : 1 }}>Salvar alteracoes</button>
                </div>
              )}
            </div>
          ))}
          {editing === 'new' && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,0,51,0.02)', border: '1px solid rgba(255,0,51,0.1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome da estrutura" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'rgba(10,10,10,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              <textarea value={form.prompt_base} onChange={e => setForm(f => ({ ...f, prompt_base: e.target.value }))} placeholder="Prompt base..." style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'rgba(10,10,10,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', outline: 'none', resize: 'vertical', minHeight: 120 }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button onClick={() => setEditing(null)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, var(--action-primary), var(--brand-600))', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, opacity: saving ? 0.5 : 1 }}>Criar</button>
              </div>
            </div>
          )}
        </div>
        {editing !== 'new' && (
          <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
            <button onClick={startNew} style={{ width: '100%', padding: '8px 0', borderRadius: 6, border: '1px dashed rgba(255,0,51,0.2)', background: 'rgba(255,0,51,0.03)', color: 'var(--brand-300)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer' }}>+ Nova Estrutura</button>
          </div>
        )}
      </div>
    </div>
  );
}
