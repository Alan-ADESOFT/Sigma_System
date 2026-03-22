/**
 * components/PipelineModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal fullscreen de execução do pipeline completo.
 * Mostra lista de agentes à esquerda, streaming à direita.
 * Verifica pré-condições: form_done e pipeline já executado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import { useNotification } from '../context/NotificationContext';
import styles from '../assets/style/pipelineModal.module.css';

const AGENTS = [
  { name: 'agente1',  num: '01', label: 'Diagnóstico do Negócio' },
  { name: 'agente2a', num: '02A', label: 'Pesquisa de Concorrentes' },
  { name: 'agente2b', num: '02B', label: 'Análise de Concorrentes' },
  { name: 'agente3',  num: '03', label: 'Público-Alvo' },
  { name: 'agente4a', num: '04A', label: 'Pesquisa de Avatar' },
  { name: 'agente4b', num: '04B', label: 'Construção do Avatar' },
  { name: 'agente5',  num: '05', label: 'Posicionamento da Marca' },
  { name: 'agente6',  num: '06', label: 'Definição da Oferta' },
];

export default function PipelineModal({ client, onClose, onComplete }) {
  const { notify } = useNotification();
  const [phase, setPhase]             = useState('checking'); // checking | blocked | already_done | ready | running | done | error
  const [completedJob, setCompletedJob] = useState(null);
  const [jobId, setJobId]             = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(0);
  const [agentStatuses, setAgentStatuses] = useState(AGENTS.map(() => 'waiting')); // waiting | running | done | failed
  const [connectorActive, setConnectorActive] = useState(-1);
  const [streamedText, setStreamedText] = useState('');
  const [logs, setLogs]               = useState([]);
  const [errorMsg, setErrorMsg]       = useState('');

  const logEndRef    = useRef(null);
  const streamEndRef = useRef(null);
  const sseRef       = useRef(null);
  const pollingRef   = useRef(null);
  const startTimeRef = useRef(null);

  // Auto-scroll
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => { streamEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [streamedText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Check pré-condições ao montar
  useEffect(() => {
    checkPreConditions();
  }, []);

  async function checkPreConditions() {
    // 1. Form não preenchido?
    if (!client.form_done) {
      setPhase('blocked');
      return;
    }

    // 2. Pipeline já executado?
    try {
      const r = await fetch(`/api/agentes/pipeline/status?clientId=${client.id}`);
      const d = await r.json();
      if (d.success && d.data?.status === 'completed') {
        setCompletedJob(d.data);
        setPhase('already_done');
        return;
      }
      // Se está running, reconecta
      if (d.success && d.data?.status === 'running') {
        setJobId(d.data.jobId);
        setPhase('running');
        startPolling(d.data.jobId);
        connectSSE(d.data.jobId);
        return;
      }
    } catch {}

    setPhase('ready');
  }

  function addLog(message, type = 'log') {
    const elapsed = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0;
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    setLogs(prev => [...prev, { message, type, time: `${mm}:${ss}` }]);
  }

  async function handleStart() {
    setPhase('running');
    startTimeRef.current = Date.now();
    addLog('Iniciando pipeline...');

    try {
      const r = await fetch('/api/agentes/pipeline/run-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      });
      const d = await r.json();
      if (!d.success) {
        setErrorMsg(d.error || 'Erro ao iniciar');
        setPhase('error');
        return;
      }

      setJobId(d.jobId);
      addLog('Pipeline iniciado — conectando stream...');
      startPolling(d.jobId);
      connectSSE(d.jobId);

    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  function startPolling(jId) {
    pollingRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/agentes/pipeline/status?clientId=${client.id}`);
        const d = await r.json();
        if (!d.success || !d.data) return;

        const { status, completedAgents, currentAgent } = d.data;

        // Atualiza statuses dos agentes
        setAgentStatuses(prev => {
          const next = [...prev];
          for (let i = 0; i < AGENTS.length; i++) {
            if (i < completedAgents) next[i] = 'done';
            else if (AGENTS[i].name === currentAgent) next[i] = 'running';
            else if (next[i] !== 'done') next[i] = 'waiting';
          }
          return next;
        });

        // Seleciona automaticamente o agente ativo
        if (currentAgent) {
          const idx = AGENTS.findIndex(a => a.name === currentAgent);
          if (idx >= 0) setSelectedAgent(idx);
        }

        // Anima connector quando agente muda
        if (completedAgents > 0) {
          setConnectorActive(completedAgents - 1);
          setTimeout(() => setConnectorActive(-1), 800);
        }

        if (status === 'completed') {
          clearInterval(pollingRef.current);
          setAgentStatuses(AGENTS.map(() => 'done'));
          setPhase('done');
          addLog('Pipeline concluído com sucesso!', 'success');
        } else if (status === 'failed') {
          clearInterval(pollingRef.current);
          setErrorMsg(d.data.error || 'Erro no pipeline');
          setPhase('error');
          addLog(`Erro: ${d.data.error || 'desconhecido'}`, 'error');
        }
      } catch {}
    }, 3000);
  }

  function connectSSE(jId) {
    // Pequeno delay para dar tempo do emitter ser criado no backend
    setTimeout(() => {
      try {
        const evtSource = new EventSource(`/api/agentes/stream-log?jobId=${jId}`);
        sseRef.current = evtSource;

        evtSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            switch (data.type) {
              case 'agent_start':
                addLog(`Iniciando ${data.agentName}...`);
                setStreamedText('');
                break;
              case 'agent_done':
                addLog(`${data.agentName} concluído (${data.textLength} chars)`, 'success');
                break;
              case 'pipeline_done':
                evtSource.close();
                break;
              case 'pipeline_error':
                addLog(`Erro: ${data.message}`, 'error');
                evtSource.close();
                break;
            }
          } catch {}
        };

        evtSource.onerror = () => {
          evtSource.close();
        };
      } catch {}
    }, 1000);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.badge}>PIPELINE</span>
            <span className={styles.clientName}>{client.company_name}</span>
            <span className={styles.subtitle}>Pipeline de 8 agentes \u00B7 Gera\u00E7\u00E3o \u00FAnica de rascunhos</span>
          </div>
          <div className={styles.headerRight}>
            {phase === 'ready' && (
              <button className={styles.btnStart} onClick={handleStart}>
                \u25B6 Iniciar Pipeline
              </button>
            )}
            <button className={styles.btnClose} onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Coluna esquerda — lista de agentes (só aparece quando não é tela de bloqueio) */}
          {(phase === 'ready' || phase === 'running' || phase === 'done' || phase === 'error') && (
            <div className={styles.agentList}>
              {AGENTS.map((agent, i) => {
                const st = agentStatuses[i];
                const isActive = selectedAgent === i && phase === 'running';
                return (
                  <div key={agent.name}>
                    <div
                      className={`${styles.agentCard} ${isActive ? styles.agentCardActive : ''} ${st === 'done' ? styles.agentCardDone : ''}`}
                      onClick={() => setSelectedAgent(i)}
                    >
                      <div className={styles.agentNum}>{agent.num}</div>
                      <div className={styles.agentName}>{agent.label}</div>
                      <div className={`${styles.agentStatus} ${st === 'waiting' ? styles.statusWaiting : st === 'running' ? styles.statusRunning : st === 'done' ? styles.statusDone : styles.statusFailed}`}>
                        <span className={`${styles.dot} ${st === 'waiting' ? styles.dotWaiting : st === 'running' ? styles.dotRunning : st === 'done' ? styles.dotDone : styles.dotFailed}`} />
                        {st === 'waiting' ? 'AGUARDANDO' : st === 'running' ? 'RODANDO...' : st === 'done' ? 'CONCLU\u00CDDO' : 'FALHOU'}
                      </div>
                    </div>
                    {i < AGENTS.length - 1 && (
                      <div className={`${styles.connector} ${connectorActive === i ? styles.connectorActive : ''}`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Coluna direita */}
          <div className={styles.mainArea}>
            {/* Tela de bloqueio: form não preenchido */}
            {phase === 'blocked' && (
              <div className={styles.blocked}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <div className={styles.blockedTitle}>Pipeline bloqueado</div>
                <div className={styles.blockedDesc}>
                  O cliente ainda n\u00E3o preencheu o formul\u00E1rio de briefing.
                  Envie o link do formul\u00E1rio e aguarde a resposta para liberar o pipeline.
                </div>
              </div>
            )}

            {/* Tela de bloqueio: pipeline já executado */}
            {phase === 'already_done' && (
              <div className={styles.blocked}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div className={styles.blockedTitle} style={{ color: '#ff6680' }}>Pipeline j\u00E1 executado</div>
                <div className={styles.blockedDesc}>
                  O pipeline deste cliente foi executado
                  {completedJob?.finishedAt ? ` em ${new Date(completedJob.finishedAt).toLocaleDateString('pt-BR')}` : ''}.
                  Acesse cada etapa na Base de Dados para editar os rascunhos.
                </div>
                <button className={styles.btnGo} onClick={() => { onComplete?.(); onClose(); }}>
                  Ver Base de Dados \u2192
                </button>
              </div>
            )}

            {/* Tela de pré-execução */}
            {phase === 'ready' && (
              <div className={styles.preRun}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff6680" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                  <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
                </svg>
                <div className={styles.preRunTitle}>Pronto para iniciar</div>
                <div className={styles.preRunDesc}>
                  O pipeline vai analisar os dados do formul\u00E1rio de {client.company_name} e gerar rascunhos para todas as 8 etapas estrat\u00E9gicas.
                </div>
                <div className={styles.preRunList}>
                  \u2022 Diagn\u00F3stico \u2022 Concorrentes \u2022 P\u00FAblico-Alvo \u2022 Avatar<br/>
                  \u2022 Posicionamento \u2022 Oferta + 2 etapas de pesquisa
                </div>
                <div className={styles.preRunDesc}>
                  Os rascunhos ficar\u00E3o dispon\u00EDveis para edi\u00E7\u00E3o na Base de Dados.
                </div>
                <button className={styles.btnStart} onClick={handleStart}>
                  \u25B6 Iniciar Pipeline
                </button>
              </div>
            )}

            {/* Tela de checking */}
            {phase === 'checking' && (
              <div className={styles.preRun}>
                <div className={styles.preRunDesc}>Verificando pré-condições...</div>
              </div>
            )}

            {/* Streaming durante execução */}
            {phase === 'running' && (
              <>
                <div className={styles.streamHeader}>
                  <div className={styles.streamTitle}>{AGENTS[selectedAgent]?.label}</div>
                  <div className={styles.streamProgress}>
                    Agente {agentStatuses.filter(s => s === 'done').length + 1} de {AGENTS.length}
                  </div>
                </div>
                <div className={styles.streamBody}>
                  {streamedText ? (
                    <div className={`${styles.streamText} ${styles.streamCursor}`}>
                      {streamedText}
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#525252' }}>
                      Aguardando output do agente...
                    </div>
                  )}
                  <div ref={streamEndRef} />
                </div>
                <div className={styles.logArea}>
                  {logs.map((log, i) => (
                    <div key={i} className={`${styles.logLine} ${log.type === 'success' ? styles.logSuccess : log.type === 'error' ? styles.logError : ''}`}>
                      <span className={styles.logTime}>{log.time}</span>
                      <span>{log.type === 'success' ? '\u2713' : log.type === 'error' ? '!' : '\u25B8'} {log.message}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </>
            )}

            {/* Tela de sucesso */}
            {phase === 'done' && (
              <div className={styles.success}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" opacity="0.3"/>
                  <polyline points="9 12 12 15 16 10" className={styles.checkIcon}/>
                </svg>
                <div className={styles.successTitle}>Pipeline conclu\u00EDdo com sucesso!</div>
                <div className={styles.successDesc}>
                  8 rascunhos gerados e salvos na Base de Dados.<br/>
                  Agora voc\u00EA pode editar cada etapa manualmente.
                </div>
                <button className={styles.btnGo} onClick={() => { onComplete?.(); onClose(); }}>
                  Ir para Base de Dados \u2192
                </button>
              </div>
            )}

            {/* Tela de erro */}
            {phase === 'error' && (
              <div className={styles.blocked}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff3333" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <div className={styles.blockedTitle} style={{ color: '#ff3333' }}>Pipeline falhou</div>
                <div className={styles.blockedDesc}>{errorMsg}</div>
                <button className={styles.btnGo} style={{ borderColor: 'rgba(255,51,51,0.3)', color: '#ff3333', background: 'rgba(255,51,51,0.06)' }} onClick={onClose}>
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
