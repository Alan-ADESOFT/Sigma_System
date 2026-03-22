/**
 * components/StageModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de etapa reformulado.
 * Esquerda : contexto do cliente + complementos + histórico (colapsável)
 * Direita  : editor de output + área "Modificar com IA"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotification } from '../context/NotificationContext';

const STATUS_CFG = {
  pending:     { label: 'Pendente',     color: '#525252', bg: 'rgba(82,82,82,0.12)',   border: 'rgba(82,82,82,0.3)'   },
  in_progress: { label: 'Em andamento', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
  done:        { label: 'Concluido',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)'  },
};

const PROMPT_PLACEHOLDERS = [
  'Reescreva o avatar em primeira pessoa...',
  'Adicione 3 objecoes que nao foram mencionadas...',
  'Use os arquivos que enviei para enriquecer este output...',
  'Deixe o texto mais direto e objetivo...',
  'Traduza os dados de concorrentes para insights praticos...',
  'Adicione exemplos reais para cada argumento...',
  'Reescreva usando a linguagem do avatar...',
];

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

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
      borderRadius: 20, background: c.bg, border: '1px solid ' + c.border,
      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase', color: c.color,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.color }} />
      {c.label}
    </span>
  );
}

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

export default function StageModal({ meta, stage, clientId, clientData, onClose, onSaved }) {
  const { notify } = useNotification();
  const editorRef = useRef(null);

  const [stageStatus, setStageStatus] = useState(stage?.status || 'pending');
  const [savingN, setSavingN]         = useState(false);
  const [savedN, setSavedN]           = useState(false);
  const [highlighted, setHighlighted] = useState(false);

  const [promptInput, setPromptInput]      = useState('');
  const [applying, setApplying]            = useState(false);
  const [chatHistory, setChatHistory]      = useState([]); // { role, content }[]
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [phVisible, setPhVisible]          = useState(true);

  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploadedDocs, setUploadedDocs]     = useState([]);
  const imageInputRef = useRef(null);
  const docInputRef   = useRef(null);

  const [showHistory, setShowHistory]       = useState(false);
  const [historyTab, setHistoryTab]         = useState('history');
  const [historyData, setHistoryData]       = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [versionsData, setVersionsData]     = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [viewingHistoryItem, setViewingHistoryItem] = useState(null);
  const [historyDraftLabel, setHistoryDraftLabel]   = useState(null);
  const [compareVersion, setCompareVersion] = useState(null);

  const [improving, setImproving]           = useState(false);

  useEffect(() => {
    if (editorRef.current && stage?.notes) editorRef.current.innerHTML = stage.notes;
  }, []);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    const id = setInterval(() => {
      setPhVisible(false);
      setTimeout(() => { setPlaceholderIdx(p => (p + 1) % PROMPT_PLACEHOLDERS.length); setPhVisible(true); }, 300);
    }, 4000);
    return () => clearInterval(id);
  }, []);


  function execCmd(cmd) { editorRef.current?.focus(); document.execCommand(cmd, false, null); }
  function handleEditorInput() { setSavedN(false); }

  function toggleHighlight() {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { notify('Selecione um texto para destacar', 'warning'); return; }
    const parent = sel.anchorNode?.parentElement;
    const hasBg = parent?.style?.backgroundColor && parent.style.backgroundColor !== 'transparent' && parent.style.backgroundColor !== '';
    document.execCommand('removeFormat', false, null);
    if (!hasBg) document.execCommand('hiliteColor', false, '#3a1515');
  }

  async function saveNotes(statusOverride) {
    const html = editorRef.current?.innerHTML || '';
    setSavingN(true);
    try {
      const payload = { stage_key: meta.key, notes: html };
      if (statusOverride) payload.status = statusOverride;
      const res = await fetch('/api/clients/' + clientId + '/stages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.success) {
        setSavedN(true);
        setHistoryDraftLabel(null);
        if (statusOverride) setStageStatus(statusOverride);
        onSaved?.({ ...stage, notes: html, ...(statusOverride ? { status: statusOverride } : {}) });
        if (statusOverride === 'done') {
          // Versao: salva snapshot ao concluir
          fetch('/api/clients/' + clientId + '/stages/save-version', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stageKey: meta.key, content: editorRef.current?.innerText || '' }) }).catch(() => {});
          notify('Etapa concluida!', 'success');
        } else if (statusOverride === 'in_progress') {
          // Historico: salva snapshot ao salvar rascunho
          fetch('/api/clients/' + clientId + '/stages/save-version', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stageKey: meta.key, content: editorRef.current?.innerText || '', createdBy: 'rascunho' }) }).catch(() => {});
          notify('Rascunho salvo!', 'success');
        } else {
          notify('Notas salvas', 'success');
        }
      }
    } catch { notify('Erro ao salvar', 'error'); }
    finally { setSavingN(false); }
  }

  async function changeStatus(s) {
    setStageStatus(s);
    try {
      await fetch('/api/clients/' + clientId + '/stages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage_key: meta.key, status: s }) });
      onSaved?.({ ...stage, status: s });
    } catch { notify('Erro ao alterar status', 'error'); }
  }

  async function handleCopy() {
    const text = editorRef.current?.innerText || '';
    if (!text.trim()) { notify('O editor esta vazio — gere ou escreva um conteudo primeiro', 'warning'); return; }
    try { await navigator.clipboard.writeText(text); notify('Texto copiado', 'success'); } catch { notify('Erro ao copiar', 'error'); }
  }


  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try { const r = await fetch('/api/agentes/history?type=agent&stageKey=' + meta.key + '&limit=10'); const d = await r.json(); setHistoryData(d.success ? d.data : []); } catch {} finally { setLoadingHistory(false); }
  }, [meta?.key]);

  useEffect(() => { if (showHistory && historyTab === 'history') loadHistory(); }, [showHistory, historyTab, loadHistory]);

  function applyHistoryAsDraft(item) {
    if (!item || !editorRef.current) return;
    // mdToHtml escapa HTML antes de formatar — mesmo padrão usado no restante do componente
    editorRef.current.innerHTML = mdToHtml(item.response_text || '');
    const dateLabel = new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    setHistoryDraftLabel(dateLabel);
    setSavedN(false);
    setViewingHistoryItem(null);
    setShowHistory(false);
    notify('Rascunho carregado do historico de ' + dateLabel + '. Clique em Salvar para confirmar.', 'info');
  }

  const loadVersions = useCallback(async () => {
    setLoadingVersions(true);
    try { const r = await fetch('/api/clients/' + clientId + '/kb-versions?stageKey=' + meta.key); const d = await r.json(); if (d.success) setVersionsData(d.data || []); } catch {} finally { setLoadingVersions(false); }
  }, [clientId, meta?.key]);

  async function handleRestoreVersion(version) {
    try {
      const r = await fetch('/api/clients/' + clientId + '/kb-versions?stageKey=' + meta.key + '&version=' + version);
      const d = await r.json();
      if (d.success && d.data?.text && editorRef.current) { editorRef.current.innerHTML = mdToHtml(d.data.text); setSavedN(false); setCompareVersion(null); setShowHistory(false); notify('Versao ' + version + ' restaurada', 'success'); }
    } catch { notify('Erro ao restaurar', 'error'); }
  }

  async function handleViewVersion(version) {
    try { const r = await fetch('/api/clients/' + clientId + '/kb-versions?stageKey=' + meta.key + '&version=' + version); const d = await r.json(); if (d.success && d.data) setCompareVersion(d.data); } catch { notify('Erro ao carregar versao', 'error'); }
  }

  async function handleImproveText() {
    const sel = window.getSelection();
    const selectedText = sel?.toString()?.trim();
    const fullText = editorRef.current?.innerText?.trim();
    if (!selectedText && !fullText) { notify('Nenhum texto para melhorar', 'warning'); return; }

    setImproving(true);
    try {
      if (selectedText) {
        // Modo selecao: melhora apenas o trecho selecionado
        const r = await fetch('/api/agentes/improve-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: selectedText, mode: 'selection' }) });
        const d = await r.json();
        if (!d.success) throw new Error(d.error);
        // Substitui apenas a selecao
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const span = document.createElement('span');
          span.innerHTML = mdToHtml(d.data.text);
          range.insertNode(span);
          sel.removeAllRanges();
        }
        setSavedN(false);
        notify('Texto refinado pelo assistente', 'success');
      } else {
        // Modo full: corrige apenas acentos, semantica e conjugacoes
        const r = await fetch('/api/agentes/improve-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: fullText, mode: 'full' }) });
        const d = await r.json();
        if (!d.success) throw new Error(d.error);
        if (editorRef.current) { editorRef.current.innerHTML = mdToHtml(d.data.text); setSavedN(false); }
        notify('Texto refinado pelo assistente', 'success');
      }
    } catch (err) { notify('Falha ao executar agente. Tente novamente ou reduza o input.', 'error'); }
    finally { setImproving(false); }
  }

  async function handleApplyModification() {
    if (!promptInput.trim() || applying) return;
    const currentOutput = editorRef.current?.innerText || '';
    setApplying(true);
    try {
      const imagesB64 = [];
      for (const img of uploadedImages) { const b64 = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(img.file); }); imagesB64.push({ base64: b64, mimeType: img.file.type }); }
      const filesB64 = [];
      for (const doc of uploadedDocs) { const b64 = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(doc.file); }); filesB64.push({ base64: b64, mimeType: doc.file.type, fileName: doc.name }); }

      const userPrompt = promptInput.trim();
      const r = await fetch('/api/agentes/apply-modification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, stageKey: meta.key, operatorPrompt: userPrompt, currentOutput, chatHistory, ...(imagesB64.length ? { images: imagesB64 } : {}), ...(filesB64.length ? { files: filesB64 } : {}) }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      let outputText = d.data.text;
      // Formata o output via modelo de formatacao
      try {
        const fmtR = await fetch('/api/agentes/format-output', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: outputText }) });
        const fmtD = await fmtR.json();
        if (fmtD.success && fmtD.data?.text) outputText = fmtD.data.text;
      } catch {}
      if (editorRef.current) { editorRef.current.innerHTML = mdToHtml(outputText); editorRef.current.scrollTop = 0; setSavedN(false); }
      setChatHistory(prev => [...prev, { role: 'user', content: userPrompt }, { role: 'assistant', content: outputText }].slice(-12));
      setPromptInput('');
      notify('Rascunho gerado — revise e salve quando estiver pronto', 'success');
    } catch (err) {
      const msg = err.message?.includes('Limite') ? err.message : 'Falha ao executar agente. Tente novamente ou reduza o input.';
      notify(msg, 'error');
    }
    finally { setApplying(false); }
  }

  const btnS = (active) => ({ width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer', background: active ? 'rgba(255,0,51,0.12)' : 'transparent', color: active ? '#ff6680' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, transition: 'all 0.15s' });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 1300, height: '92vh', background: 'linear-gradient(145deg, rgba(14,14,14,0.99), rgba(8,8,8,0.99))', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.15)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: '#ff6680', flexShrink: 0 }}>
              {String(meta.index).padStart(2, '0')}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{meta.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {meta.desc}{clientData?.company_name && <span style={{ color: '#ff6680', marginLeft: 8, fontWeight: 600 }}> &mdash; {clientData.company_name}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={stageStatus} />
            <div style={{ display: 'flex', gap: 3 }}>
              {Object.entries(STATUS_CFG).map(([s, c]) => <button key={s} onClick={() => changeStatus(s)} style={{ padding: '3px 9px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (stageStatus === s ? c.border : 'rgba(255,255,255,0.06)'), background: stageStatus === s ? c.bg : 'transparent', color: stageStatus === s ? c.color : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem' }}>{c.label}</button>)}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* BODY */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* LEFT COLUMN (40%) */}
          <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Contexto */}
              {clientData && (
                <div>
                  <SectionLabel>Contexto</SectionLabel>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'rgba(255,102,128,0.4)', marginBottom: 4, marginTop: -4 }}>Injetado automaticamente em todas as operacoes</div>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,0,51,0.03)', border: '1px solid rgba(255,0,51,0.08)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      <div><strong style={{ color: 'var(--text-primary)' }}>{clientData.company_name}</strong></div>
                      {clientData.niche && <div>Nicho: {clientData.niche}</div>}
                      {clientData.main_product && <div>Produto: {clientData.main_product}</div>}
                      {clientData.avg_ticket && <div>Ticket: {clientData.avg_ticket}</div>}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: clientData.form_done ? 'rgba(34,197,94,0.08)' : 'rgba(249,115,22,0.08)', color: clientData.form_done ? '#22c55e' : '#f97316' }}>
                        {clientData.form_done ? 'Form completo' : 'Dados parciais'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Complementos */}
              <div>
                <SectionLabel>Complementos</SectionLabel>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'rgba(255,102,128,0.4)', marginBottom: 6, marginTop: -4 }}>Mencione "use os arquivos" no prompt para inclui-los</div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginBottom: 4 }}>Imagens (max 10)</div>
                  <input ref={imageInputRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); const v = f.filter(x => /\.(png|jpe?g|webp)$/i.test(x.name)); const r = 10 - uploadedImages.length; setUploadedImages(p => [...p, ...v.slice(0, r).map(x => ({ name: x.name, size: x.size, file: x, preview: URL.createObjectURL(x) }))]); e.target.value = ''; }} />
                  <div onClick={() => imageInputRef.current?.click()} style={{ border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6, padding: '8px', textAlign: 'center', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)' }}>PNG &middot; JPG &middot; WEBP</div>
                  {uploadedImages.length > 0 && <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>{uploadedImages.map((img, i) => <div key={i} style={{ position: 'relative', width: 48, height: 48, borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}><img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><button onClick={() => { URL.revokeObjectURL(img.preview); setUploadedImages(p => p.filter((_, j) => j !== i)); }} style={{ position: 'absolute', top: 1, right: 1, width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>)}</div>}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginBottom: 4 }}>Documentos (max 5)</div>
                  <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); const v = f.filter(x => /\.(pdf|docx?|txt)$/i.test(x.name)); const r = 5 - uploadedDocs.length; setUploadedDocs(p => [...p, ...v.slice(0, r).map(x => ({ name: x.name, size: x.size, file: x }))]); e.target.value = ''; }} />
                  <div onClick={() => docInputRef.current?.click()} style={{ border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6, padding: '8px', textAlign: 'center', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)' }}>PDF &middot; DOCX &middot; TXT</div>
                  {uploadedDocs.length > 0 && <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>{uploadedDocs.map((f, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{f.name}</span><button onClick={() => setUploadedDocs(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>)}</div>}
                </div>
              </div>

              {/* Historico colapsavel */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => { setShowHistory(v => !v); if (!showHistory && historyTab === 'versions' && versionsData.length === 0) loadVersions(); }}>
                  <SectionLabel>Historico</SectionLabel>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" style={{ transform: showHistory ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}><polyline points="6,9 12,15 18,9" /></svg>
                </div>
                {showHistory && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
                      {[{ key: 'history', label: 'Execucoes' }, { key: 'versions', label: 'Versoes' }].map(t => <button key={t.key} onClick={() => { setHistoryTab(t.key); if (t.key === 'versions' && versionsData.length === 0) loadVersions(); }} style={{ padding: '4px 10px', border: 'none', cursor: 'pointer', background: 'transparent', borderBottom: historyTab === t.key ? '2px solid #ff0033' : '2px solid transparent', color: historyTab === t.key ? '#ff6680' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.56rem', fontWeight: 600 }}>{t.label}</button>)}
                    </div>
                    {historyTab === 'history' && (<>
                      {loadingHistory && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', padding: 12 }}>Carregando...</div>}
                      {!loadingHistory && historyData.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', padding: 12 }}>Nenhuma execucao</div>}
                      {historyData.map(item => <div key={item.id} onClick={() => setViewingHistoryItem(item)} style={{ padding: '6px 8px', marginBottom: 4, borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,0,51,0.15)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 600, color: '#ff6680' }}>{item.agent_name}</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'var(--text-muted)' }}>{new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{(item.response_text || '').substring(0, 150)}</div>
                      </div>)}
                    </>)}
                    {historyTab === 'versions' && (<>
                      {loadingVersions && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', padding: 12 }}>Carregando...</div>}
                      {!loadingVersions && versionsData.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', padding: 12 }}>Nenhuma versao</div>}
                      {versionsData.map((v, i) => <div key={v.id} style={{ padding: '6px 8px', marginBottom: 4, borderRadius: 6, background: i === 0 ? 'rgba(255,0,51,0.02)' : 'rgba(255,255,255,0.015)', border: '1px solid ' + (i === 0 ? 'rgba(255,0,51,0.12)' : 'rgba(255,255,255,0.05)') }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', fontWeight: 700, color: i === 0 ? '#ff6680' : 'var(--text-secondary)' }}>v{v.version}</span>
                          {i === 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', fontWeight: 600, padding: '0 4px', borderRadius: 3, background: 'rgba(255,0,51,0.08)', color: '#ff6680' }}>ATUAL</span>}
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', color: 'var(--text-muted)' }}>{v.wordCount} pal.</span>
                          {v.createdBy && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', fontWeight: 600, padding: '0 4px', borderRadius: 3, background: v.createdBy === 'pipeline' ? 'rgba(59,130,246,0.08)' : 'rgba(34,197,94,0.08)', color: v.createdBy === 'pipeline' ? '#3b82f6' : '#22c55e' }}>{v.createdBy === 'pipeline' ? 'pipeline' : 'manual'}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => handleViewVersion(v.version)} style={{ padding: '1px 6px', borderRadius: 3, cursor: 'pointer', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6', fontFamily: 'var(--font-mono)', fontSize: '0.46rem', fontWeight: 600 }}>Ver</button>
                          {i > 0 && <button onClick={() => { if (confirm('Restaurar v' + v.version + '?')) handleRestoreVersion(v.version); }} style={{ padding: '1px 6px', borderRadius: 3, cursor: 'pointer', background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', color: '#f97316', fontFamily: 'var(--font-mono)', fontSize: '0.46rem', fontWeight: 600 }}>Restaurar</button>}
                        </div>
                      </div>)}
                    </>)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (60%) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>OUTPUT</span>
                <StatusBadge status={stageStatus} />
              </div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <button title="Negrito" style={btnS(false)} onClick={() => execCmd('bold')}><strong style={{ fontSize: '0.75rem' }}>B</strong></button>
                <button title="Italico" style={btnS(false)} onClick={() => execCmd('italic')}><em style={{ fontSize: '0.75rem' }}>I</em></button>
                <button title="Destaque" style={btnS(highlighted)} onClick={toggleHighlight}><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="14" width="18" height="4" rx="1"/><path d="M7 14V6l5 3 5-3v8" fill="none" stroke="currentColor" strokeWidth="2"/></svg></button>
                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.07)', margin: '0 3px' }} />
                <button onClick={handleImproveText} disabled={improving || applying} style={{ ...btnS(improving), width: 'auto', padding: '0 8px', fontSize: '0.58rem', cursor: improving ? 'not-allowed' : 'pointer', color: improving ? '#a855f7' : 'var(--text-muted)', background: improving ? 'rgba(168,85,247,0.12)' : 'transparent' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  {improving ? 'Melhorando...' : 'Melhorar'}
                </button>
                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.07)', margin: '0 3px' }} />
                <button onClick={handleCopy} style={{ ...btnS(false), width: 'auto', padding: '0 8px', fontSize: '0.58rem' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copiar
                </button>
              </div>
            </div>

            {/* Editor */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {historyDraftLabel && (
                <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 15, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 600, color: 'var(--warning)' }}>
                  Rascunho do historico &mdash; {historyDraftLabel} &mdash; nao salvo
                </div>
              )}
              <div ref={editorRef} contentEditable={!applying} suppressContentEditableWarning onInput={handleEditorInput} data-placeholder="O rascunho gerado pelo pipeline aparece aqui. Use a area abaixo para pedir modificacoes com IA." style={{ width: '100%', height: '100%', padding: '18px 22px', outline: 'none', overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', lineHeight: 1.8, color: 'var(--text-secondary)', caretColor: '#ff0033', boxSizing: 'border-box', opacity: applying ? 0.15 : 1, transition: 'opacity 0.3s' }} />

              {compareVersion && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(5,5,5,0.99)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>Comparador</div>
                    <button onClick={() => setCompareVersion(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#ff6680' }}>ATUAL</div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}><div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', lineHeight: 1.7, color: '#d4d4d4', whiteSpace: 'pre-wrap' }}>{editorRef.current?.innerText || '(vazio)'}</div></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3b82f6' }}>VERSAO {compareVersion.version}</div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}><div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', lineHeight: 1.7, color: '#d4d4d4', whiteSpace: 'pre-wrap' }}>{compareVersion.text || '(vazio)'}</div></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '8px 18px', borderTop: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
                    <button onClick={() => setCompareVersion(null)} style={{ padding: '4px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#737373', fontFamily: 'var(--font-mono)', fontSize: '0.56rem', fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
                    <button onClick={() => { if (confirm('Restaurar v' + compareVersion.version + '?')) handleRestoreVersion(compareVersion.version); }} style={{ padding: '4px 10px', borderRadius: 5, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', color: '#f97316', fontFamily: 'var(--font-mono)', fontSize: '0.56rem', fontWeight: 600, cursor: 'pointer' }}>Restaurar</button>
                  </div>
                </div>
              )}

              {applying && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
                  <div style={{ width: 36, height: 36, border: '3px solid rgba(255,0,51,0.12)', borderTopColor: '#ff0033', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ff6680', fontWeight: 600 }}>Aplicando modificacao...</div>
                </div>
              )}
            </div>

            {/* Footer save */}
            <div style={{ padding: '8px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexShrink: 0, background: 'rgba(0,0,0,0.2)' }}>
              <button onClick={() => saveNotes('in_progress')} disabled={savingN} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, cursor: savingN ? 'not-allowed' : 'pointer', background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', color: '#f97316', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600 }}>Salvar Rascunho</button>
              <button onClick={() => saveNotes('done')} disabled={savingN} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, cursor: savingN ? 'not-allowed' : 'pointer', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600 }}>Marcar Concluido</button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,0,51,0.2), transparent)', flexShrink: 0 }} />

            {/* MODIFICAR COM IA */}
            <div style={{ padding: '12px 18px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#ff6680' }}>Modificar com IA</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'var(--text-muted)' }}>Peca modificacoes no output acima</span>
              </div>
              <textarea value={promptInput} onChange={e => setPromptInput(e.target.value.slice(0, 900000))} placeholder={phVisible ? PROMPT_PLACEHOLDERS[placeholderIdx] : ''} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleApplyModification(); } }} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: 'rgba(10,10,10,0.6)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', lineHeight: 1.5, outline: 'none', resize: 'none', height: 80, transition: 'border-color 0.2s' }} onFocus={e => { e.target.style.borderColor = 'rgba(255,0,51,0.25)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.07)'; }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'var(--text-muted)' }}>{promptInput.length > 0 ? promptInput.length.toLocaleString() + ' chars' : ''}</span>
                <button onClick={handleApplyModification} disabled={!promptInput.trim() || applying} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', cursor: !promptInput.trim() || applying ? 'not-allowed' : 'pointer', background: !promptInput.trim() || applying ? 'rgba(255,0,51,0.15)' : 'linear-gradient(135deg, #ff0033, #cc0029)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, opacity: !promptInput.trim() || applying ? 0.4 : 1, transition: 'all 0.2s', boxShadow: promptInput.trim() && !applying ? '0 0 12px rgba(255,0,51,0.2)' : 'none' }}>
                  {applying ? 'Aplicando...' : 'Aplicar >'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* POPUP DO HISTORICO */}
        {viewingHistoryItem && (
          <div onClick={() => setViewingHistoryItem(null)} style={{ position: 'absolute', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 700, maxHeight: '80vh', background: 'linear-gradient(145deg, rgba(14,14,14,0.99), rgba(8,8,8,0.99))', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{viewingHistoryItem.agent_name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginTop: 2 }}>{new Date(viewingHistoryItem.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <button onClick={() => setViewingHistoryItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{viewingHistoryItem.response_text || ''}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                <button onClick={() => applyHistoryAsDraft(viewingHistoryItem)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, var(--action-primary), var(--brand-600))', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, boxShadow: '0 0 12px rgba(255,0,51,0.2)' }}>
                  &larr; Aplicar como Rascunho
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          [contenteditable][data-placeholder]:empty:before { content: attr(data-placeholder); color: #2a2a2a; pointer-events: none; }
          [contenteditable] b, [contenteditable] strong { color: var(--text-primary); font-weight: 700; }
          [contenteditable] i, [contenteditable] em { color: #ff6680; font-style: italic; }
          [contenteditable] a { color: #3b82f6; text-decoration: underline; }
          [contenteditable] span[style*="background"] { padding: 0 3px; border-radius: 2px; }
          [contenteditable] h1, [contenteditable] h2, [contenteditable] h3 { color: var(--text-primary); }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}
