/**
 * pages/dashboard/database.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Base de Dados — visão geral do pipeline por cliente.
 * Clicar em um cliente abre popup com seus 6 cards de etapa.
 * Clicar em uma etapa abre o StageModal (editor + agente).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import StageModal from '../../components/StageModal';
import PipelineModal from '../../components/PipelineModal';
import { useNotification } from '../../context/NotificationContext';

const STAGES_META = [
  { key: 'diagnosis',   index: 1, label: 'Diagnóstico do Negócio',  desc: 'Organiza os dados do cadastro e gera uma análise estratégica do negócio, produto e mercado.' },
  { key: 'competitors', index: 2, label: 'Análise de Concorrentes',  desc: 'Pesquisa e analisa os principais concorrentes: preço, posicionamento, pontos fortes e fracos.' },
  { key: 'audience',    index: 3, label: 'Público-Alvo',            desc: 'Define o perfil do público: demográfico, psicográfico, comportamental e nível de consciência.' },
  { key: 'avatar',      index: 4, label: 'Construção do Avatar',    desc: 'Constrói o cliente ideal com dores reais, desejos, objeções e linguagem que ele usa.' },
  { key: 'positioning', index: 5, label: 'Posicionamento da Marca', desc: 'Define como a marca se diferencia: proposta de valor, vantagem competitiva e promessa.' },
];

const STATUS_COLORS = {
  pending:     { bg: 'rgba(82,82,82,0.15)',   border: 'rgba(82,82,82,0.35)',   dot: '#525252',  label: 'Pendente'     },
  in_progress: { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)', dot: '#f97316',  label: 'Em andamento' },
  done:        { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)',  dot: '#22c55e',  label: 'Concluído'    },
};

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function Avatar({ src, name, size = 32 }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return <img src={src} onError={() => setErr(true)} alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(255,0,51,0.1)', border: '1px solid rgba(255,0,51,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontSize: size * 0.35, fontWeight: 700, color: '#ff6680',
    }}>
      {initials(name)}
    </div>
  );
}

/* ── Card de cliente — abre popup ao clicar ── */
function ClientCard({ client, onOpenStages, onDelete, onRunPipeline, onExport, onReset }) {
  const validKeys = new Set(STAGES_META.map(s => s.key));
  const stages    = (client.stages || []).filter(s => validKeys.has(s.stage_key));
  const doneCount = stages.filter(s => s.status === 'done').length;
  const progress  = Math.min(100, Math.round((doneCount / STAGES_META.length) * 100));

  function getStageStatus(key) {
    const s = stages.find(s => s.stage_key === key);
    return s ? s.status : 'pending';
  }

  return (
    <div
      className="glass-card glass-card-hover"
      onClick={() => onOpenStages(client)}
      style={{ padding: '18px 22px', marginBottom: 8, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11 }}>
        <Avatar src={client.logo_url} name={client.company_name} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {client.company_name}
            </span>
            {client.niche && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                {client.niche}
              </span>
            )}
          </div>
          {client.region && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
              {client.region}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); onRunPipeline?.(client); }}
            title={!client.form_done ? 'Aguardando formulario' : 'Rodar pipeline'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: client.form_done ? 'rgba(255,0,51,0.08)' : 'rgba(82,82,82,0.08)',
              color: client.form_done ? '#ff6680' : '#525252',
              fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Pipeline
          </button>
          <button
            onClick={e => { e.stopPropagation(); onExport?.(client); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'rgba(168,85,247,0.08)', color: '#a855f7',
              fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar
          </button>
          <button
            onClick={e => { e.stopPropagation(); onReset?.(client); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'rgba(255,51,51,0.06)', color: '#ff3333',
              fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Apagar
          </button>
        </div>
      </div>

      {/* Barra de progresso + porcentagem */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, transition: 'width 0.4s ease', width: `${progress}%`,
            background: progress === 100 ? 'linear-gradient(90deg,#22c55e,#16a34a)' : 'linear-gradient(90deg,#ff0033,#ff6680)',
          }} />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: progress === 100 ? '#22c55e' : 'var(--text-muted)', flexShrink: 0 }}>
          {progress}%
        </span>
      </div>

      {/* Chips de etapas */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {STAGES_META.map(stage => {
          const status = getStageStatus(stage.key);
          const c      = STATUS_COLORS[status] || STATUS_COLORS.pending;
          return (
            <div key={stage.key} title={stage.label} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 7px', borderRadius: 5,
              background: c.bg, border: `1px solid ${c.border}`,
              fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: c.dot,
            }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
              {`D${stage.index}`}
            </div>
          );
        })}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)' }}>
          {new Date(client.created_at).toLocaleDateString('pt-BR')}
        </span>
      </div>
    </div>
  );
}

/* ── Popup de etapas do cliente ── */
const AGENT_DISPLAY_NAME = {
  agente1: 'Diagnóstico', agente2a: 'Pesquisa Concorrentes', agente2b: 'Análise Concorrentes',
  agente3: 'Público-Alvo', agente4a: 'Pesquisa Avatar', agente4b: 'Construção Avatar',
  agente5: 'Posicionamento',
};

function ClientStagesPopup({ client, onClose, onStageUpdated, onReloadClient }) {
  const { notify } = useNotification();
  const [openMeta, setOpenMeta] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [pipelinePolling, setPipelinePolling] = useState(false);
  const validKeys = new Set(STAGES_META.map(s => s.key));
  const stages    = (client.stages || []).filter(s => validKeys.has(s.stage_key));
  const doneCount = stages.filter(s => s.status === 'done').length;
  const progress  = Math.min(100, Math.round((doneCount / STAGES_META.length) * 100));

  useEffect(() => {
    const h = e => { if (e.key === 'Escape' && !openMeta) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, openMeta]);

  // Verifica se já existe pipeline rodando ao abrir
  useEffect(() => {
    checkPipelineStatus();
  }, []);

  // Polling de status do pipeline
  useEffect(() => {
    if (!pipelinePolling) return;
    const interval = setInterval(async () => {
      const data = await checkPipelineStatus();
      if (data && data.status !== 'running') {
        setPipelinePolling(false);
        clearInterval(interval);
        if (data.status === 'completed') {
          notify('Pipeline concluído com sucesso!', 'success');
        } else if (data.status === 'failed') {
          notify('Pipeline falhou: ' + (data.error || 'erro desconhecido'), 'error');
        }
        onReloadClient?.(client.id);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [pipelinePolling]);

  async function checkPipelineStatus() {
    try {
      const r = await fetch(`/api/agentes/pipeline/status?clientId=${client.id}`);
      const d = await r.json();
      if (d.success && d.data) {
        setPipelineStatus(d.data);
        if (d.data.status === 'running') setPipelinePolling(true);
        return d.data;
      }
    } catch {}
    return null;
  }

  async function handleRunPipeline() {
    if (!confirm(`Isso vai rodar todos os 8 agentes em sequência para "${client.company_name}".\nPode levar de 3 a 8 minutos. Continuar?`)) return;
    try {
      console.log('[INFO][Frontend:Database] Iniciando pipeline completo', { clientId: client.id });
      const r = await fetch('/api/agentes/pipeline/run-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      });
      const d = await r.json();
      if (!d.success) {
        notify(d.error || 'Erro ao iniciar pipeline', 'error');
        return;
      }
      notify('Pipeline iniciado! Acompanhe o progresso nos cards abaixo.', 'info');
      setPipelineStatus({ status: 'running', completedAgents: 0, totalAgents: 8, currentAgent: 'agente1' });
      setPipelinePolling(true);
    } catch (err) {
      console.error('[ERRO][Frontend:Database] Falha ao iniciar pipeline', { error: err.message });
      notify('Erro ao iniciar pipeline', 'error');
    }
  }

  function getStage(key) { return stages.find(s => s.stage_key === key) || null; }

  const STATUS_CFG = {
    pending:     { label: 'Pendente',     color: '#525252', bg: 'rgba(82,82,82,0.12)',   border: 'rgba(82,82,82,0.3)'   },
    in_progress: { label: 'Em andamento', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
    done:        { label: 'Concluído',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)'  },
  };

  return (
    <>
      {/* Backdrop do popup */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 780,
            background: 'linear-gradient(145deg, rgba(12,12,12,0.99), rgba(6,6,6,0.99))',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, overflow: 'hidden',
          }}
        >
          {/* Header do popup */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar src={client.logo_url} name={client.company_name} size={36} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {client.company_name}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  {doneCount}/{STAGES_META.length} etapas concluídas · {progress}% do pipeline
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Status do pipeline (se ativo) */}
          {pipelineStatus?.status === 'running' && (
            <div style={{
              margin: '0 22px', padding: '8px 14px', borderRadius: 8,
              background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', background: '#f97316',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600, color: '#f97316' }}>
                  Pipeline em andamento — {pipelineStatus.completedAgents}/{pipelineStatus.totalAgents} agentes
                </div>
                {pipelineStatus.currentAgent && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Executando: {pipelineStatus.currentAgent}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Barra de progresso */}
          <div style={{ padding: '12px 22px 0' }}>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, transition: 'width 0.4s ease', width: `${progress}%`,
                background: progress === 100 ? 'linear-gradient(90deg,#22c55e,#16a34a)' : 'linear-gradient(90deg,#ff0033,#ff6680)',
              }} />
            </div>
          </div>

          {/* Grade de etapas */}
          <div style={{ padding: '16px 22px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {STAGES_META.map(meta => {
              const stage  = getStage(meta.key);
              const status = stage?.status || 'pending';
              const c      = STATUS_CFG[status];
              const hasNotes = !!stage?.notes;

              return (
                <div
                  key={meta.key}
                  onClick={() => setOpenMeta(meta)}
                  style={{
                    padding: '13px 15px', borderRadius: 10, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.05)',
                    background: 'rgba(255,255,255,0.02)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,0,51,0.2)'; e.currentTarget.style.background = 'rgba(255,0,51,0.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: status === 'done' ? 'rgba(34,197,94,0.1)' : 'rgba(255,0,51,0.06)',
                        border: status === 'done' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,0,51,0.1)',
                        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
                        color: status === 'done' ? '#22c55e' : '#ff6680',
                      }}>
                        {String(meta.index).padStart(2, '0')}
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {meta.label}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.56rem', fontWeight: 600,
                      padding: '1px 6px', borderRadius: 20,
                      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
                    }}>
                      {c.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: hasNotes ? '#22c55e' : '#525252' }}>
                      {hasNotes ? '● notas' : '○ sem notas'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'rgba(255,102,128,0.5)' }}>
                      Abrir →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* Stage modal (sobreposto ao popup) */}
      {openMeta && (
        <StageModal
          meta={openMeta}
          stage={getStage(openMeta.key)}
          clientId={client.id}
          clientData={client}
          onClose={() => setOpenMeta(null)}
          onSaved={(updated) => onStageUpdated(client.id, openMeta.key, updated)}
        />
      )}

    </>
  );
}

/* ── Página ── */
export default function DatabasePage() {
  const { notify } = useNotification();
  const [clients,        setClients       ] = useState([]);
  const [loading,        setLoading       ] = useState(true);
  const [error,          setError         ] = useState(null);
  const [search,         setSearch        ] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [pipelineClient, setPipelineClient] = useState(null);
  const [resetClient, setResetClient]       = useState(null);
  const [resetConfirmText, setResetConfirmText] = useState('');

  async function load() {
    setLoading(true); setError(null);
    try {
      console.log('[INFO][Frontend:Database] Carregando clientes...');
      const res  = await fetch('/api/clients');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      console.log('[SUCESSO][Frontend:Database] Clientes carregados', { total: json.clients.length });
      const withStages = await Promise.all(
        json.clients.map(async c => {
          try {
            const r = await fetch(`/api/clients/${c.id}/stages`);
            const j = await r.json();
            return { ...c, stages: j.success ? j.stages : [] };
          } catch { return { ...c, stages: [] }; }
        })
      );
      console.log('[SUCESSO][Frontend:Database] Etapas carregadas para todos os clientes');
      setClients(withStages);
    } catch (err) {
      setError(err.message);
      console.error('[ERRO][Frontend:Database] Erro ao carregar clientes', { error: err.message });
      notify('Erro ao carregar clientes', 'error');
    }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id) {
    if (!confirm('Remover cliente e etapas?')) return;
    try {
      console.log('[INFO][Frontend:Database] Removendo cliente', { id });
      await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      setClients(p => p.filter(c => c.id !== id));
      if (selectedClient?.id === id) setSelectedClient(null);
      console.log('[SUCESSO][Frontend:Database] Cliente removido', { id });
      notify('Cliente removido com sucesso', 'success');
    } catch (err) {
      console.error('[ERRO][Frontend:Database] Erro ao remover cliente', { error: err.message });
      notify('Erro ao remover cliente', 'error');
    }
  }

  function handleStageUpdated(clientId, stageKey, updated) {
    setClients(prev => prev.map(c =>
      c.id !== clientId ? c : {
        ...c,
        stages: c.stages.map(s => s.stage_key === stageKey ? { ...s, ...updated } : s),
      }
    ));
    // Atualiza selectedClient também
    setSelectedClient(prev => {
      if (!prev || prev.id !== clientId) return prev;
      return {
        ...prev,
        stages: prev.stages.map(s => s.stage_key === stageKey ? { ...s, ...updated } : s),
      };
    });
  }

  const filtered = clients.filter(c =>
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.niche?.toLowerCase().includes(search.toLowerCase())
  );

  const validKeysSet = new Set(STAGES_META.map(s => s.key));
  const totalDone   = clients.reduce((acc, c) => acc + (c.stages || []).filter(s => validKeysSet.has(s.stage_key) && s.status === 'done').length, 0);
  const totalStages = clients.length * STAGES_META.length;

  return (
    <DashboardLayout activeTab="database">
      <div className="page-header">
        <h1 className="page-title">Base de Dados</h1>
        <p className="page-subtitle">Pipeline de marketing — clique em um cliente para ver as etapas</p>
      </div>

      {/* KPIs */}
      {clients.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Clientes',          value: clients.length,          color: 'var(--text-primary)' },
            { label: 'Etapas Concluídas', value: totalDone,               color: '#22c55e' },
            { label: 'Pendentes',         value: totalStages - totalDone, color: '#f97316' },
          ].map(s => (
            <div key={s.label} className="glass-card" style={{ padding: '12px 16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 2 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Busca */}
      {clients.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <input
            type="text" placeholder="Buscar cliente..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', maxWidth: 340, padding: '7px 12px',
              background: 'rgba(17,17,17,0.8)', border: '1px solid var(--border-default)',
              borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.78rem',
              fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Estados */}
      {loading && (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>// carregando...</span>
        </div>
      )}
      {error && (
        <div className="glass-card" style={{ padding: 18, borderColor: 'rgba(255,26,77,0.3)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ff6680' }}>// erro: {error}</span>
        </div>
      )}
      {!loading && !error && clients.length === 0 && (
        <div className="glass-card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            // nenhum cliente cadastrado
          </div>
          <Link href="/dashboard/form" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#ff6680', textDecoration: 'none', borderBottom: '1px solid rgba(255,102,128,0.3)' }}>
            Cadastrar primeiro cliente →
          </Link>
        </div>
      )}

      {!loading && !error && filtered.map(c => (
        <ClientCard key={c.id} client={c} onOpenStages={setSelectedClient} onDelete={handleDelete} onRunPipeline={c => setPipelineClient(c)} onExport={c => window.open('/api/clients/' + c.id + '/export?format=pdf', '_blank')} onReset={c => { setResetClient(c); setResetConfirmText(''); }} />
      ))}

      {!loading && !error && clients.length > 0 && filtered.length === 0 && (
        <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            // sem resultados para "{search}"
          </span>
        </div>
      )}

      {/* Popup de etapas */}
      {selectedClient && (
        <ClientStagesPopup
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onStageUpdated={handleStageUpdated}
          onReloadClient={async (clientId) => {
            try {
              const r = await fetch(`/api/clients/${clientId}/stages`);
              const j = await r.json();
              const newStages = j.success ? j.stages : [];
              setClients(prev => prev.map(c => c.id === clientId ? { ...c, stages: newStages } : c));
              setSelectedClient(prev => prev?.id === clientId ? { ...prev, stages: newStages } : prev);
            } catch {}
          }}
        />
      )}

      {/* Pipeline modal (disparado do botão no card) */}
      {pipelineClient && (
        <PipelineModal
          client={pipelineClient}
          onClose={() => setPipelineClient(null)}
          onComplete={() => { setPipelineClient(null); load(); }}
        />
      )}

      {/* Modal de reset/apagar */}
      {resetClient && (
        <div onClick={() => setResetClient(null)} style={{
          position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 480, padding: '32px 36px', borderRadius: 16,
            background: 'linear-gradient(145deg, rgba(14,14,14,0.99), rgba(8,8,8,0.99))',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {/* Header com icone */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff3333" strokeWidth="1.5" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Apagar base de dados
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  Esta acao nao pode ser desfeita.
                </div>
              </div>
            </div>

            {/* Texto de confirmacao */}
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: 12,
            }}>
              DIGITE <span style={{ color: '#ff3333' }}>APAGAR BASE</span> PARA CONFIRMAR
            </div>
            <input
              type="text" value={resetConfirmText} onChange={e => setResetConfirmText(e.target.value)}
              placeholder="APAGAR BASE"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '12px 16px', marginBottom: 20,
                background: 'rgba(10,10,10,0.6)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)', outline: 'none', letterSpacing: '0.04em',
              }}
            />

            {/* Botoes */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setResetClient(null)} style={{
                flex: 1, padding: '12px 0', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>CANCELAR</button>
              <button
                disabled={resetConfirmText !== 'APAGAR BASE'}
                onClick={async () => {
                  try {
                    await fetch('/api/clients/' + resetClient.id + '/reset-database', { method: 'POST' });
                    notify('Base de dados apagada', 'success');
                    setResetClient(null);
                    load();
                  } catch { notify('Erro ao apagar', 'error'); }
                }}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 8,
                  cursor: resetConfirmText !== 'APAGAR BASE' ? 'not-allowed' : 'pointer',
                  background: resetConfirmText === 'APAGAR BASE' ? 'rgba(255,51,51,0.15)' : 'rgba(255,51,51,0.04)',
                  border: '1px solid rgba(255,51,51,0.25)',
                  color: resetConfirmText === 'APAGAR BASE' ? '#ff3333' : '#525252',
                  fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  opacity: resetConfirmText !== 'APAGAR BASE' ? 0.4 : 1,
                }}>APAGAR TUDO</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
