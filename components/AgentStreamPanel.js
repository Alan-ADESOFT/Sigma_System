/**
 * components/AgentStreamPanel.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Painel de streaming em tempo real — mostra output do agente caracter por
 * caracter via SSE, com log de passos e suporte a agentes duplos.
 * Substitui o loading genérico do StageModal quando ENABLE_STREAMING=true.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../assets/style/agentStreamPanel.module.css';

/**
 * @param {object} props
 * @param {string} props.agentName      - Nome do agente (ex: 'agente1')
 * @param {string} props.clientId       - ID do cliente
 * @param {string} props.userInput      - Input do usuário
 * @param {string} [props.modelLevel]   - Nível do modelo
 * @param {string} [props.customPrompt] - Prompt editado
 * @param {object} [props.context]      - Context extra
 * @param {boolean} [props.autoStart]   - Iniciar automaticamente ao montar
 * @param {boolean} [props.isDualAgent] - Se é agente duplo (2A→2B, 4A→4B)
 * @param {function} props.onComplete   - Callback com { text, historyId }
 * @param {function} props.onClose      - Callback para fechar/cancelar
 */
export default function AgentStreamPanel({
  agentName, clientId, userInput, modelLevel, customPrompt, context,
  autoStart = true, isDualAgent = false,
  onComplete, onClose,
}) {
  const [status, setStatus]             = useState('idle'); // idle | running | done | error
  const [logs, setLogs]                 = useState([]);
  const [streamedText, setStreamedText] = useState('');
  const [searchText, setSearchText]     = useState('');
  const [citations, setCitations]       = useState([]);
  const [isSearchPhase, setIsSearchPhase] = useState(false);
  const [historyId, setHistoryId]       = useState(null);

  const logEndRef    = useRef(null);
  const outputEndRef = useRef(null);
  const abortRef     = useRef(null);
  const startedRef   = useRef(false);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Auto-scroll output
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamedText]);

  // Auto-start
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      startStream();
    }
    return () => {
      // Cleanup: abort on unmount
      abortRef.current?.abort();
    };
  }, []);

  function addLog(type, message) {
    setLogs(prev => [...prev, { type, message, timestamp: new Date() }]);
  }

  function formatTime(d) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getLogStyle(type) {
    switch (type) {
      case 'success':    return styles.logSuccess;
      case 'generating': return styles.logBrand;
      case 'error':      return styles.logError;
      default:           return styles.logDefault;
    }
  }

  function getLogIcon(type) {
    switch (type) {
      case 'success':    return '\u2713';
      case 'generating': return '\u26A1';
      case 'error':      return '!';
      default:           return '\u25B8';
    }
  }

  const startStream = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('running');
    setStreamedText('');
    setSearchText('');
    setCitations([]);
    setLogs([]);
    setIsSearchPhase(isDualAgent);

    addLog('log', `Iniciando ${agentName}...`);

    try {
      const response = await fetch('/api/agentes/run-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName, clientId, userInput, modelLevel, customPrompt, context,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));
            handleSSEEvent(event);
          } catch {}
        }
      }

      // Processa buffer restante
      if (buffer.trim().startsWith('data: ')) {
        try {
          const event = JSON.parse(buffer.trim().slice(6));
          handleSSEEvent(event);
        } catch {}
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        addLog('log', 'Execução cancelada pelo usuário');
        setStatus('idle');
      } else {
        addLog('error', `Erro: ${err.message}`);
        setStatus('error');
      }
    }
  }, [agentName, clientId, userInput, modelLevel, customPrompt, context, isDualAgent]);

  function handleSSEEvent(event) {
    switch (event.type) {
      case 'start':
        addLog('log', `Agente ${event.agentName} conectado`);
        break;

      case 'log':
        addLog('log', event.message);
        break;

      case 'search_done':
        setIsSearchPhase(false);
        setCitations(event.citations || []);
        setSearchText(event.searchText || '');
        addLog('success', `Pesquisa concluída — ${event.citations?.length || 0} fontes`);
        break;

      case 'generating':
        addLog('generating', `Gerando análise (${event.agentName})...`);
        break;

      case 'chunk':
        setStreamedText(prev => prev + event.delta);
        break;

      case 'done':
        setHistoryId(event.historyId);
        addLog('success', `Concluído — ${event.textLength || 0} caracteres gerados`);
        setStatus('done');
        break;

      case 'error':
        addLog('error', event.message);
        setStatus('error');
        break;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    onClose?.();
  }

  function handleUse() {
    onComplete?.({ text: streamedText, historyId });
  }

  function handleDiscard() {
    onClose?.();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isRunning = status === 'running';
  const isDone    = status === 'done';
  const isError   = status === 'error';

  return (
    <div className={styles.container}>
      {/* Log de passos */}
      <div className={styles.logSection}>
        {logs.map((log, i) => (
          <div key={i} className={styles.logEntry}>
            <span className={`${styles.logIcon} ${getLogStyle(log.type)}`}>
              {getLogIcon(log.type)}
            </span>
            <span className={styles.logTime}>{formatTime(log.timestamp)}</span>
            <span className={`${styles.logMessage} ${getLogStyle(log.type)}`}>
              {log.message}
            </span>
          </div>
        ))}
        {isSearchPhase && (
          <div className={styles.searchBadge}>
            <span className={styles.searchDot} />
            Pesquisando na web...
          </div>
        )}
        <div ref={logEndRef} />
      </div>

      {/* Output */}
      {isDualAgent && searchText ? (
        /* Layout duplo: pesquisa + análise */
        <div className={styles.dualPanel}>
          <div className={styles.panelColumn}>
            <div className={styles.panelHeader}>PESQUISA</div>
            <div className={styles.panelBody}>
              <div className={styles.outputText}>
                {searchText || <span className={styles.emptyState}>Aguardando pesquisa...</span>}
              </div>
            </div>
          </div>
          <div className={styles.panelColumn}>
            <div className={`${styles.panelHeader} ${streamedText ? styles.panelHeaderActive : ''}`}>
              ANÁLISE
            </div>
            <div className={styles.panelBody}>
              <div className={`${styles.outputText} ${isRunning ? styles.outputCursor : ''}`}>
                {streamedText || <span className={styles.emptyState}>Aguardando análise...</span>}
              </div>
              <div ref={outputEndRef} />
            </div>
          </div>
        </div>
      ) : (
        /* Layout simples */
        <div className={styles.outputSection}>
          {streamedText ? (
            <div className={`${styles.outputText} ${isRunning ? styles.outputCursor : ''}`}>
              {streamedText}
            </div>
          ) : (
            <div className={styles.emptyState}>
              {isRunning ? 'Aguardando resposta da IA...' : 'Nenhum output gerado'}
            </div>
          )}
          <div ref={outputEndRef} />
        </div>
      )}

      {/* Barra de ações */}
      <div className={styles.actions}>
        {isRunning && (
          <button className={styles.btnCancel} onClick={handleCancel}>
            Cancelar
          </button>
        )}
        {(isDone || isError) && (
          <>
            <button className={styles.btnDiscard} onClick={handleDiscard}>
              Descartar
            </button>
            {isDone && streamedText && (
              <button className={styles.btnUse} onClick={handleUse}>
                Usar este output
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
