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
  { key: 'offer',       index: 6, label: 'Definição da Oferta',     desc: 'Estrutura a oferta completa: headlines, copy de anúncios, argumentos de venda e landing page.' },
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
function ClientCard({ client, onOpenStages, onDelete }) {
  const stages    = client.stages || [];
  const doneCount = stages.filter(s => s.status === 'done').length;
  const progress  = Math.round((doneCount / STAGES_META.length) * 100);

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
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: progress === 100 ? '#22c55e' : 'var(--text-primary)' }}>
              {progress}%
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)' }}>
              {doneCount}/{STAGES_META.length}
            </div>
          </div>
          {/* Botão Info — navega para página do cliente (não propaga click do card) */}
          <Link
            href={`/dashboard/clients/${client.id}`}
            onClick={e => e.stopPropagation()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 6, textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)',
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,0,51,0.25)'; e.currentTarget.style.color = '#ff6680'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Info
          </Link>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2, transition: 'width 0.4s ease', width: `${progress}%`,
          background: progress === 100 ? 'linear-gradient(90deg,#22c55e,#16a34a)' : 'linear-gradient(90deg,#ff0033,#ff6680)',
        }} />
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)' }}>
            {new Date(client.created_at).toLocaleDateString('pt-BR')}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDelete(client.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff1a4d'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            remover
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Popup de etapas do cliente ── */
const AGENT_DISPLAY_NAME = {
  agente1: 'Diagnóstico', agente2a: 'Pesquisa Concorrentes', agente2b: 'Análise Concorrentes',
  agente3: 'Público-Alvo', agente4a: 'Pesquisa Avatar', agente4b: 'Construção Avatar',
  agente5: 'Posicionamento', agente6: 'Oferta',
};

function ClientStagesPopup({ client, onClose, onStageUpdated, onReloadClient }) {
  const { notify } = useNotification();
  const [openMeta, setOpenMeta] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [pipelinePolling, setPipelinePolling] = useState(false);
  const [timeline, setTimeline]     = useState([]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [showExport, setShowExport]   = useState(false);
  const [exportOnlyDone, setExportOnlyDone] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const stages    = client.stages || [];
  const doneCount = stages.filter(s => s.status === 'done').length;
  const progress  = Math.round((doneCount / STAGES_META.length) * 100);

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
      if (data && data.status !== 'running' && data.status !== 'awaiting_review') {
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setShowPipeline(true)}
                style={{
                  padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                  border: client.form_done
                    ? '1px solid rgba(255,0,51,0.3)'
                    : '1px solid rgba(82,82,82,0.3)',
                  background: client.form_done
                    ? 'rgba(255,0,51,0.08)'
                    : 'rgba(82,82,82,0.08)',
                  color: client.form_done ? '#ff6680' : '#525252',
                  fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
                }}
                title={!client.form_done ? 'Aguardando formulário do cliente' : ''}
              >
                {'\u25B6'} Pipeline
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowExport(v => !v)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${showExport ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    background: showExport ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.02)',
                    color: showExport ? '#a855f7' : 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
                  }}
                >
                  Exportar
                </button>
                {showExport && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 50,
                    width: 220, padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(12,12,12,0.98)', border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Exportar Base
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, cursor: 'pointer' }}>
                      <input
                        type="checkbox" checked={exportOnlyDone}
                        onChange={e => setExportOnlyDone(e.target.checked)}
                        style={{ accentColor: '#ff0033' }}
                      />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-secondary)' }}>
                        Somente concluídas
                      </span>
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => {
                          window.open(`/api/clients/${client.id}/export?format=docx${exportOnlyDone ? '&onlyDone=true' : ''}`, '_blank');
                          setShowExport(false);
                        }}
                        style={{
                          flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer',
                          background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
                          color: '#3b82f6', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
                        }}
                      >
                        DOCX
                      </button>
                      <button
                        onClick={() => {
                          window.open(`/api/clients/${client.id}/export?format=pdf${exportOnlyDone ? '&onlyDone=true' : ''}`, '_blank');
                          setShowExport(false);
                        }}
                        style={{
                          flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer',
                          background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.25)',
                          color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
                        }}
                      >
                        PDF
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <Link href={`/dashboard/clients/${client.id}?tab=database`} style={{
                padding: '5px 12px', borderRadius: 6, textDecoration: 'none',
                border: '1px solid rgba(255,0,51,0.25)', background: 'rgba(255,0,51,0.06)',
                color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
              }}>
                Ver info completa
              </Link>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
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

          {/* Status: Aguardando revisão */}
          {pipelineStatus?.status === 'awaiting_review' && (
            <div style={{
              margin: '0 22px', padding: '10px 14px', borderRadius: 8,
              background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#eab308',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 600, color: '#eab308' }}>
                    Aguardando revisão — {pipelineStatus.completedAgents}/{pipelineStatus.totalAgents} agentes
                  </div>
                  {pipelineStatus.currentAgent && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Próximo: {AGENT_DISPLAY_NAME[pipelineStatus.currentAgent] || pipelineStatus.currentAgent}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    const r = await fetch(`/api/agentes/pipeline/${pipelineStatus.jobId}/approve`, { method: 'POST' });
                    const d = await r.json();
                    if (d.success) {
                      notify('Etapa aprovada! Pipeline continuando...', 'success');
                      setPipelineStatus(prev => ({ ...prev, status: 'running' }));
                      setPipelinePolling(true);
                    } else {
                      notify(d.error || 'Erro ao aprovar', 'error');
                    }
                  } catch {
                    notify('Erro ao aprovar etapa', 'error');
                  }
                }}
                style={{
                  padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                  color: '#22c55e', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                Aprovar e continuar
              </button>
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

          {/* Timeline toggle */}
          <div style={{ padding: '0 22px 16px', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={async () => {
                if (!showTimeline) {
                  setLoadingTimeline(true);
                  try {
                    const r = await fetch(`/api/clients/${client.id}/pipeline-timeline`);
                    const d = await r.json();
                    if (d.success) setTimeline(d.data);
                  } catch {}
                  setLoadingTimeline(false);
                }
                setShowTimeline(prev => !prev);
              }}
              style={{
                padding: '4px 14px', borderRadius: 6, cursor: 'pointer',
                background: showTimeline ? 'rgba(255,0,51,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${showTimeline ? 'rgba(255,0,51,0.2)' : 'rgba(255,255,255,0.06)'}`,
                color: showTimeline ? '#ff6680' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
              }}
            >
              {loadingTimeline ? '...' : showTimeline ? 'Ocultar Timeline' : 'Ver Timeline'}
            </button>
          </div>

          {/* Timeline visual */}
          {showTimeline && timeline.length > 0 && (
            <div style={{ padding: '0 22px 22px' }}>
              <div style={{ position: 'relative', paddingLeft: 24 }}>
                {/* Linha vertical */}
                <div style={{
                  position: 'absolute', left: 7, top: 4, bottom: 4, width: 2,
                  background: 'linear-gradient(180deg, rgba(255,0,51,0.4), rgba(255,0,51,0.08))',
                  borderRadius: 1,
                }} />

                {timeline.map((item, i) => {
                  const isDone    = item.status === 'done';
                  const isActive  = item.status === 'in_progress';
                  const dotColor  = isDone ? '#22c55e' : isActive ? '#f97316' : '#525252';
                  const dotShadow = isDone ? '0 0 6px rgba(34,197,94,0.4)' : 'none';

                  return (
                    <div
                      key={`${item.stageKey}-${item.agentName}`}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        marginBottom: i < timeline.length - 1 ? 10 : 0,
                        opacity: 0, animation: `fadeInUp 0.35s ease-out ${i * 0.05}s both`,
                      }}
                    >
                      {/* Ponto na linha */}
                      <div style={{
                        position: 'absolute', left: 4,
                        width: 8, height: 8, borderRadius: '50%',
                        background: dotColor, boxShadow: dotShadow,
                        marginTop: 5, flexShrink: 0,
                      }} />

                      {/* Card */}
                      <div style={{
                        flex: 1, padding: '6px 10px', borderRadius: 6,
                        background: 'rgba(255,255,255,0.02)',
                        border: `1px solid rgba(255,255,255,${isDone ? '0.06' : '0.03'})`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
                            color: isDone ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}>
                            {AGENT_DISPLAY_NAME[item.agentName] || item.agentName}
                          </span>
                          {item.version && (
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: '0.48rem', fontWeight: 600,
                              padding: '1px 5px', borderRadius: 3,
                              background: 'rgba(255,0,51,0.06)', color: '#ff6680',
                            }}>
                              v{item.version}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
                          {item.executedAt && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)' }}>
                              {new Date(item.executedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          {item.modelUsed && (
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: '0.48rem',
                              padding: '1px 5px', borderRadius: 3,
                              background: item.modelUsed.includes('claude') ? 'rgba(168,85,247,0.08)' : 'rgba(59,130,246,0.08)',
                              color: item.modelUsed.includes('claude') ? '#a855f7' : '#3b82f6',
                            }}>
                              {item.modelUsed.includes('claude') ? 'Claude' : item.modelUsed.includes('mini') ? 'GPT-4o Mini' : 'GPT-4o'}
                            </span>
                          )}
                          {!item.executedAt && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: '#525252' }}>
                              Pendente
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

      {/* Pipeline modal */}
      {showPipeline && (
        <PipelineModal
          client={client}
          onClose={() => setShowPipeline(false)}
          onComplete={() => {
            setShowPipeline(false);
            onReloadClient?.(client.id);
          }}
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

  const totalDone   = clients.reduce((acc, c) => acc + (c.stages || []).filter(s => s.status === 'done').length, 0);
  const totalStages = clients.length * STAGES_META.length;

  return (
    <DashboardLayout activeTab="database">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title">Base de Dados</h1>
            <p className="page-subtitle">Pipeline de marketing — clique em um cliente para ver as etapas</p>
          </div>
          <Link href="/dashboard/form" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', borderRadius: 8,
            background: 'rgba(255,0,51,0.1)', border: '1px solid rgba(255,0,51,0.3)',
            color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
            fontWeight: 600, letterSpacing: '0.04em', textDecoration: 'none',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novo Cliente
          </Link>
        </div>
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
        <ClientCard key={c.id} client={c} onOpenStages={setSelectedClient} onDelete={handleDelete} />
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
    </DashboardLayout>
  );
}
