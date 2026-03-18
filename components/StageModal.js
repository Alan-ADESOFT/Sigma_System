/**
 * components/StageModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de etapa reutilizável — usado em Base de Dados e em Info Cliente.
 * Esquerda : rich-text editor (Bold · Italic · Highlight) + footer de ações
 * Direita  : painel do agente (tabs, execução, histórico, referências)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotification } from '../context/NotificationContext';

/* ── Mapa de IDs internos → nomes dos agentes no backend ── */
const AGENT_NAME_MAP = {
  'a1':  'agente1',
  'a2a': 'agente2a',
  'a2b': 'agente2b',
  'a3':  'agente3',
  'a4a': 'agente4a',
  'a4b': 'agente4b',
  'a5':  'agente5',
};

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

const LOADING_MESSAGES = [
  'Iniciando agente...',
  'Processando dados do cliente...',
  'Pesquisando na web...',
  'Analisando fontes encontradas...',
  'Gerando conteúdo estratégico...',
  'Aplicando formatação...',
  'Refinando resposta...',
  'Quase pronto...',
];

const STATUS_CFG = {
  pending:     { label: 'Pendente',     color: '#525252', bg: 'rgba(82,82,82,0.12)',   border: 'rgba(82,82,82,0.3)'   },
  in_progress: { label: 'Em andamento', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
  done:        { label: 'Concluído',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)'  },
};

/* ── Sub-componentes ── */

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

/* ── Ícones SVG ── */
const Ico = {
  save:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  check:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  copy:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  history: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  close:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

/**
 * @param {object} props
 * @param {{ key, index, label, desc }} props.meta
 * @param {object|null} props.stage  — row from marketing_stages
 * @param {string} props.clientId
 * @param {object} [props.clientData] — dados do cliente (marketing_clients row)
 * @param {function} props.onClose
 * @param {function} props.onSaved  — called with (updatedStage) after any save
 */
export default function StageModal({ meta, stage, clientId, clientData, onClose, onSaved }) {
  const { notify } = useNotification();
  const editorRef  = useRef(null);

  /* ── State ── */
  const [agentTab, setAgentTab]         = useState(0);
  const [refLink,  setRefLink]          = useState('');
  const [stageStatus, setStageStatus]   = useState(stage?.status || 'pending');
  const [savingN,  setSavingN]          = useState(false);
  const [savedN,   setSavedN]           = useState(false);
  const [highlighted, setHighlighted]   = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [loadingMsg, setLoadingMsg]     = useState('');
  const [showHistory, setShowHistory]   = useState(false);
  const [historyData, setHistoryData]   = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [modelLevel, setModelLevel]     = useState('medium');

  const agents = AGENTS[meta.key] || [];

  /* ── Efeitos ── */
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

  // Rotação de mensagens de loading
  useEffect(() => {
    if (!generating) return;
    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    const id = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 2200);
    return () => clearInterval(id);
  }, [generating]);

  /* ── Helpers editor ── */
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

  /* ── Salvar notas ── */
  async function saveNotes(statusOverride) {
    const html = editorRef.current?.innerHTML || '';
    setSavingN(true);
    try {
      const payload = { stage_key: meta.key, notes: html };
      if (statusOverride) payload.status = statusOverride;

      console.log('[INFO][Frontend:StageModal] Salvando notas', { clientId, stage_key: meta.key, status: statusOverride });
      const res  = await fetch(`/api/clients/${clientId}/stages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setSavedN(true);
        if (statusOverride) setStageStatus(statusOverride);
        onSaved?.({ ...stage, notes: html, ...(statusOverride ? { status: statusOverride } : {}) });
        console.log('[SUCESSO][Frontend:StageModal] Notas salvas', { clientId, stage_key: meta.key });

        if (statusOverride === 'done') {
          notify('Etapa marcada como concluída!', 'success');
        } else if (statusOverride === 'in_progress') {
          notify('Rascunho salvo com sucesso!', 'success');
        } else {
          notify('Notas salvas com sucesso', 'success');
        }
      }
    } catch (e) {
      console.error('[ERRO][Frontend:StageModal] Erro ao salvar notas', { error: e.message });
      notify('Erro ao salvar notas', 'error');
    }
    finally { setSavingN(false); }
  }

  /* ── Alterar status ── */
  async function changeStatus(s) {
    setStageStatus(s);
    try {
      console.log('[INFO][Frontend:StageModal] Alterando status', { clientId, stage_key: meta.key, status: s });
      const res  = await fetch(`/api/clients/${clientId}/stages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_key: meta.key, status: s }),
      });
      const json = await res.json();
      if (json.success) {
        onSaved?.({ ...stage, status: s });
        console.log('[SUCESSO][Frontend:StageModal] Status alterado', { stage_key: meta.key, status: s });
        notify('Status atualizado', 'success');
      }
    } catch (e) {
      console.error('[ERRO][Frontend:StageModal] Erro ao alterar status', { error: e.message });
      notify('Erro ao alterar status', 'error');
    }
  }

  /* ── Copiar conteúdo ── */
  async function handleCopy() {
    const text = editorRef.current?.innerText || '';
    if (!text.trim()) { notify('Nada para copiar', 'warning'); return; }
    try {
      await navigator.clipboard.writeText(text);
      notify('Copiado para a área de transferência!', 'success');
    } catch {
      notify('Não foi possível copiar', 'error');
    }
  }

  /* ── Carregar histórico ── */
  const loadHistory = useCallback(async () => {
    if (!clientId) return;
    setLoadingHistory(true);
    try {
      // Busca histórico de agentes filtrado pelos agentes desta etapa
      const agentNames = agents
        .map(a => AGENT_NAME_MAP[a.id])
        .filter(Boolean);

      if (!agentNames.length) { setLoadingHistory(false); return; }

      console.log('[INFO][Frontend:StageModal] Carregando histórico', { agentNames });
      const results = await Promise.all(
        agentNames.map(name =>
          fetch(`/api/agentes/history?type=agent&agentName=${name}&limit=5`)
            .then(r => r.json())
            .then(d => d.success ? d.data : [])
            .catch(() => [])
        )
      );

      const allHistory = results.flat().sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      ).slice(0, 10);

      setHistoryData(allHistory);
      console.log('[SUCESSO][Frontend:StageModal] Histórico carregado', { count: allHistory.length });
    } catch (err) {
      console.error('[ERRO][Frontend:StageModal] Falha ao carregar histórico', { error: err.message });
    } finally {
      setLoadingHistory(false);
    }
  }, [clientId, agents]);

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory, loadHistory]);

  /* ── Usar item do histórico ── */
  function useHistoryItem(item) {
    if (editorRef.current && item.response_text) {
      const html = item.response_text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^- (.+)$/gm, '• $1')
        .replace(/\n/g, '<br>');
      editorRef.current.innerHTML = html;
      setSavedN(false);
      setShowHistory(false);
      notify('Resultado carregado do histórico', 'info');
    }
  }

  /* ── Executar Agente ── */
  async function handleRunAgent() {
    const currentAgent = agents[agentTab];
    if (!currentAgent) return;

    const agentName = AGENT_NAME_MAP[currentAgent.id];
    if (!agentName) {
      notify('Agente ainda não implementado', 'warning');
      return;
    }

    setGenerating(true);
    notify(`Executando ${currentAgent.label}...`, 'info');

    try {
      const clientJson = clientData ? JSON.stringify({
        empresa:            clientData.company_name,
        nicho:              clientData.niche,
        produto_principal:  clientData.main_product,
        descricao_produto:  clientData.product_description,
        transformacao:      clientData.transformation,
        principal_problema: clientData.main_problem,
        ticket_medio:       clientData.avg_ticket,
        regiao:             clientData.region,
        objetivo:           clientData.comm_objective,
        email:              clientData.email,
        telefone:           clientData.phone,
        links:              clientData.important_links,
        servicos:           clientData.services,
        observacoes:        clientData.observations,
      }, null, 2) : 'Dados do cliente não disponíveis';

      const body = {
        agentName,
        clientId,
        modelLevel,
        userInput: clientJson,
        context: { '{DADOS_CLIENTE}': clientJson },
        complements: refLink ? { links: [refLink] } : {},
      };

      console.log('[INFO][Frontend:StageModal] Executando agente', { agentName, clientId, stage: meta.key });

      const r = await fetch('/api/agentes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();

      if (!d.success) throw new Error(d.error || 'Erro desconhecido');

      console.log('[SUCESSO][Frontend:StageModal] Agente executado', { agentName, responseLength: d.data.text.length });

      if (editorRef.current) {
        const html = d.data.text
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
          .replace(/^- (.+)$/gm, '• $1')
          .replace(/\n/g, '<br>');
        editorRef.current.innerHTML = html;
        setSavedN(false);
      }

      notify('Conteúdo gerado com sucesso!', 'success');

      // Auto-save no stage como rascunho
      await fetch(`/api/clients/${clientId}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage_key: meta.key,
          notes: editorRef.current?.innerHTML || '',
          data: { agentOutput: d.data.text, agentName, generatedAt: new Date().toISOString() },
          status: 'in_progress',
        }),
      });
      setStageStatus('in_progress');
      onSaved?.({ ...stage, status: 'in_progress', data: { agentOutput: d.data.text } });

    } catch (err) {
      console.error('[ERRO][Frontend:StageModal] Falha ao executar agente', { error: err.message });
      notify('Erro: ' + err.message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  /* ── Estilos ── */
  const btnStyle = (active) => ({
    width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer',
    background: active ? 'rgba(255,0,51,0.12)' : 'transparent',
    color: active ? '#ff6680' : 'var(--text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700,
    transition: 'all 0.15s',
  });

  const footerBtnStyle = (color, bg, border) => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 6,
    background: bg, border: `1px solid ${border}`,
    color, cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
    transition: 'all 0.15s',
  });

  const currentAgent = agents[agentTab];
  const canRun = currentAgent && AGENT_NAME_MAP[currentAgent.id];

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
          width: '100%', maxWidth: 1300, height: '92vh',
          background: 'linear-gradient(145deg, rgba(14,14,14,0.99), rgba(8,8,8,0.99))',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
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
                {clientData?.company_name && (
                  <span style={{ color: '#ff6680', marginLeft: 8 }}>— {clientData.company_name}</span>
                )}
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
              {Ico.close}
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── LEFT: Editor + Footer ── */}
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
                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.07)', margin: '0 3px' }} />
                <button onClick={() => saveNotes()} disabled={savingN} style={{
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

            {/* Editor (com position relative para overlay) */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <div
                ref={editorRef}
                contentEditable={!generating}
                suppressContentEditableWarning
                onInput={() => setSavedN(false)}
                data-placeholder="Escreva as notas desta etapa ou execute o agente..."
                style={{
                  width: '100%', height: '100%', padding: '18px 22px', outline: 'none', overflow: 'auto',
                  fontFamily: 'var(--font-mono)', fontSize: '0.82rem', lineHeight: 1.8,
                  color: 'var(--text-secondary)', caretColor: '#ff0033',
                  boxSizing: 'border-box',
                  opacity: generating ? 0.15 : 1, transition: 'opacity 0.3s',
                }}
              />

              {/* Loading overlay */}
              {generating && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    width: 40, height: 40, border: '3px solid rgba(255,0,51,0.12)', borderTopColor: '#ff0033',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#ff6680',
                    letterSpacing: '0.04em', fontWeight: 600,
                  }}>
                    {loadingMsg}
                  </div>
                  <div style={{
                    width: 180, height: 3, borderRadius: 3, background: 'rgba(255,0,51,0.1)', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: '40%', height: '100%', background: '#ff0033', borderRadius: 3,
                      animation: 'loadbar 1.5s ease-in-out infinite',
                    }} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer: ações de rascunho ── */}
            <div style={{
              padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
              background: 'rgba(0,0,0,0.2)',
            }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleCopy}
                  style={footerBtnStyle('var(--text-muted)', 'transparent', 'rgba(255,255,255,0.08)')}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  {Ico.copy} Copiar
                </button>
                <button
                  onClick={() => setShowHistory(v => !v)}
                  style={footerBtnStyle(
                    showHistory ? '#3b82f6' : 'var(--text-muted)',
                    showHistory ? 'rgba(59,130,246,0.08)' : 'transparent',
                    showHistory ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.08)',
                  )}
                >
                  {Ico.history} Histórico
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => saveNotes('in_progress')}
                  disabled={savingN}
                  style={footerBtnStyle('#f97316', 'rgba(249,115,22,0.06)', 'rgba(249,115,22,0.2)')}
                >
                  {Ico.save} Salvar Rascunho
                </button>
                <button
                  onClick={() => saveNotes('done')}
                  disabled={savingN}
                  style={footerBtnStyle('#22c55e', 'rgba(34,197,94,0.06)', 'rgba(34,197,94,0.2)')}
                >
                  {Ico.check} Marcar Concluído
                </button>
              </div>
            </div>

            <style>{`
              [contenteditable][data-placeholder]:empty:before {
                content: attr(data-placeholder); color: #2a2a2a; pointer-events: none;
              }
              [contenteditable] b, [contenteditable] strong { color: var(--text-primary); font-weight: 700; }
              [contenteditable] i, [contenteditable] em { color: #ff6680; font-style: italic; }
              [contenteditable] a { color: #3b82f6; text-decoration: underline; }
              [contenteditable] span[style*="background"] { padding: 0 3px; border-radius: 2px; }
              [contenteditable] h1, [contenteditable] h2, [contenteditable] h3 { color: var(--text-primary); }
              @keyframes spin { to { transform: rotate(360deg); } }
              @keyframes loadbar { 0%{transform:translateX(-100%)} 50%{transform:translateX(150%)} 100%{transform:translateX(-100%)} }
            `}</style>
          </div>

          {/* ── RIGHT: Agent panel / History ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* ── Histórico (condicional) ── */}
            {showHistory ? (
              <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <SectionLabel>Histórico de Gerações</SectionLabel>
                  <button
                    onClick={() => setShowHistory(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                    </svg>
                  </button>
                </div>

                {loadingHistory && (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                    Carregando histórico...
                  </div>
                )}

                {!loadingHistory && historyData.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 30, color: '#2a2a2a', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                    Nenhuma geração anterior encontrada
                  </div>
                )}

                {historyData.map(item => (
                  <div
                    key={item.id}
                    onClick={() => useHistoryItem(item)}
                    style={{
                      padding: '10px 12px', marginBottom: 8, borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,0,51,0.15)'; e.currentTarget.style.background = 'rgba(255,0,51,0.02)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, color: '#ff6680' }}>
                        {item.agent_name}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)' }}>
                        {new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)',
                      lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                    }}>
                      {(item.response_text || '').substring(0, 200)}...
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'rgba(255,102,128,0.5)', marginTop: 4 }}>
                      Clique para carregar →
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── Painel normal do agente ── */
              <>
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

                  {/* Info do cliente */}
                  {clientData && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 8,
                      background: 'rgba(255,0,51,0.03)', border: '1px solid rgba(255,0,51,0.08)',
                    }}>
                      <SectionLabel>Dados do Cliente</SectionLabel>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        <div><strong style={{ color: 'var(--text-primary)' }}>{clientData.company_name}</strong></div>
                        {clientData.niche && <div>Nicho: {clientData.niche}</div>}
                        {clientData.main_product && <div>Produto: {clientData.main_product}</div>}
                        {clientData.avg_ticket && <div>Ticket: {clientData.avg_ticket}</div>}
                      </div>
                    </div>
                  )}

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

                  {/* Seletor de Modelo */}
                  <div>
                    <SectionLabel>Modelo de IA</SectionLabel>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { value: 'medium', label: 'Padrão', desc: 'GPT-4o — rápido e econômico', color: '#3b82f6' },
                        { value: 'strong', label: 'Premium', desc: 'Opus 4.6 — máxima qualidade', color: '#a855f7' },
                      ].map(m => (
                        <button
                          key={m.value}
                          onClick={() => setModelLevel(m.value)}
                          style={{
                            flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                            background: modelLevel === m.value ? `${m.color}10` : 'rgba(255,255,255,0.01)',
                            border: `1px solid ${modelLevel === m.value ? `${m.color}44` : 'rgba(255,255,255,0.06)'}`,
                            textAlign: 'left', transition: 'all 0.15s',
                          }}
                        >
                          <div style={{
                            fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700,
                            color: modelLevel === m.value ? m.color : 'var(--text-muted)',
                            marginBottom: 2,
                          }}>
                            {m.label}
                          </div>
                          <div style={{
                            fontFamily: 'var(--font-mono)', fontSize: '0.52rem',
                            color: modelLevel === m.value ? 'var(--text-secondary)' : '#2a2a2a',
                          }}>
                            {m.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Botão Executar Agente */}
                  <button
                    onClick={handleRunAgent}
                    disabled={generating || !canRun}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 8, marginTop: 'auto',
                      background: generating
                        ? 'rgba(249,115,22,0.08)'
                        : canRun
                          ? 'linear-gradient(135deg, rgba(204,0,41,0.15), rgba(255,0,51,0.08))'
                          : 'rgba(255,0,51,0.04)',
                      border: generating
                        ? '1px solid rgba(249,115,22,0.25)'
                        : canRun
                          ? '1px solid rgba(255,0,51,0.3)'
                          : '1px solid rgba(255,0,51,0.12)',
                      color: generating
                        ? '#f97316'
                        : canRun
                          ? '#ff6680'
                          : 'rgba(255,102,128,0.35)',
                      fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                      fontWeight: 600, letterSpacing: '0.04em',
                      cursor: generating || !canRun ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {generating
                      ? `⟳ ${loadingMsg}`
                      : canRun
                        ? `▶ Executar ${currentAgent?.label?.split(' — ')[1] || 'Agente'}`
                        : 'Agente não disponível'
                    }
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
