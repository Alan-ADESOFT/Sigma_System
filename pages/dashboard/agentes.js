/**
 * pages/dashboard/agentes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo de Agentes IA — CopyCreator
 *
 * Layout em 3 colunas:
 *   · Sidebar esquerda  → lista de agentes disponíveis
 *   · Workspace central → interface do agente selecionado
 *   · Painel direito    → histórico de gerações (colapsável)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────────────────────────────────────── */

const MODEL_LABELS = {
  weak:   { label: 'Rápido',  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.25)' },
  medium: { label: 'Padrão',  color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.25)' },
  strong: { label: 'Premium', color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.25)' },
};

const DRAFT_STATUS = {
  pendente:    { label: 'Pendente',    color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.2)' },
  desenvolvendo: { label: 'Rascunho', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.2)' },
  concluido:   { label: 'Concluído',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.2)'  },
};

const LOADING_MESSAGES = [
  'Iniciando agente...',
  'Processando dados...',
  'Pesquisando na web...',
  'Analisando fontes...',
  'Gerando conteúdo...',
  'Aplicando formatação...',
  'Refinando resposta...',
  'Quase pronto...',
];

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITÁRIO — Parser de Markdown simples
   Converte sintaxe básica em HTML inline seguro.
───────────────────────────────────────────────────────────────────────────── */
function parseMarkdown(text) {
  if (!text) return '';

  const lines  = text.split('\n');
  const html   = [];
  let inUl     = false;

  const closeUl = () => {
    if (inUl) { html.push('</ul>'); inUl = false; }
  };

  const inlineParse = (line) =>
    line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener" style="color:#ff6680;text-decoration:underline">$1</a>')
      .replace(/`(.+?)`/g,
        '<code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-family:var(--font-mono);font-size:0.85em">$1</code>');

  for (const line of lines) {
    // Separador
    if (/^-{3,}$/.test(line.trim())) {
      closeUl();
      html.push('<hr style="border:none;border-top:1px solid rgba(255,0,51,0.15);margin:16px 0"/>');
      continue;
    }

    // Cabeçalhos
    if (/^###\s/.test(line)) {
      closeUl();
      html.push(`<h3 style="font-family:var(--font-mono);font-size:0.8rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin:18px 0 8px">${inlineParse(line.replace(/^###\s/, ''))}</h3>`);
      continue;
    }
    if (/^##\s/.test(line)) {
      closeUl();
      html.push(`<h2 style="font-family:var(--font-mono);font-size:0.95rem;font-weight:700;color:var(--text-primary);margin:20px 0 8px">${inlineParse(line.replace(/^##\s/, ''))}</h2>`);
      continue;
    }
    if (/^#\s/.test(line)) {
      closeUl();
      html.push(`<h1 style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--text-primary);margin:20px 0 10px">${inlineParse(line.replace(/^#\s/, ''))}</h1>`);
      continue;
    }

    // Blockquote
    if (/^>\s/.test(line)) {
      closeUl();
      html.push(`<blockquote style="border-left:3px solid rgba(255,0,51,0.4);padding:6px 12px;margin:8px 0;color:var(--text-secondary);font-style:italic">${inlineParse(line.replace(/^>\s/, ''))}</blockquote>`);
      continue;
    }

    // Lista
    if (/^-\s/.test(line) || /^\*\s/.test(line)) {
      if (!inUl) { html.push('<ul style="padding-left:18px;margin:6px 0;list-style:none">'); inUl = true; }
      html.push(`<li style="position:relative;padding-left:12px;margin:3px 0;color:var(--text-primary);font-size:0.88rem;line-height:1.6"><span style="position:absolute;left:0;top:0.5em;width:5px;height:5px;border-radius:50%;background:rgba(255,0,51,0.5)"></span>${inlineParse(line.replace(/^[-*]\s/, ''))}</li>`);
      continue;
    }

    closeUl();

    // Linha vazia
    if (!line.trim()) {
      html.push('<br/>');
      continue;
    }

    // Linha normal
    const parsed = inlineParse(line);
    if (parsed.startsWith('<')) {
      html.push(parsed);
    } else {
      html.push(`<p style="margin:4px 0;color:var(--text-primary);font-size:0.88rem;line-height:1.7">${parsed}</p>`);
    }
  }

  closeUl();
  return html.join('');
}

/* ─────────────────────────────────────────────────────────────────────────────
   ÍCONES SVG
───────────────────────────────────────────────────────────────────────────── */
const Icon = {
  search:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  stethoscope:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>,
  barChart:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="18" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="2" y="13" width="4" height="8" rx="1"/></svg>,
  users:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  globe:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  userCircle: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>,
  target:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  copy:       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
  save:       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>,
  check:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  refresh:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>,
  history:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>,
  reset:      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>,
  link:       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  image:      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>,
  x:          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  chevronRight:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  chevronLeft: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  externalLink:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  lightning:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
};

const AGENT_ICONS = {
  Stethoscope: Icon.stethoscope,
  Search:      Icon.search,
  BarChart3:   Icon.barChart,
  Users:       Icon.users,
  Globe:       Icon.globe,
  UserCircle:  Icon.userCircle,
  Target:      Icon.target,
};

/* ─────────────────────────────────────────────────────────────────────────────
   SUBCOMPONENTES
───────────────────────────────────────────────────────────────────────────── */

/** Toast de notificação */
function Toast({ toasts }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 9000,
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className="animate-scale-in"
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(145deg,rgba(17,17,17,0.98),rgba(10,10,10,0.99))',
            border: `1px solid ${t.type === 'success' ? 'rgba(34,197,94,0.3)' : t.type === 'error' ? 'rgba(255,0,51,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
            color: t.type === 'success' ? '#22c55e' : t.type === 'error' ? '#ff1a4d' : 'var(--text-secondary)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            maxWidth: 320,
          }}
        >
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Badge de status do rascunho */
function DraftBadge({ status }) {
  const cfg = DRAFT_STATUS[status] || DRAFT_STATUS.pendente;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 4,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
      fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: cfg.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {cfg.label}
    </span>
  );
}

/** Chip de tag removível (para links/imagens) */
function Chip({ value, onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 10px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
      color: 'var(--text-secondary)',
      maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {value}
      <button
        onClick={onRemove}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: 0, display: 'flex',
          flexShrink: 0,
        }}
        title="Remover"
      >
        {Icon.x}
      </button>
    </span>
  );
}

/** Skeleton loader */
function SkeletonLine({ width = '100%', height = 14 }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: 4, marginBottom: 8 }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────────────────────────────────────── */
export default function AgentesPage() {
  /* ── State: agentes ── */
  const [agents, setAgents]         = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);

  /* ── State: workspace ── */
  const [prompt, setPrompt]         = useState('');
  const [isPromptEdited, setIsPromptEdited] = useState(false);
  const [userInput, setUserInput]   = useState('');
  const [modelLevel, setModelLevel] = useState('medium');
  const [links, setLinks]           = useState([]);
  const [images, setImages]         = useState([]);
  const [linkInput, setLinkInput]   = useState('');
  const [imageInput, setImageInput] = useState('');

  /* ── State: geração ── */
  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [result, setResult]         = useState(null);
  const [citations, setCitations]   = useState([]);
  const [draftStatus, setDraftStatus] = useState('pendente');
  const [savedDraftId, setSavedDraftId] = useState(null);

  /* ── State: histórico ── */
  const [showHistory, setShowHistory]   = useState(false);
  const [historyType, setHistoryType]   = useState('agent');
  const [historyData, setHistoryData]   = useState([]);
  const [historyPage, setHistoryPage]   = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);

  /* ── State: UI ── */
  const [toasts, setToasts]         = useState([]);
  const [showPromptArea, setShowPromptArea] = useState(false);
  const loadingMsgRef               = useRef(null);
  const resultRef                   = useRef(null);

  /* ── Efeitos ── */

  // Carrega lista de agentes ao montar
  useEffect(() => {
    fetch('/api/agentes/agents')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setAgents(d.data);
          if (d.data.length) selectAgent(d.data[0]);
        }
      })
      .catch(() => addToast('Erro ao carregar agentes', 'error'))
      .finally(() => setLoadingAgents(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rotação de mensagens de loading
  useEffect(() => {
    if (!loading) return;
    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    const id = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 2200);
    return () => clearInterval(id);
  }, [loading]);

  // Scrolla até o resultado
  useEffect(() => {
    if (result && resultRef.current) {
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [result]);

  /* ── Helpers ── */

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  function selectAgent(agent) {
    setSelectedAgent(agent);
    setPrompt('');
    setIsPromptEdited(false);
    setUserInput('');
    setResult(null);
    setCitations([]);
    setLinks([]);
    setImages([]);
    setDraftStatus('pendente');
    setSavedDraftId(null);
    setModelLevel(agent.modelLevel || 'medium');
    setShowPromptArea(false);
  }

  async function loadHistory() {
    if (!selectedAgent) return;
    setLoadingHistory(true);
    try {
      const r = await fetch(`/api/agentes/history?type=${historyType}&agentName=${selectedAgent.name}&page=${historyPage}&limit=10`);
      const d = await r.json();
      if (d.success) {
        setHistoryData(d.data);
        setHistoryTotal(d.pagination.total);
      }
    } catch { /* ignora */ }
    finally { setLoadingHistory(false); }
  }

  useEffect(() => {
    if (showHistory && selectedAgent) loadHistory();
  }, [showHistory, historyPage, historyType, selectedAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Ações ── */

  async function handleGenerate() {
    if (!selectedAgent) return;
    if (!userInput.trim()) { addToast('Digite o que deseja gerar', 'error'); return; }
    if (loading) return;

    setLoading(true);
    setResult(null);
    setCitations([]);
    setSavedDraftId(null);
    setDraftStatus('pendente');

    try {
      const body = {
        agentName:    selectedAgent.name,
        userInput:    userInput.trim(),
        modelLevel,
        customPrompt: isPromptEdited ? prompt : undefined,
        complements: { links, images },
      };

      const r = await fetch('/api/agentes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();

      if (!d.success) throw new Error(d.error || 'Erro desconhecido');

      setResult(d.data.text);
      setCitations(d.data.citations || []);
      addToast('Conteúdo gerado com sucesso!', 'success');
    } catch (err) {
      addToast(err.message || 'Erro ao gerar conteúdo', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveDraft(status) {
    if (!result) return;
    try {
      const body = {
        agentName: selectedAgent?.name,
        title: `${selectedAgent?.displayName} — ${new Date().toLocaleDateString('pt-BR')}`,
        content: result,
      };

      if (savedDraftId) {
        // Atualiza existente
        await fetch(`/api/agentes/drafts?id=${savedDraftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, content: result }),
        });
      } else {
        // Cria novo
        const r = await fetch('/api/agentes/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.success) {
          setSavedDraftId(d.data.id);
          // Atualiza status após criar
          await fetch(`/api/agentes/drafts?id=${d.data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          });
        }
      }

      setDraftStatus(status);
      addToast(
        status === 'concluido' ? 'Marcado como concluído!' : 'Rascunho salvo!',
        'success'
      );
    } catch {
      addToast('Erro ao salvar rascunho', 'error');
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      addToast('Copiado para a área de transferência!', 'success');
    } catch {
      addToast('Não foi possível copiar', 'error');
    }
  }

  function handleRegenerate() {
    handleGenerate();
  }

  function handleResetPrompt() {
    setPrompt('');
    setIsPromptEdited(false);
    addToast('Prompt restaurado ao padrão', 'info');
  }

  function addLink() {
    const v = linkInput.trim();
    if (!v || links.includes(v)) return;
    setLinks(l => [...l, v]);
    setLinkInput('');
  }

  function addImage() {
    const v = imageInput.trim();
    if (!v || images.includes(v)) return;
    setImages(i => [...i, v]);
    setImageInput('');
  }

  function useHistoryResult(item) {
    const text = item.response_text || item.result_text || '';
    setResult(text);
    setCitations(item.citations ? (typeof item.citations === 'string' ? JSON.parse(item.citations) : item.citations) : []);
    setShowHistory(false);
    addToast('Resultado carregado do histórico', 'info');
    resultRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  const PANEL_W = showHistory ? 300 : 0;

  return (
    <DashboardLayout activeTab="agentes">
      <Toast toasts={toasts} />

      {/* ── Cabeçalho da página ── */}
      <div className="page-header animate-fade-in-up" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,0,51,0.06)',
            border: '1px solid rgba(255,0,51,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
              <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            </svg>
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: 0 }}>CopyCreator IA</h1>
            <p className="page-subtitle" style={{ fontSize: '0.75rem', marginTop: 2 }}>
              Pipeline de agentes especializados para construção estratégica de marca
            </p>
          </div>
        </div>
        <div className="divider-sweep" />
      </div>

      {/* ── Layout em 3 colunas ── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minHeight: 'calc(100vh - 200px)' }}>

        {/* ════════════════════════════════════════════════════════════
            SIDEBAR DE AGENTES
        ════════════════════════════════════════════════════════════ */}
        <aside
          className="animate-fade-in-up stagger-1"
          style={{
            width: 220, flexShrink: 0,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}
        >
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
            fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: '#3a3a3a', marginBottom: 8, paddingLeft: 4,
          }}>
            Pipeline · {agents.length} Agentes
          </div>

          {loadingAgents ? (
            Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 54, borderRadius: 8, marginBottom: 2 }} />
            ))
          ) : (
            agents.map((agent, idx) => {
              const isActive = selectedAgent?.name === agent.name;
              return (
                <button
                  key={agent.name}
                  onClick={() => selectAgent(agent)}
                  className={`animate-fade-in-up stagger-${Math.min(idx + 1, 4)}`}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '10px 12px',
                    background: isActive
                      ? 'linear-gradient(135deg,rgba(255,0,51,0.08),rgba(255,0,51,0.04))'
                      : 'linear-gradient(145deg,rgba(17,17,17,0.6),rgba(10,10,10,0.7))',
                    border: `1px solid ${isActive ? 'rgba(255,0,51,0.2)' : 'rgba(255,255,255,0.04)'}`,
                    borderRadius: 8, cursor: 'pointer',
                    position: 'relative', overflow: 'hidden',
                    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
                      e.currentTarget.style.background = 'linear-gradient(145deg,rgba(17,17,17,0.85),rgba(10,10,10,0.9))';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                      e.currentTarget.style.background = 'linear-gradient(145deg,rgba(17,17,17,0.6),rgba(10,10,10,0.7))';
                    }
                  }}
                >
                  {/* Barra ativa */}
                  {isActive && (
                    <div className="animate-nav-glow" style={{
                      position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                      width: 2, height: '60%', borderRadius: 2, background: '#ff0033',
                    }} />
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 6 }}>
                    {/* Número de ordem */}
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
                      color: isActive ? 'rgba(255,0,51,0.7)' : '#3a3a3a',
                      fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0,
                    }}>
                      {String(agent.order).padStart(2, '0')}
                    </span>

                    {/* Ícone */}
                    <span style={{ color: isActive ? '#ff0033' : '#525252', flexShrink: 0 }}>
                      {AGENT_ICONS[agent.icon] || Icon.lightning}
                    </span>

                    {/* Nome */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                        fontWeight: 600, color: isActive ? '#f0f0f0' : '#737373',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {agent.displayName}
                      </div>
                    </div>
                  </div>

                  {/* Badge tipo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, paddingLeft: 6 }}>
                    {agent.type === 'search' && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '1px 6px', borderRadius: 3,
                        background: 'rgba(59,130,246,0.1)',
                        border: '1px solid rgba(59,130,246,0.2)',
                        fontFamily: 'var(--font-mono)', fontSize: '0.52rem',
                        color: '#3b82f6', fontWeight: 700,
                      }}>
                        {Icon.globe} WEB
                      </span>
                    )}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '1px 6px', borderRadius: 3,
                      background: MODEL_LABELS[agent.modelLevel]?.bg || 'transparent',
                      border: `1px solid ${MODEL_LABELS[agent.modelLevel]?.border || 'transparent'}`,
                      fontFamily: 'var(--font-mono)', fontSize: '0.52rem',
                      color: MODEL_LABELS[agent.modelLevel]?.color || '#525252',
                      fontWeight: 700,
                    }}>
                      {MODEL_LABELS[agent.modelLevel]?.label || agent.modelLevel}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </aside>

        {/* ════════════════════════════════════════════════════════════
            WORKSPACE CENTRAL
        ════════════════════════════════════════════════════════════ */}
        <div
          className="animate-fade-in-up stagger-2"
          style={{
            flex: 1, minWidth: 0,
            display: 'flex', flexDirection: 'column', gap: 16,
            transition: 'all 0.3s ease',
          }}
        >
          {/* Empty state */}
          {!selectedAgent && (
            <div className="glass-card" style={{
              padding: 48, textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,0,51,0.06)', border: '1px solid rgba(255,0,51,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {Icon.lightning}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Selecione um agente para começar
              </div>
            </div>
          )}

          {selectedAgent && (
            <>
              {/* ── Card: Cabeçalho do agente ── */}
              <div className="glass-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 9,
                      background: selectedAgent.type === 'search' ? 'rgba(59,130,246,0.08)' : 'rgba(255,0,51,0.06)',
                      border: `1px solid ${selectedAgent.type === 'search' ? 'rgba(59,130,246,0.2)' : 'rgba(255,0,51,0.15)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{ color: selectedAgent.type === 'search' ? '#3b82f6' : '#ff0033' }}>
                        {AGENT_ICONS[selectedAgent.icon] || Icon.lightning}
                      </span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {selectedAgent.displayName}
                        </h2>
                        {/* Badges */}
                        {selectedAgent.type === 'search' && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 4,
                            background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
                            fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                            color: '#3b82f6', fontWeight: 700, letterSpacing: '0.06em',
                          }}>
                            {Icon.globe} PESQUISA WEB
                          </span>
                        )}
                        <span style={{
                          padding: '2px 8px', borderRadius: 4,
                          background: MODEL_LABELS[modelLevel]?.bg,
                          border: `1px solid ${MODEL_LABELS[modelLevel]?.border}`,
                          fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                          color: MODEL_LABELS[modelLevel]?.color, fontWeight: 700,
                          letterSpacing: '0.06em',
                        }}>
                          {MODEL_LABELS[modelLevel]?.label}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {selectedAgent.description}
                      </p>
                    </div>
                  </div>

                  {/* Botões de ação do cabeçalho */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {/* Histórico */}
                    <button
                      onClick={() => setShowHistory(v => !v)}
                      title="Histórico"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 4,
                        background: showHistory ? 'rgba(255,0,51,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${showHistory ? 'rgba(255,0,51,0.2)' : 'rgba(255,255,255,0.06)'}`,
                        color: showHistory ? '#ff0033' : 'var(--text-muted)',
                        cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                        transition: 'all 0.2s',
                      }}
                    >
                      {Icon.history}
                      Histórico
                    </button>

                    {/* Prompt toggle */}
                    <button
                      onClick={() => setShowPromptArea(v => !v)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 4,
                        background: showPromptArea ? 'rgba(255,0,51,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${showPromptArea ? 'rgba(255,0,51,0.2)' : 'rgba(255,255,255,0.06)'}`,
                        color: showPromptArea ? '#ff0033' : 'var(--text-muted)',
                        cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                        transition: 'all 0.2s',
                      }}
                    >
                      {Icon.reset}
                      {isPromptEdited ? 'Prompt*' : 'Prompt'}
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Card: Área de prompt (colapsável) ── */}
              {showPromptArea && (
                <div className="glass-card animate-fade-in-up" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="label-sm">Prompt do Sistema</span>
                      {isPromptEdited && (
                        <span style={{
                          padding: '1px 7px', borderRadius: 3,
                          background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)',
                          fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
                          color: '#f97316', fontWeight: 700,
                        }}>
                          EDITADO
                        </span>
                      )}
                    </div>
                    {isPromptEdited && (
                      <button
                        onClick={handleResetPrompt}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 10px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          color: 'var(--text-muted)', cursor: 'pointer',
                          fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,0,51,0.2)'; e.currentTarget.style.color = '#ff0033'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        {Icon.reset} Restaurar Padrão
                      </button>
                    )}
                  </div>
                  <textarea
                    value={prompt}
                    onChange={e => { setPrompt(e.target.value); setIsPromptEdited(true); }}
                    placeholder="O prompt padrão será usado (deixe vazio para usar o prompt original do agente)"
                    style={{
                      width: '100%', minHeight: 180,
                      padding: '12px 14px',
                      background: 'rgba(10,10,10,0.6)',
                      border: `1px solid ${isPromptEdited ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 6, color: 'var(--text-secondary)',
                      fontSize: '0.8rem', fontFamily: 'var(--font-mono)',
                      lineHeight: 1.7, resize: 'vertical', outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={e => { e.target.style.borderColor = isPromptEdited ? 'rgba(249,115,22,0.5)' : 'rgba(255,0,51,0.4)'; }}
                    onBlur={e => { e.target.style.borderColor = isPromptEdited ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.06)'; }}
                  />
                </div>
              )}

              {/* ── Card: Input + Complementos + Ação ── */}
              <div className="glass-card" style={{ padding: '20px 20px 16px' }}>
                {/* Input do usuário */}
                <div style={{ marginBottom: 16 }}>
                  <label className="label-sm" style={{ display: 'block', marginBottom: 8 }}>
                    {selectedAgent.type === 'search' ? 'O que pesquisar' : 'Briefing / Instruções'}
                  </label>
                  <textarea
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                    placeholder={
                      selectedAgent.type === 'search'
                        ? 'Ex: Concorrentes de academias em São Paulo que vendem planos mensais...'
                        : 'Ex: Nicho: academia de musculação, público: homens 25-40 anos, objetivo: autoridade...'
                    }
                    rows={5}
                    style={{
                      width: '100%', padding: '12px 14px',
                      background: 'rgba(10,10,10,0.6)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 6, color: 'var(--text-primary)',
                      fontSize: '0.875rem', fontFamily: 'var(--font-sans)',
                      lineHeight: 1.7, resize: 'vertical', outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(255,0,51,0.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,0,51,0.06)'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <div style={{ marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#3a3a3a' }}>
                    Ctrl+Enter para gerar
                  </div>
                </div>

                {/* Complementos — apenas para agentes type: text */}
                {selectedAgent.type === 'text' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {/* Links */}
                    <div>
                      <label className="label-sm" style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                        {Icon.link} Links de Referência
                      </label>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <input
                          value={linkInput}
                          onChange={e => setLinkInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addLink()}
                          placeholder="https://..."
                          style={{
                            flex: 1, padding: '7px 10px',
                            background: 'rgba(10,10,10,0.6)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 5, color: 'var(--text-primary)',
                            fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                            outline: 'none',
                          }}
                        />
                        <button
                          onClick={addLink}
                          style={{
                            padding: '7px 12px', borderRadius: 5,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--text-muted)', cursor: 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                          }}
                        >
                          + Add
                        </button>
                      </div>
                      {links.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {links.map((l, i) => <Chip key={i} value={l} onRemove={() => setLinks(ls => ls.filter((_, j) => j !== i))} />)}
                        </div>
                      )}
                    </div>

                    {/* Imagens */}
                    <div>
                      <label className="label-sm" style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                        {Icon.image} Imagens de Referência
                      </label>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <input
                          value={imageInput}
                          onChange={e => setImageInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addImage()}
                          placeholder="URL ou nome do arquivo"
                          style={{
                            flex: 1, padding: '7px 10px',
                            background: 'rgba(10,10,10,0.6)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 5, color: 'var(--text-primary)',
                            fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                            outline: 'none',
                          }}
                        />
                        <button
                          onClick={addImage}
                          style={{
                            padding: '7px 12px', borderRadius: 5,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--text-muted)', cursor: 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                          }}
                        >
                          + Add
                        </button>
                      </div>
                      {images.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {images.map((img, i) => <Chip key={i} value={img} onRemove={() => setImages(imgs => imgs.filter((_, j) => j !== i))} />)}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Linha de ação: seletor de modelo + botão gerar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Seletor de modelo */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Object.entries(MODEL_LABELS).map(([level, cfg]) => (
                      <button
                        key={level}
                        onClick={() => setModelLevel(level)}
                        style={{
                          padding: '6px 12px', borderRadius: 4,
                          background: modelLevel === level ? cfg.bg : 'transparent',
                          border: `1px solid ${modelLevel === level ? cfg.border : 'rgba(255,255,255,0.06)'}`,
                          color: modelLevel === level ? cfg.color : 'var(--text-muted)',
                          cursor: 'pointer', fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem', fontWeight: 600,
                          transition: 'all 0.2s',
                        }}
                      >
                        {cfg.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ flex: 1 }} />

                  {/* Botão Gerar */}
                  <button
                    onClick={handleGenerate}
                    disabled={loading || !userInput.trim()}
                    className={loading || !userInput.trim() ? '' : 'sigma-btn-primary'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 24px', borderRadius: 4,
                      fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                      fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                      cursor: loading || !userInput.trim() ? 'not-allowed' : 'pointer',
                      opacity: loading || !userInput.trim() ? 0.5 : 1,
                      background: loading || !userInput.trim()
                        ? 'rgba(17,17,17,0.8)'
                        : 'linear-gradient(135deg,#cc0029,#ff0033)',
                      border: `1px solid ${loading || !userInput.trim() ? 'rgba(255,255,255,0.06)' : 'rgba(255,0,51,0.4)'}`,
                      color: '#fff',
                      transition: 'all 0.25s',
                    }}
                  >
                    {loading ? (
                      <>
                        <div className="spinner" style={{ width: 13, height: 13 }} />
                        Gerando...
                      </>
                    ) : (
                      <>
                        {Icon.lightning}
                        Gerar Conteúdo
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* ── Loading: animação premium ── */}
              {loading && (
                <div className="glass-card animate-fade-in-up" style={{ padding: '28px 24px', textAlign: 'center' }}>
                  {/* Barra de progresso animada */}
                  <div style={{
                    height: 2, background: 'rgba(255,255,255,0.04)',
                    borderRadius: 2, overflow: 'hidden', marginBottom: 24,
                  }}>
                    <div style={{
                      height: '100%',
                      background: 'linear-gradient(90deg,transparent,#ff0033,#ff6680,transparent)',
                      backgroundSize: '200% 100%',
                      animation: 'dividerSweep 1.2s linear infinite',
                    }} />
                  </div>

                  {/* Barras de waveform */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 20 }}>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div
                        key={i}
                        className="animate-wave"
                        style={{
                          width: 3, height: 28 + (i % 3) * 8,
                          background: `rgba(255,0,51,${0.3 + (i % 3) * 0.2})`,
                          borderRadius: 2, transformOrigin: 'bottom',
                          animationDelay: `${i * 0.12}s`,
                          animationDuration: `${0.8 + (i % 3) * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>

                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
                    color: 'var(--text-secondary)', letterSpacing: '0.04em',
                    transition: 'all 0.5s ease',
                  }}>
                    {loadingMsg}
                  </div>
                  <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#3a3a3a' }}>
                    Agente: {selectedAgent.displayName} · Modelo: {MODEL_LABELS[modelLevel]?.label}
                  </div>

                  {/* Skeletons */}
                  <div style={{ marginTop: 24, textAlign: 'left' }}>
                    <SkeletonLine width="75%" />
                    <SkeletonLine width="90%" />
                    <SkeletonLine width="60%" />
                    <SkeletonLine width="85%" />
                    <SkeletonLine width="45%" />
                  </div>
                </div>
              )}

              {/* ── Resultado ── */}
              {result && !loading && (
                <div ref={resultRef} className="glass-card animate-fade-in-up" style={{ padding: '20px 24px' }}>
                  {/* Header do resultado */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 16, flexWrap: 'wrap', gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="label-sm">Resultado</span>
                      {savedDraftId && <DraftBadge status={draftStatus} />}
                    </div>

                    {/* Ações */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {/* Copiar */}
                      <button
                        onClick={handleCopy}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          color: 'var(--text-muted)', cursor: 'pointer',
                          fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        {Icon.copy} Copiar
                      </button>

                      {/* Regenerar */}
                      <button
                        onClick={handleRegenerate}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          color: 'var(--text-muted)', cursor: 'pointer',
                          fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        {Icon.refresh} Regenerar
                      </button>

                      {/* Salvar Rascunho */}
                      {draftStatus !== 'concluido' && (
                        <button
                          onClick={() => handleSaveDraft('desenvolvendo')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px', borderRadius: 4,
                            background: 'rgba(249,115,22,0.08)',
                            border: '1px solid rgba(249,115,22,0.2)',
                            color: '#f97316', cursor: 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.14)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.08)'; }}
                        >
                          {Icon.save} Salvar Rascunho
                        </button>
                      )}

                      {/* Concluir */}
                      {draftStatus !== 'concluido' && (
                        <button
                          onClick={() => handleSaveDraft('concluido')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px', borderRadius: 4,
                            background: 'rgba(34,197,94,0.08)',
                            border: '1px solid rgba(34,197,94,0.2)',
                            color: '#22c55e', cursor: 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.14)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.08)'; }}
                        >
                          {Icon.check} Concluir
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="divider-sweep" style={{ marginBottom: 16 }} />

                  {/* Conteúdo Markdown renderizado */}
                  <div
                    style={{
                      minHeight: 120,
                      lineHeight: 1.7,
                    }}
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(result) }}
                  />

                  {/* Citations */}
                  {citations.length > 0 && (
                    <div style={{
                      marginTop: 20,
                      paddingTop: 16,
                      borderTop: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <div className="label-sm" style={{ marginBottom: 10 }}>
                        Fontes ({citations.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {citations.map((c, i) => (
                          <a
                            key={i}
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '7px 12px', borderRadius: 6,
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(255,255,255,0.05)',
                              color: 'var(--text-secondary)',
                              fontSize: '0.78rem', textDecoration: 'none',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,102,128,0.25)'; e.currentTarget.style.color = '#ff6680'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                          >
                            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{Icon.externalLink}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.title || c.url}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════
            PAINEL DIREITO — HISTÓRICO
        ════════════════════════════════════════════════════════════ */}
        {showHistory && (
          <aside
            className="animate-scale-in"
            style={{
              width: 300, flexShrink: 0,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            {/* Header do painel */}
            <div className="glass-card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="label-sm">Histórico</span>
                <button
                  onClick={() => setShowHistory(false)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex', padding: 2,
                  }}
                >
                  {Icon.x}
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { key: 'agent', label: 'Gerações' },
                  { key: 'search', label: 'Pesquisas' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { setHistoryType(tab.key); setHistoryPage(1); }}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 4,
                      background: historyType === tab.key ? 'rgba(255,0,51,0.08)' : 'transparent',
                      border: `1px solid ${historyType === tab.key ? 'rgba(255,0,51,0.2)' : 'rgba(255,255,255,0.04)'}`,
                      color: historyType === tab.key ? '#ff0033' : 'var(--text-muted)',
                      cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                      fontWeight: 600, transition: 'all 0.2s',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de itens */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
              {loadingHistory ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 72, borderRadius: 8 }} />
                ))
              ) : historyData.length === 0 ? (
                <div className="glass-card" style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#3a3a3a' }}>
                    Nenhum histórico encontrado
                  </div>
                </div>
              ) : (
                historyData.map(item => (
                  <div
                    key={item.id}
                    className="glass-card glass-card-hover"
                    style={{ padding: '12px 14px', cursor: 'pointer' }}
                    onClick={() => useHistoryResult(item)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                        color: '#ff0033', fontWeight: 700,
                      }}>
                        {item.agent_name || 'pesquisa'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#3a3a3a' }}>
                        {new Date(item.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p style={{
                      fontSize: '0.75rem', color: 'var(--text-muted)',
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      lineHeight: 1.5,
                    }}>
                      {(item.response_text || item.result_text || item.query || '').slice(0, 120)}...
                    </p>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#525252' }}>
                        {item.model_used || (item.citations ? `${JSON.parse(item.citations || '[]').length} fontes` : '')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Paginação */}
            {historyTotal > 10 && (
              <div className="glass-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                  disabled={historyPage === 1}
                  style={{
                    background: 'none', border: 'none', cursor: historyPage === 1 ? 'not-allowed' : 'pointer',
                    color: historyPage === 1 ? '#3a3a3a' : 'var(--text-muted)', display: 'flex',
                  }}
                >
                  {Icon.chevronLeft}
                </button>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  {historyPage} / {Math.ceil(historyTotal / 10)}
                </span>
                <button
                  onClick={() => setHistoryPage(p => p + 1)}
                  disabled={historyPage >= Math.ceil(historyTotal / 10)}
                  style={{
                    background: 'none', border: 'none',
                    cursor: historyPage >= Math.ceil(historyTotal / 10) ? 'not-allowed' : 'pointer',
                    color: historyPage >= Math.ceil(historyTotal / 10) ? '#3a3a3a' : 'var(--text-muted)', display: 'flex',
                  }}
                >
                  {Icon.chevronRight}
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </DashboardLayout>
  );
}
