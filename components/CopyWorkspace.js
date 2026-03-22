/**
 * components/CopyWorkspace.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal fullscreen — CopyCreator Workspace.
 * Esquerda : configuracao (estrutura, tom, modelo, complementos)
 * Direita  : tabs de chats + editor + prompt
 *
 * Props:
 *   folder: pasta selecionada (content_folders)
 *   client: cliente ja selecionado no social.js (automatico)
 *   onClose: callback para fechar
 *
 * Nota: innerHTML usado com mdToHtml que escapa HTML antes de formatar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import { useNotification } from '../context/NotificationContext';
import styles from '../assets/style/copyWorkspace.module.css';

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
  'Adicione 3 objecoes e suas respostas na secao FAQ...',
  'Crie 3 variacoes de headline para teste A/B...',
];

const KB_LABELS = {
  diagnostico: 'Diagnostico', concorrentes: 'Concorrentes',
  publico_alvo: 'Publico', avatar: 'Avatar',
  posicionamento: 'Posicionamento', oferta: 'Oferta',
};

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

export default function CopyWorkspace({ folder, client: clientProp, onClose }) {
  const { notify } = useNotification();
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);

  // ── Sessao + chats ──
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [structures, setStructures] = useState([]);
  const [history, setHistory] = useState([]);

  // ── Configuracao ──
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState({}); // { questionId: answer }
  const [toneInput, setToneInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [kbCategories, setKbCategories] = useState([]);

  // ── Editor ──
  const [outputText, setOutputText] = useState('');
  const [saved, setSaved] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [improving, setImproving] = useState(false);
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

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const clientId = clientProp?.id || null;
  const hasOutput = !!(outputText?.trim());

  // ── Lifecycle ──
  useEffect(() => { loadSession(); }, [folder.id]);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape' && !showHistory) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, showHistory]);

  useEffect(() => {
    const id = setInterval(() => {
      setPhVisible(false);
      setTimeout(() => { setPlaceholderIdx(p => (p + 1) % PROMPT_PLACEHOLDERS.length); setPhVisible(true); }, 300);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // ── Carregar KB do cliente ──
  useEffect(() => {
    if (clientId) loadKbPreview(clientId);
  }, [clientId]);

  // ── Data loading ──
  async function loadSession() {
    setLoading(true);
    try {
      let url = '/api/copy/session?folderId=' + folder.id;
      if (clientId) url += '&clientId=' + clientId;
      const r = await fetch(url);
      const d = await r.json();
      if (d.success) {
        setSessions(d.data.sessions);
        setStructures(d.data.structures);
        const active = d.data.active;
        if (active) {
          setActiveSessionId(active.id);
          restoreSession(active);
          if (active.id) {
            const hist = d.data.history || [];
            setHistory(hist);
          }
        }
      }
    } catch (err) {
      console.error('[ERRO][CopyWorkspace] Falha ao carregar sessao', err);
      notify('Erro ao carregar workspace', 'error');
    } finally { setLoading(false); }
  }

  function restoreSession(s) {
    if (s.structure_id) setSelectedStructureId(s.structure_id);
    if (s.tone) setToneInput(s.tone);
    if (s.model_used) setSelectedModel(s.model_used);
    if (s.output_text) {
      setOutputText(s.output_text);
      setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = mdToHtml(s.output_text); }, 0);
    } else {
      setOutputText('');
      setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = ''; }, 0);
    }
    setSaved(s.status === 'saved');
    setHistoryDraftLabel(null);
    setPromptInput('');
    // Restaura respostas de perguntas se existirem na metadata
    setQuestionAnswers(s.metadata?.questionAnswers || {});
  }

  function handleSelectStructure(structId) {
    if (selectedStructureId === structId) {
      setSelectedStructureId('');
      setQuestionAnswers({});
    } else {
      setSelectedStructureId(structId);
      setQuestionAnswers({}); // Limpa respostas ao trocar de estrutura
    }
  }

  async function switchChat(sessionId) {
    setActiveSessionId(sessionId);
    const s = sessions.find(x => x.id === sessionId);
    if (s) restoreSession(s);
    // Recarrega historico deste chat especifico via activeId
    try {
      const r = await fetch('/api/copy/session?folderId=' + folder.id + '&activeId=' + sessionId + (clientId ? '&clientId=' + clientId : ''));
      const d = await r.json();
      if (d.success) {
        setSessions(d.data.sessions);
        setHistory(d.data.history || []);
      }
    } catch {}
  }

  async function createNewChat() {
    try {
      const r = await fetch('/api/copy/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folder.id, clientId }),
      });
      const d = await r.json();
      if (d.success) {
        setSessions(prev => [...prev, d.data]);
        setActiveSessionId(d.data.id);
        restoreSession(d.data);
        setHistory([]);
        notify('Novo chat criado', 'success');
      }
    } catch { notify('Erro ao criar chat', 'error'); }
  }

  async function loadKbPreview(cId) {
    try {
      const r = await fetch('/api/agentes/knowledge?clientId=' + cId);
      const d = await r.json();
      if (d.success && d.data) {
        setKbCategories(Object.keys(d.data).filter(k => d.data[k] && Object.keys(d.data[k]).length > 0));
      } else { setKbCategories([]); }
    } catch { setKbCategories([]); }
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
    if (!activeSessionId) return;
    try {
      await fetch('/api/copy/session?sessionId=' + activeSessionId, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_text: editorRef.current?.innerText || '', status: 'saved', tone: toneInput, structure_id: selectedStructureId || null, model_used: selectedModel, metadata: { questionAnswers } }),
      });
      setSaved(true);
      setHistoryDraftLabel(null);
      notify('Salvo', 'success');
    } catch { notify('Erro ao salvar', 'error'); }
  }

  async function handleImproveText() {
    const fullText = editorRef.current?.innerText?.trim();
    if (!fullText) { notify('Nenhum texto para melhorar', 'warning'); return; }
    setImproving(true);
    try {
      const r = await fetch('/api/agentes/improve-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText, mode: 'full' }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      if (editorRef.current) { editorRef.current.innerHTML = mdToHtml(d.data.text); }
      setOutputText(d.data.text);
      setSaved(false);
      notify('Texto refinado pelo assistente', 'success');
    } catch { notify('Falha ao melhorar texto', 'error'); }
    finally { setImproving(false); }
  }

  // ── Gerar / Modificar ──
  async function handleGenerate() {
    if (!promptInput.trim() || generating || !activeSessionId) return;
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

      // Monta prompt final com respostas das perguntas-chave
      let finalPrompt = promptInput.trim();
      const selectedStruct = structures.find(s => s.id === selectedStructureId);
      if (selectedStruct?.questions?.length && Object.keys(questionAnswers).length > 0) {
        const answersBlock = selectedStruct.questions
          .filter(q => questionAnswers[q.id]?.trim())
          .map(q => `${q.label}: ${questionAnswers[q.id].trim()}`)
          .join('\n');
        if (answersBlock) {
          finalPrompt = `${finalPrompt}\n\nINFORMACOES ADICIONAIS (perguntas-chave):\n${answersBlock}`;
        }
      }

      const endpoint = hasOutput ? '/api/copy/improve' : '/api/copy/generate';
      const body = hasOutput
        ? { sessionId: activeSessionId, currentOutput: editorRef.current.innerText, instruction: finalPrompt, clientId, modelOverride: selectedModel, ...(imagesB64.length ? { images: imagesB64 } : {}), ...(filesB64.length ? { files: filesB64 } : {}) }
        : { sessionId: activeSessionId, contentId: folder.id, clientId, structureId: selectedStructureId || undefined, modelOverride: selectedModel, promptRaiz: finalPrompt, tone: toneInput || undefined, ...(imagesB64.length ? { images: imagesB64 } : {}), ...(filesB64.length ? { files: filesB64 } : {}) };

      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);

      setOutputText(d.data.text);
      if (editorRef.current) { editorRef.current.innerHTML = mdToHtml(d.data.text); editorRef.current.scrollTop = 0; }
      setPromptInput('');
      setSaved(false);
      notify('Copy gerada — revise e salve quando estiver pronto', 'success');
    } catch (err) {
      notify(err.message?.includes('Limite') ? err.message : 'Falha ao gerar copy. Verifique o prompt e tente novamente.', 'error');
    } finally { setGenerating(false); }
  }

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

  // ── Loading ──
  if (loading) {
    return (
      <div className={styles.backdrop}>
        <div className={styles.modal}>
          <div className={styles.emptyState}><div className={styles.spinner} /><div className={styles.emptyDesc}>Carregando workspace...</div></div>
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

            {/* Bloco 1: Cliente (automatico — read-only) */}
            {clientProp && (
              <div className={styles.sidebarBlock}>
                <div className={styles.sectionLabelRed}>BASE DE DADOS</div>
                <div className={styles.sectionHint}>Contexto injetado automaticamente</div>
                <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,0,51,0.03)', border: '1px solid rgba(255,0,51,0.08)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{clientProp.company_name}</div>
                  {clientProp.niche && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)' }}>{clientProp.niche}</div>}
                </div>
                {kbCategories.length > 0 && (
                  <div className={styles.kbBadges}>
                    {Object.keys(KB_LABELS).map(cat => (
                      <span key={cat} className={kbCategories.includes(cat) ? styles.kbBadgeOn : styles.kbBadgeOff}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
                        {KB_LABELS[cat]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bloco 2: Estrutura */}
            <div className={styles.sidebarBlock}>
              <div className={styles.sectionLabel}>ESTRUTURA</div>
              <div className={styles.sectionHint}>Define o formato e as secoes da copy</div>
              <div className={styles.structGrid}>
                {structures.map(s => (
                  <div key={s.id} className={selectedStructureId === s.id ? styles.structCardActive : styles.structCard} onClick={() => handleSelectStructure(s.id)}>
                    <div className={styles.structName}>{s.name}</div>
                    <div className={styles.structDesc}>{s.description}</div>
                  </div>
                ))}
              </div>
              {selectedStructureId && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--brand-300)', marginTop: 2 }}>
                  Ativa: {structures.find(s => s.id === selectedStructureId)?.name}
                </div>
              )}
              {/* Perguntas-chave da estrutura selecionada */}
              {selectedStructureId && (() => {
                const struct = structures.find(s => s.id === selectedStructureId);
                const qs = struct?.questions || [];
                if (qs.length === 0) return null;
                return (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', fontWeight: 600, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Perguntas-chave</div>
                    {qs.map(q => (
                      <div key={q.id}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                          {q.label}{q.required && <span style={{ color: 'var(--error)', marginLeft: 2 }}>*</span>}
                        </div>
                        <input
                          className={styles.selectWrap}
                          type="text"
                          value={questionAnswers[q.id] || ''}
                          onChange={e => setQuestionAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder={q.placeholder || ''}
                          style={{ fontSize: '0.58rem' }}
                        />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Bloco 3: Configuracoes */}
            <div className={styles.sidebarBlock}>
              <div className={styles.sectionLabel}>CONFIGURACOES</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginBottom: 4 }}>Tom de comunicacao</div>
              <input
                className={styles.selectWrap}
                type="text"
                value={toneInput}
                onChange={e => setToneInput(e.target.value)}
                placeholder="Ex: direto, informal, tecnico, descontraido..."
                style={{ marginBottom: 8 }}
              />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginBottom: 4 }}>Agente de IA</div>
              <select className={styles.selectWrap} value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            {/* Bloco 4: Complementos */}
            <div className={styles.sidebarBlock}>
              <div className={styles.sectionLabel}>COMPLEMENTOS</div>
              <div className={styles.sectionHint}>Mencione &quot;use os arquivos&quot; no prompt</div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginBottom: 4 }}>Imagens (max 10)</div>
                <input ref={imageInputRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); const v = f.filter(x => /\.(png|jpe?g|webp)$/i.test(x.name)); setUploadedImages(p => [...p, ...v.slice(0, 10 - p.length).map(x => ({ name: x.name, file: x, preview: URL.createObjectURL(x) }))]); e.target.value = ''; }} />
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
                <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); const v = f.filter(x => /\.(pdf|docx?|txt)$/i.test(x.name)); setUploadedDocs(p => [...p, ...v.slice(0, 5 - p.length).map(x => ({ name: x.name, size: x.size, file: x }))]); e.target.value = ''; }} />
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

            {/* Chat tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, padding: '0 12px', overflowX: 'auto' }}>
              {sessions.map(s => (
                <button key={s.id} onClick={() => switchChat(s.id)} style={{
                  padding: '8px 14px', border: 'none', cursor: 'pointer', background: 'transparent',
                  borderBottom: s.id === activeSessionId ? '2px solid var(--action-primary)' : '2px solid transparent',
                  color: s.id === activeSessionId ? 'var(--brand-300)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, whiteSpace: 'nowrap',
                }}>{s.title}</button>
              ))}
              <button onClick={createNewChat} style={{
                padding: '8px 10px', border: 'none', cursor: 'pointer', background: 'transparent',
                color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700,
              }} title="Novo chat">+</button>
            </div>

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
                <button className={styles.toolBtnWide} onClick={handleImproveText} disabled={improving || generating} style={{ color: improving ? '#a855f7' : undefined, background: improving ? 'rgba(168,85,247,0.12)' : undefined }}>
                  {improving ? 'Melhorando...' : 'Melhorar'}
                </button>
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
                  <div className={styles.emptyDesc}>Escolha uma estrutura no painel a esquerda e descreva o que deseja no campo abaixo.</div>
                </div>
              ) : (
                <div ref={editorRef} contentEditable={!generating && !improving} suppressContentEditableWarning onInput={handleEditorInput}
                  className={`${styles.editor} ${generating ? styles.editorGenerating : ''}`}
                  data-placeholder="A copy gerada aparecera aqui..." />
              )}
              {generating && (
                <div className={styles.generatingOverlay}><div className={styles.spinner} /><div className={styles.generatingLabel}>Gerando copy...</div></div>
              )}
            </div>

            <div className={styles.divider} />

            {/* Prompt area */}
            <div className={styles.promptArea}>
              <div className={styles.promptHeader}>
                <span className={styles.promptLabel}>{hasOutput ? 'MODIFICAR COM IA' : 'GERAR COM IA'}</span>
                <span className={styles.promptHint}>Descreva o que quer.</span>
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
                {history.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>Nenhuma geracao neste chat</div>}
                {history.map(item => (
                  <div key={item.id}>
                    <div onClick={() => setViewingHistoryItem(viewingHistoryItem?.id === item.id ? null : item)} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 6, cursor: 'pointer', background: viewingHistoryItem?.id === item.id ? 'rgba(255,0,51,0.04)' : 'rgba(255,255,255,0.015)', border: '1px solid ' + (viewingHistoryItem?.id === item.id ? 'rgba(255,0,51,0.15)' : 'rgba(255,255,255,0.05)') }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'var(--text-muted)' }}>{new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', fontWeight: 600, padding: '0 4px', borderRadius: 3, background: item.action === 'generate' ? 'rgba(34,197,94,0.08)' : 'rgba(59,130,246,0.08)', color: item.action === 'generate' ? 'var(--success)' : 'var(--info)' }}>{item.action}</span>
                        {item.tokens_total && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', color: 'var(--text-muted)' }}>~{item.tokens_total} tokens</span>}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{(item.output_text || '').substring(0, 120)}</div>
                    </div>
                    {viewingHistoryItem?.id === item.id && (
                      <div style={{ padding: '10px 10px 8px', marginBottom: 8, borderRadius: '0 0 6px 6px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderTop: 'none', marginTop: -6 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', marginBottom: 8 }}>{item.output_text}</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={() => applyHistoryAsDraft(item)} className={styles.btnGenerate} style={{ fontSize: '0.58rem', padding: '5px 12px' }}>&larr; Aplicar como Rascunho</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
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
