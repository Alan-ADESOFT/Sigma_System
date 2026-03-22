/**
 * components/PipelineModal.js
 * Modal fullscreen de execucao do pipeline completo.
 * Lista de agentes a esquerda, output com typing animation a direita.
 */

import { useState, useEffect, useRef } from 'react';
import { useNotification } from '../context/NotificationContext';
import styles from '../assets/style/pipelineModal.module.css';

const AGENTS = [
  { name: 'agente1',  num: '01',  label: 'Diagnostico do Negocio' },
  { name: 'agente2a', num: '02A', label: 'Pesquisa de Concorrentes' },
  { name: 'agente2b', num: '02B', label: 'Analise de Concorrentes' },
  { name: 'agente3',  num: '03',  label: 'Publico-Alvo' },
  { name: 'agente4a', num: '04A', label: 'Pesquisa de Avatar' },
  { name: 'agente4b', num: '04B', label: 'Construcao do Avatar' },
  { name: 'agente5',  num: '05',  label: 'Posicionamento da Marca' },
];

function realTime() {
  const now = new Date();
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
}

export default function PipelineModal({ client, onClose, onComplete }) {
  const { notify } = useNotification();
  const [phase, setPhase]               = useState('checking');
  const [completedJob, setCompletedJob] = useState(null);
  const [jobId, setJobId]               = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(0);
  const [agentStatuses, setAgentStatuses] = useState(AGENTS.map(() => 'waiting'));
  const [connectorActive, setConnectorActive] = useState(-1);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping]           = useState(false);
  const [agentOutputs, setAgentOutputs]   = useState({});
  const [logs, setLogs]                   = useState([]);
  const [errorMsg, setErrorMsg]           = useState('');

  const logEndRef     = useRef(null);
  const streamEndRef  = useRef(null);
  const pollingRef    = useRef(null);
  const typingRef     = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => { streamEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [displayedText]);
  useEffect(() => { return () => { if (pollingRef.current) clearInterval(pollingRef.current); if (typingRef.current) clearInterval(typingRef.current); }; }, []);
  useEffect(() => { checkPreConditions(); }, []);

  function typeText(text) {
    if (typingRef.current) clearInterval(typingRef.current);
    setDisplayedText('');
    setIsTyping(true);
    let i = 0;
    const chunkSize = Math.max(2, Math.floor(text.length / 300));
    typingRef.current = setInterval(() => {
      i += chunkSize;
      if (i >= text.length) {
        setDisplayedText(text);
        setIsTyping(false);
        clearInterval(typingRef.current);
      } else {
        setDisplayedText(text.substring(0, i));
      }
    }, 8);
  }

  function handleSelectAgent(idx) {
    setSelectedAgent(idx);
    const agentName = AGENTS[idx]?.name;
    const output = agentOutputs[agentName];
    if (output && agentStatuses[idx] === 'done') {
      typeText(output);
    } else if (agentStatuses[idx] === 'waiting') {
      setDisplayedText('');
      setIsTyping(false);
    }
  }

  async function checkPreConditions() {
    if (!client.form_done) { setPhase('blocked'); return; }
    try {
      const r = await fetch('/api/agentes/pipeline/status?clientId=' + client.id);
      const d = await r.json();
      if (d.success && d.data?.status === 'completed') { setCompletedJob(d.data); setPhase('already_done'); return; }
      if (d.success && d.data?.status === 'running') { setJobId(d.data.jobId); setPhase('running'); startPolling(d.data.jobId); connectSSE(d.data.jobId); return; }
    } catch {}
    setPhase('ready');
  }

  function addLog(message, type = 'log') {
    setLogs(prev => [...prev, { message, type, time: realTime() }]);
  }

  async function handleStart() {
    setPhase('running');
    addLog('Iniciando pipeline...');
    try {
      const r = await fetch('/api/agentes/pipeline/run-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: client.id }) });
      const d = await r.json();
      if (!d.success) { setErrorMsg(d.error || 'Erro ao iniciar'); setPhase('error'); return; }
      setJobId(d.jobId);
      addLog('Pipeline iniciado com sucesso');
      startPolling(d.jobId);
      connectSSE(d.jobId);
    } catch (err) { setErrorMsg(err.message); setPhase('error'); }
  }

  function startPolling(jId) {
    pollingRef.current = setInterval(async () => {
      try {
        const r = await fetch('/api/agentes/pipeline/status?clientId=' + client.id);
        const d = await r.json();
        if (!d.success || !d.data) return;
        const { status, completedAgents, currentAgent } = d.data;

        setAgentStatuses(prev => {
          const next = [...prev];
          for (let i = 0; i < AGENTS.length; i++) {
            if (i < completedAgents) next[i] = 'done';
            else if (AGENTS[i].name === currentAgent) next[i] = 'running';
            else if (next[i] !== 'done') next[i] = 'waiting';
          }
          return next;
        });

        if (currentAgent) {
          const idx = AGENTS.findIndex(a => a.name === currentAgent);
          if (idx >= 0 && !isTyping) { setSelectedAgent(idx); setDisplayedText(''); }
        }

        if (completedAgents > 0) {
          setConnectorActive(completedAgents - 1);
          setTimeout(() => setConnectorActive(-1), 800);
        }

        if (status === 'completed') {
          clearInterval(pollingRef.current);
          setAgentStatuses(AGENTS.map(() => 'done'));
          addLog('Pipeline concluido!', 'success');
          // Mostra ultimo agente com typing antes da tela de sucesso
          const lastAgent = AGENTS[AGENTS.length - 1].name;
          if (agentOutputs[lastAgent]) {
            typeText(agentOutputs[lastAgent]);
            setTimeout(() => setPhase('done'), 3000);
          } else {
            setPhase('done');
          }
        } else if (status === 'failed') {
          clearInterval(pollingRef.current);
          setErrorMsg(d.data.error || 'Erro no pipeline');
          setPhase('error');
          addLog('Erro: ' + (d.data.error || 'desconhecido'), 'error');
        }
      } catch {}
    }, 3000);
  }

  function connectSSE(jId) {
    setTimeout(() => {
      try {
        const evtSource = new EventSource('/api/agentes/stream-log?jobId=' + jId);
        evtSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'agent_start') {
              addLog('Executando ' + data.agentName + '...');
              setDisplayedText('');
              setIsTyping(false);
            } else if (data.type === 'agent_done') {
              addLog(data.agentName + ' concluido', 'success');
              fetchAgentOutput(data.agentName);
            } else if (data.type === 'pipeline_done') {
              evtSource.close();
            } else if (data.type === 'pipeline_error') {
              addLog('Erro: ' + data.message, 'error');
              evtSource.close();
            }
          } catch {}
        };
        evtSource.onerror = () => evtSource.close();
      } catch {}
    }, 1000);
  }

  async function fetchAgentOutput(agentName) {
    try {
      const r = await fetch('/api/agentes/history?type=agent&agentName=' + agentName + '&limit=1');
      const d = await r.json();
      if (d.success && d.data?.[0]?.response_text) {
        const text = d.data[0].response_text;
        setAgentOutputs(prev => ({ ...prev, [agentName]: text }));
        const idx = AGENTS.findIndex(a => a.name === agentName);
        if (idx >= 0) {
          setSelectedAgent(idx);
          typeText(text);
        }
      }
    } catch {}
  }

  const doneCount = agentStatuses.filter(s => s === 'done').length;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.badge}>PIPELINE</span>
            <span className={styles.clientName}>{client.company_name}</span>
            <span className={styles.subtitle}>Pipeline de 7 agentes - Geracao de rascunhos</span>
          </div>
          <div className={styles.headerRight}>
            {phase === 'ready' && <button className={styles.btnStart} onClick={handleStart}>Iniciar Pipeline</button>}
            {phase === 'running' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#f97316', fontWeight: 600 }}>
                {doneCount}/{AGENTS.length} agentes
              </span>
            )}
            <button className={styles.btnClose} onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {(phase === 'ready' || phase === 'running' || phase === 'done' || phase === 'error') && (
            <div className={styles.agentList}>
              {AGENTS.map((agent, i) => {
                const st = agentStatuses[i];
                const isActive = selectedAgent === i;
                return (
                  <div key={agent.name}>
                    <div
                      className={`${styles.agentCard} ${isActive ? styles.agentCardActive : ''} ${st === 'done' ? styles.agentCardDone : ''}`}
                      onClick={() => handleSelectAgent(i)}
                      style={{ animation: st === 'done' ? 'fadeInUp 0.3s ease-out' : undefined }}
                    >
                      <div className={styles.agentNum}>{agent.num}</div>
                      <div className={styles.agentName}>{agent.label}</div>
                      <div className={`${styles.agentStatus} ${st === 'waiting' ? styles.statusWaiting : st === 'running' ? styles.statusRunning : st === 'done' ? styles.statusDone : styles.statusFailed}`}>
                        <span className={`${styles.dot} ${st === 'waiting' ? styles.dotWaiting : st === 'running' ? styles.dotRunning : st === 'done' ? styles.dotDone : styles.dotFailed}`} />
                        {st === 'waiting' ? 'AGUARDANDO' : st === 'running' ? 'RODANDO...' : st === 'done' ? 'CONCLUIDO' : 'FALHOU'}
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

          <div className={styles.mainArea}>
            {phase === 'blocked' && (
              <div className={styles.blocked}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <div className={styles.blockedTitle}>Pipeline bloqueado</div>
                <div className={styles.blockedDesc}>O cliente ainda nao preencheu o formulario de briefing. Envie o link e aguarde a resposta.</div>
              </div>
            )}

            {phase === 'already_done' && (
              <div className={styles.blocked}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="1.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <div className={styles.blockedTitle} style={{ color: '#ff6680' }}>Pipeline ja executado</div>
                <div className={styles.blockedDesc}>
                  O pipeline deste cliente foi executado{completedJob?.finishedAt ? ' em ' + new Date(completedJob.finishedAt).toLocaleDateString('pt-BR') : ''}.
                  Acesse cada etapa na Base de Dados para editar os rascunhos.
                </div>
                <button className={styles.btnGo} onClick={() => { onComplete?.(); onClose(); }}>Ver Base de Dados</button>
              </div>
            )}

            {phase === 'ready' && (
              <div className={styles.preRun}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff6680" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                  <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                </svg>
                <div className={styles.preRunTitle}>Pronto para iniciar</div>
                <div className={styles.preRunDesc}>O pipeline vai analisar os dados de {client.company_name} e gerar rascunhos para as 5 etapas estrategicas.</div>
                <div className={styles.preRunList}>Diagnostico - Concorrentes - Publico-Alvo - Avatar - Posicionamento</div>
                <div className={styles.preRunDesc}>Os rascunhos ficarao disponiveis para edicao na Base de Dados.</div>
                <button className={styles.btnStart} onClick={handleStart}>Iniciar Pipeline</button>
              </div>
            )}

            {phase === 'checking' && (
              <div className={styles.preRun}><div className={styles.preRunDesc}>Verificando...</div></div>
            )}

            {phase === 'running' && (
              <>
                <div className={styles.streamHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={styles.streamTitle}>{AGENTS[selectedAgent]?.label}</div>
                    {isTyping && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff0033', animation: 'pulse 1s ease-in-out infinite' }} />}
                  </div>
                  <div className={styles.streamProgress}>Agente {doneCount + 1} de {AGENTS.length}</div>
                </div>
                <div className={styles.streamBody}>
                  {displayedText ? (
                    <div className={`${styles.streamText} ${isTyping ? styles.streamCursor : ''}`}>{displayedText}</div>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#525252', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      Gerando output...
                    </div>
                  )}
                  <div ref={streamEndRef} />
                </div>
                <div className={styles.logArea}>
                  {logs.map((log, i) => (
                    <div key={i} className={`${styles.logLine} ${log.type === 'success' ? styles.logSuccess : log.type === 'error' ? styles.logError : ''}`} style={{ animation: 'fadeInUp 0.2s ease-out' }}>
                      <span className={styles.logTime}>{log.time}</span>
                      <span>{log.type === 'success' ? '\u2713' : log.type === 'error' ? '!' : '\u25B8'} {log.message}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </>
            )}

            {phase === 'done' && (
              <div className={styles.success}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" opacity="0.3"/><polyline points="9 12 12 15 16 10" className={styles.checkIcon}/>
                </svg>
                <div className={styles.successTitle}>Pipeline concluido!</div>
                <div className={styles.successDesc}>Rascunhos gerados e salvos na Base de Dados.<br/>Agora voce pode editar cada etapa manualmente.</div>
                <button className={styles.btnGo} onClick={() => { onComplete?.(); onClose(); }}>Ir para Base de Dados</button>
              </div>
            )}

            {phase === 'error' && (
              <div className={styles.blocked}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff3333" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <div className={styles.blockedTitle} style={{ color: '#ff3333' }}>Pipeline falhou</div>
                <div className={styles.blockedDesc}>{errorMsg}</div>
                <button className={styles.btnGo} style={{ borderColor: 'rgba(255,51,51,0.3)', color: '#ff3333', background: 'rgba(255,51,51,0.06)' }} onClick={onClose}>Fechar</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
