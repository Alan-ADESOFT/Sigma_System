/**
 * components/PipelineModal.js
 * Pipeline com blur overlay, fake typing, transicoes entre agentes e console hacking.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotification } from '../context/NotificationContext';
import styles from '../assets/style/pipelineModal.module.css';
import pipelineFakePhrases from '../assets/data/pipelineFakePhrases';

const AGENTS = [
  { name: 'agente1',  num: '01',  label: 'Diagnostico do Negocio' },
  { name: 'agente2a', num: '02A', label: 'Pesquisa de Concorrentes' },
  { name: 'agente2b', num: '02B', label: 'Analise de Concorrentes' },
  { name: 'agente3',  num: '03',  label: 'Publico-Alvo' },
  { name: 'agente4a', num: '04A', label: 'Pesquisa de Avatar' },
  { name: 'agente4b', num: '04B', label: 'Construcao do Avatar' },
  { name: 'agente5',  num: '05',  label: 'Posicionamento da Marca' },
];

function ts() {
  const n = new Date();
  return [n.getHours(), n.getMinutes(), n.getSeconds()].map(v => String(v).padStart(2, '0')).join(':');
}

export default function PipelineModal({ client, onClose, onComplete, onBackgroundClose }) {
  const { notify } = useNotification();
  const [phase, setPhase]                 = useState('checking');
  const [completedJob, setCompletedJob]   = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(0);
  const [agentStatuses, setAgentStatuses] = useState(AGENTS.map(() => 'waiting'));
  const [connectorActive, setConnectorActive] = useState(-1);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping]           = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [transitionMsg, setTransitionMsg] = useState('');
  const [transitionSub, setTransitionSub] = useState('');
  const [agentOutputs, setAgentOutputs]   = useState({});
  const [hiddenOutputs, setHiddenOutputs] = useState({});
  const [logs, setLogs]                   = useState([]);
  const [errorMsg, setErrorMsg]           = useState('');
  const [lastDoneCount, setLastDoneCount] = useState(0);
  const [revealing, setRevealing]         = useState(false);
  const [revealed, setRevealed]           = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Blur badge state per agent: 'generating' | 'transitioning' | 'completed' | null
  const [blurPhases, setBlurPhases]       = useState({});

  const logEndRef    = useRef(null);
  const streamEndRef = useRef(null);
  const pollingRef   = useRef(null);
  const typingRef    = useRef(null);
  const fakeTypingRef = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => { streamEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [displayedText]);
  useEffect(() => { return () => { if (pollingRef.current) clearInterval(pollingRef.current); if (typingRef.current) clearInterval(typingRef.current); if (fakeTypingRef.current) clearInterval(fakeTypingRef.current); }; }, []);
  useEffect(() => { checkPreConditions(); }, []);

  /* ── Fake typing — gera texto falso com efeito typewriter ── */
  function startFakeTyping(agentName) {
    if (fakeTypingRef.current) clearInterval(fakeTypingRef.current);
    const phrases = pipelineFakePhrases[agentName] || pipelineFakePhrases.agente1;
    const fullText = phrases.join('\n');
    setDisplayedText('');
    setIsTyping(true);
    let i = 0;
    fakeTypingRef.current = setInterval(() => {
      i += 1;
      if (i >= fullText.length) {
        // Loop: restart from beginning
        i = 0;
        setDisplayedText('');
      } else {
        setDisplayedText(fullText.substring(0, i));
      }
    }, 30);
  }

  function stopFakeTyping() {
    if (fakeTypingRef.current) { clearInterval(fakeTypingRef.current); fakeTypingRef.current = null; }
    setIsTyping(false);
  }

  /* ── Real text typewriter (for reveal) ── */
  const typeText = useCallback((text, onDone) => {
    if (typingRef.current) clearInterval(typingRef.current);
    setDisplayedText('');
    setIsTyping(true);
    let i = 0;
    const chunk = Math.max(3, Math.floor(text.length / 250));
    typingRef.current = setInterval(() => {
      i += chunk;
      if (i >= text.length) {
        setDisplayedText(text);
        setIsTyping(false);
        clearInterval(typingRef.current);
        if (onDone) onDone();
      } else {
        setDisplayedText(text.substring(0, i));
      }
    }, 6);
  }, []);

  function showAgentTransition(fromLabel, toLabel, callback) {
    setTransitionMsg(fromLabel + ' finalizado');
    setTransitionSub('Passando para ' + toLabel + '...');
    setShowTransition(true);
    setTimeout(() => {
      setShowTransition(false);
      if (callback) callback();
    }, 1500);
  }

  function handleSelectAgent(idx) {
    if (showTransition) return;
    setSelectedAgent(idx);
    const agentName = AGENTS[idx]?.name;
    if (revealed || phase === 'done' || phase === 'already_done') {
      // After reveal: show real text
      const output = hiddenOutputs[agentName] || agentOutputs[agentName];
      if (output) {
        stopFakeTyping();
        setDisplayedText(output);
      } else {
        setDisplayedText('');
      }
    } else if (agentStatuses[idx] === 'running') {
      // Running: show fake typing
      startFakeTyping(agentName);
    } else if (agentStatuses[idx] === 'done') {
      // Done but not revealed: show static fake text with blur
      stopFakeTyping();
      const phrases = pipelineFakePhrases[agentName] || pipelineFakePhrases.agente1;
      setDisplayedText(phrases.join('\n'));
    } else {
      stopFakeTyping();
      setDisplayedText('');
    }
  }

  function handleCloseAttempt() {
    if (phase === 'running') {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }

  function handleConfirmClose() {
    setShowCloseConfirm(false);
    // Notify parent that pipeline is running in background
    onBackgroundClose?.(client.id);
    notify('Pipeline rodando em segundo plano — voce sera notificado', 'info', 8000);
    onClose();
  }

  function addLog(message, type = 'log') {
    setLogs(prev => [...prev, { message, type, time: ts() }]);
  }

  async function checkPreConditions() {
    if (!client.form_done) { setPhase('blocked'); return; }
    try {
      const r = await fetch('/api/agentes/pipeline/status?clientId=' + client.id);
      const d = await r.json();
      if (d.success && d.data?.status === 'completed') { setCompletedJob(d.data); setPhase('already_done'); setRevealed(true); return; }
      if (d.success && d.data?.status === 'running') { setPhase('running'); startPolling(); connectSSE(d.data.jobId); return; }
    } catch {}
    setPhase('ready');
  }

  async function handleStart() {
    setPhase('running');
    addLog('> Inicializando pipeline...', 'system');
    addLog('> Conectando aos agentes de IA...', 'system');
    try {
      const r = await fetch('/api/agentes/pipeline/run-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: client.id }) });
      const d = await r.json();
      if (!d.success) { setErrorMsg(d.error || 'Erro ao iniciar'); setPhase('error'); return; }
      addLog('> Pipeline ativo [job:' + d.jobId.substring(0, 8) + ']', 'system');
      if (d.rateLimit) {
        addLog('> Pipelines restantes: ' + d.rateLimit.remaining + '/' + d.rateLimit.limit + ' (' + d.rateLimit.window + ')', 'system');
        if (d.rateLimit.remaining <= 1) {
          notify('Atencao: ' + d.rateLimit.remaining + ' pipeline(s) restante(s) nos proximos 30 min', 'warning');
        }
      }
      startPolling();
      connectSSE(d.jobId);
    } catch (err) { setErrorMsg(err.message); setPhase('error'); }
  }

  function startPolling() {
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

        if (completedAgents > 0) {
          setConnectorActive(completedAgents - 1);
          setTimeout(() => setConnectorActive(-1), 1000);
        }

        if (status === 'completed') {
          clearInterval(pollingRef.current);
          setAgentStatuses(AGENTS.map(() => 'done'));
          addLog('> Pipeline concluido com sucesso', 'success');
          addLog('> ' + AGENTS.length + ' rascunhos gerados', 'success');
          // Trigger reveal
          triggerReveal();
        } else if (status === 'failed') {
          clearInterval(pollingRef.current);
          setErrorMsg(d.data.error || 'Erro');
          setPhase('error');
          addLog('> ERRO: ' + (d.data.error || 'desconhecido'), 'error');
        }
      } catch {}
    }, 3000);
  }

  function triggerReveal() {
    stopFakeTyping();
    setRevealing(true);
    // After 1.2s animation, show success
    setTimeout(() => {
      setRevealed(true);
      setRevealing(false);
      // Show the first agent output
      const firstOutput = hiddenOutputs[AGENTS[0]?.name];
      if (firstOutput) {
        setSelectedAgent(0);
        setDisplayedText(firstOutput);
      }
      setTimeout(() => setPhase('done'), 1200);
    }, 1200);
  }

  function connectSSE(jId) {
    // Delay de 2s para o emitter ser criado no backend (setImmediate)
    setTimeout(() => {
      try {
        const evtSource = new EventSource('/api/agentes/stream-log?jobId=' + jId);
        evtSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'agent_start') {
              const idx = AGENTS.findIndex(a => a.name === data.agentName);
              if (data.skipped) {
                // Agente ja concluido anteriormente — pular sem fake typing
                addLog('> ' + AGENTS[idx]?.label + ' — ja concluido (retomada)', 'success');
                if (idx >= 0) {
                  setAgentStatuses(prev => { const next = [...prev]; next[idx] = 'done'; return next; });
                  setBlurPhases(prev => ({ ...prev, [data.agentName]: 'completed' }));
                }
              } else {
                addLog('> Executando ' + AGENTS[idx]?.label + ' [' + data.agentName + ']', 'system');
                if (idx >= 0) {
                  setSelectedAgent(idx);
                  setBlurPhases(prev => ({ ...prev, [data.agentName]: 'generating' }));
                  startFakeTyping(data.agentName);
                }
              }
            } else if (data.type === 'agent_done') {
              if (data.skipped) return; // Ja tratado no agent_start
              const doneIdx = AGENTS.findIndex(a => a.name === data.agentName);
              const doneLabel = AGENTS[doneIdx]?.label || data.agentName;
              addLog('> ' + doneLabel + ' concluido [' + data.textLength + ' chars]', 'success');
              // Fetch and store real output (hidden)
              fetchAndStore(data.agentName, doneIdx);
            } else if (data.type === 'pipeline_done') {
              evtSource.close();
            } else if (data.type === 'pipeline_error') {
              addLog('> ERRO: ' + data.message, 'error');
              evtSource.close();
            }
          } catch {}
        };
        evtSource.onerror = () => evtSource.close();
      } catch {}
    }, 2000);
  }

  async function fetchAndStore(agentName, doneIdx) {
    try {
      const r = await fetch('/api/agentes/history?type=agent&agentName=' + agentName + '&limit=1');
      const d = await r.json();
      if (d.success && d.data?.[0]?.response_text) {
        const text = d.data[0].response_text;
        setHiddenOutputs(prev => ({ ...prev, [agentName]: text }));
        setAgentOutputs(prev => ({ ...prev, [agentName]: text }));

        // Update blur phase to completed
        setBlurPhases(prev => ({ ...prev, [agentName]: 'completed' }));

        if (doneIdx >= 0) {
          // Show transition then move to next agent
          const nextIdx = doneIdx + 1;
          if (nextIdx < AGENTS.length) {
            stopFakeTyping();
            // Show static fake text for the done agent
            const phrases = pipelineFakePhrases[agentName] || pipelineFakePhrases.agente1;
            setDisplayedText(phrases.join('\n'));

            // Brief pause then transition
            const fromLabel = AGENTS[doneIdx].label;
            const toLabel = AGENTS[nextIdx].label;
            addLog('> Transmitindo dados para ' + toLabel + '...', 'transition');

            // Set transitioning phase
            setBlurPhases(prev => ({ ...prev, [agentName]: 'transitioning' }));
            setTimeout(() => {
              setBlurPhases(prev => ({ ...prev, [agentName]: 'completed' }));
            }, 1500);

            showAgentTransition(fromLabel, toLabel, () => {
              setSelectedAgent(nextIdx);
              startFakeTyping(AGENTS[nextIdx].name);
              setBlurPhases(prev => ({ ...prev, [AGENTS[nextIdx].name]: 'generating' }));
            });
          } else {
            // Last agent done — stop fake typing, keep blur
            stopFakeTyping();
            const phrases = pipelineFakePhrases[agentName] || pipelineFakePhrases.agente1;
            setDisplayedText(phrases.join('\n'));
          }
        }
      }
    } catch {}
  }

  const doneCount = agentStatuses.filter(s => s === 'done').length;

  // Determine current blur state for selected agent
  const selectedAgentName = AGENTS[selectedAgent]?.name;
  const currentBlurPhase = blurPhases[selectedAgentName];
  const showBlur = phase === 'running' && !revealed && !revealing &&
    (currentBlurPhase === 'generating' || currentBlurPhase === 'completed' || currentBlurPhase === 'transitioning');
  const blurAmount = currentBlurPhase === 'completed' ? 6 : 8;

  // Badge text
  let blurBadgeText = '';
  if (currentBlurPhase === 'generating') blurBadgeText = 'Ao finalizar, voce visualiza o resultado.';
  else if (currentBlurPhase === 'transitioning') blurBadgeText = 'Passando dados para o proximo agente \u2192';
  else if (currentBlurPhase === 'completed') blurBadgeText = 'Concluido \u2014 visualize ao finalizar o pipeline';

  return (
    <div className={styles.backdrop} onClick={handleCloseAttempt}>
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
            <button className={styles.btnClose} onClick={handleCloseAttempt}>
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
                    <div className={`${styles.agentCard} ${isActive ? styles.agentCardActive : ''} ${st === 'done' ? styles.agentCardDone : ''}`} onClick={() => handleSelectAgent(i)}>
                      <div className={styles.agentNum}>{agent.num}</div>
                      <div className={styles.agentName}>{agent.label}</div>
                      <div className={`${styles.agentStatus} ${st === 'waiting' ? styles.statusWaiting : st === 'running' ? styles.statusRunning : st === 'done' ? styles.statusDone : styles.statusFailed}`}>
                        <span className={`${styles.dot} ${st === 'waiting' ? styles.dotWaiting : st === 'running' ? styles.dotRunning : st === 'done' ? styles.dotDone : styles.dotFailed}`} />
                        {st === 'waiting' ? 'AGUARDANDO' : st === 'running' ? 'RODANDO...' : st === 'done' ? 'CONCLUIDO' : 'FALHOU'}
                      </div>
                    </div>
                    {i < AGENTS.length - 1 && <div className={`${styles.connector} ${connectorActive === i ? styles.connectorActive : ''}`} />}
                  </div>
                );
              })}
            </div>
          )}

          <div className={styles.mainArea}>
            {/* Scan line hacking effect */}
            {phase === 'running' && <div className={styles.scanLine} />}

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
                <div className={styles.blockedDesc}>O pipeline foi executado{completedJob?.finishedAt ? ' em ' + new Date(completedJob.finishedAt).toLocaleDateString('pt-BR') : ''}. Acesse a Base de Dados para editar.</div>
                <button className={styles.btnGo} onClick={() => { onComplete?.(); onClose(); }}>Ver Base de Dados</button>
              </div>
            )}

            {phase === 'ready' && (
              <div className={styles.preRun}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff6680" strokeWidth="1.5" strokeLinecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
                <div className={styles.preRunTitle}>Pronto para iniciar</div>
                <div className={styles.preRunDesc}>O pipeline vai analisar os dados de {client.company_name} e gerar rascunhos para as 5 etapas.</div>
                <div className={styles.preRunList}>Diagnostico - Concorrentes - Publico-Alvo - Avatar - Posicionamento</div>
                <button className={styles.btnStart} onClick={handleStart}>Iniciar Pipeline</button>
              </div>
            )}

            {phase === 'checking' && <div className={styles.preRun}><div className={styles.preRunDesc}>Verificando...</div></div>}

            {phase === 'running' && (
              <>
                <div className={styles.streamHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={styles.streamTitle}>{AGENTS[selectedAgent]?.label}</div>
                    {(isTyping || agentStatuses[selectedAgent] === 'running') && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff0033', animation: 'pulse 0.8s ease-in-out infinite' }} />}
                  </div>
                  <div className={styles.streamProgress}>Agente {Math.min(doneCount + 1, AGENTS.length)} de {AGENTS.length}</div>
                </div>
                <div className={styles.streamBody} style={{ position: 'relative' }}>
                  {/* Transition overlay */}
                  {showTransition && (
                    <div className={styles.transitionOverlay}>
                      <div className={styles.transitionIcon} />
                      <div className={styles.transitionText}>{transitionMsg}</div>
                      <div className={styles.transitionSub}>{transitionSub}</div>
                    </div>
                  )}
                  {!showTransition && displayedText ? (
                    <div className={`${styles.streamText} ${isTyping ? styles.streamCursor : ''}`}>{displayedText}</div>
                  ) : !showTransition ? (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#525252', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      Gerando output...
                    </div>
                  ) : null}
                  <div ref={streamEndRef} />

                  {/* Blur overlay */}
                  {showBlur && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backdropFilter: 'blur(' + blurAmount + 'px)',
                      WebkitBackdropFilter: 'blur(' + blurAmount + 'px)',
                      background: 'rgba(5,5,5,0.4)',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'opacity 1.2s ease, backdrop-filter 0.6s ease',
                      opacity: 1,
                    }}>
                      <div style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        background: 'rgba(255,0,51,0.06)',
                        border: '1px solid rgba(255,0,51,0.15)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        fontStyle: 'italic',
                        color: 'var(--text-muted)',
                        animation: currentBlurPhase === 'transitioning' ? 'blurBadgePulse 1s ease-in-out infinite' : 'none',
                      }}>
                        {blurBadgeText}
                      </div>
                    </div>
                  )}

                  {/* Reveal animation overlay */}
                  {revealing && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      background: 'rgba(5,5,5,0.4)',
                      zIndex: 10,
                      animation: 'blurReveal 1.2s ease forwards',
                    }} />
                  )}
                </div>
                <div className={styles.logArea}>
                  {logs.map((log, i) => (
                    <div key={i} className={`${styles.logLine} ${log.type === 'success' ? styles.logSuccess : log.type === 'error' ? styles.logError : log.type === 'transition' ? styles.logTransition : log.type === 'system' ? styles.logSystem : ''}`}>
                      <span className={styles.logTime}>[{log.time}]</span>
                      <span>{log.message}</span>
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

        {/* Modal de confirmacao ao fechar durante execucao */}
        {showCloseConfirm && (
          <div onClick={() => setShowCloseConfirm(false)} style={{ position: 'absolute', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 420, padding: '28px 32px', borderRadius: 12, background: 'linear-gradient(145deg, rgba(14,14,14,0.99), rgba(8,8,8,0.99))', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Pipeline em execucao</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
                O pipeline esta rodando em segundo plano.<br/>
                Fechar esta janela nao interrompe a execucao.<br/>
                Voce recebera uma notificacao ao finalizar.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setShowCloseConfirm(false)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer' }}>
                  Continuar acompanhando
                </button>
                <button onClick={handleConfirmClose} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,0,51,0.25)', background: 'rgba(255,0,51,0.08)', color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer' }}>
                  Fechar mesmo assim
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
