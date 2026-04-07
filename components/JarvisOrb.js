/**
 * components/JarvisOrb.js
 * ─────────────────────────────────────────────────────────────────────────────
 * FAB do J.A.R.V.I.S — esfera wireframe 3D animada no canto inferior direito.
 *
 * Painel abre em fullscreen com:
 *   · Esfera wireframe CSS 3D (múltiplos anéis rotacionados)
 *   · Bottom bar: [Chat] [Mic/Pause] [Close]
 *   · Chat input visível somente ao pressionar botão de texto
 *   · Modo voz ativo por padrão ao abrir
 *   · Pause TTS quando Jarvis está falando
 *   · Fechar desliga tudo (gravação + áudio)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../assets/style/jarvisOrb.module.css';

/* ── Dados pré-computados ────────────────────────────────── */
const STARS = Array.from({ length: 30 }, (_, i) => {
  const seed = (i + 1) * 9301 + 49297;
  const rnd = (n) => ((seed * (n + 1)) % 233280) / 233280;
  return {
    top:  `${(rnd(1) * 100).toFixed(1)}%`,
    left: `${(rnd(2) * 100).toFixed(1)}%`,
    dur:  `${(2 + rnd(3) * 4).toFixed(2)}s`,
    del:  `${(rnd(4) * 3).toFixed(2)}s`,
  };
});

/* Anéis da esfera wireframe — ângulos 3D para criar malha esférica */
const RINGS_BIG = [
  { rx: 90, ry: 0,  a: 0.30 },   // equador
  { rx: 0,  ry: 0,  a: 0.22 },   // meridiano primário
  { rx: 0,  ry: 90, a: 0.22 },   // meridiano lateral
  { rx: 60, ry: 0,  a: 0.18 },   // inclinado A
  { rx: 60, ry: 90, a: 0.18 },   // inclinado B
  { rx: 30, ry: 45, a: 0.14 },   // diagonal A
  { rx: 75, ry: 30, a: 0.26 },   // quase-equador
  { rx: 45, ry: 75, a: 0.14 },   // diagonal B
];

const RINGS_FAB = [
  { rx: 75, ry: 0,  a: 0.30 },
  { rx: 0,  ry: 75, a: 0.25 },
  { rx: 45, ry: 45, a: 0.20 },
  { rx: 90, ry: 0,  a: 0.35 },   // equador
];

const STATUS_LABELS = {
  idle:       'Aguardando comando',
  listening:  'Ouvindo...',
  processing: 'Processando...',
  speaking:   'Respondendo...',
  error:      'Erro na execução',
};

/* ── Ícones SVG inline ───────────────────────────────────── */
const MicIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const ChatIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const PauseIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="5" x2="8" y2="19" />
    <line x1="16" y1="5" x2="16" y2="19" />
  </svg>
);

const StopIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="3" />
  </svg>
);

const CloseIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SendIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22,2 15,22 11,13 2,9" />
  </svg>
);

const BoltIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

/* ── Typewriter hook ─────────────────────────────────────── */
function useTypewriter(text, speed = 22) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (!text) { setShown(''); return; }
    setShown('');
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return shown;
}

/* ── Render rings (wireframe sphere) ─────────────────────── */
function renderRings(rings) {
  return rings.map((r, i) => (
    <div
      key={i}
      className={styles.ring}
      style={{
        transform: `rotateX(${r.rx}deg) rotateY(${r.ry}deg)`,
        '--ra': r.a,
      }}
    />
  ));
}

/* ═════════════════════════════════════════════════════════════
   Componente principal
   ═════════════════════════════════════════════════════════ */
export default function JarvisOrb() {
  const [open, setOpen]             = useState(false);
  const [state, setState]           = useState('idle');
  const [text, setText]             = useState('');
  const [response, setResponse]     = useState('');
  const [pendingAction, setPending] = useState(null);
  const [quota, setQuota]           = useState(null);
  const [language, setLanguage]     = useState('pt');
  const [recording, setRecording]   = useState(false);
  const [showChat, setShowChat]     = useState(false);

  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const audioRef    = useRef(null);
  const inputRef    = useRef(null);

  const typed = useTypewriter(state === 'speaking' ? response : '');

  const STATE_CLASS = {
    idle:       '',
    listening:  styles.sphereListening,
    processing: styles.sphereProcessing,
    speaking:   styles.sphereSpeaking,
    error:      styles.sphereError,
  };
  const stateClass = STATE_CLASS[state] || '';

  /* ── Load quota ─────────────────────── */
  const loadQuota = useCallback(async () => {
    try {
      const r = await fetch('/api/jarvis/usage');
      const d = await r.json();
      if (d.success) setQuota({ remaining: d.remaining, limit: d.limit });
    } catch {}
  }, []);

  useEffect(() => { loadQuota(); }, [open, loadQuota]);

  /* ── Focus chat input ───────────────── */
  useEffect(() => {
    if (showChat && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [showChat]);

  /* ── TTS playback ───────────────────── */
  async function playTTS(textToSpeak) {
    try {
      const r = await fetch('/api/jarvis/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak }),
      });
      const d = await r.json();
      if (d.success && d.audioBase64) {
        const audio = new Audio(`data:${d.mime || 'audio/mpeg'};base64,${d.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => { audioRef.current = null; setState('idle'); };
        await audio.play();
        return true;
      }
    } catch (err) {
      console.error('[ERRO][JarvisOrb] TTS falhou', err.message);
    }
    return false;
  }

  function pauseTTS() {
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.currentTime = 0; } catch {}
      audioRef.current = null;
    }
    setState('idle');
  }

  /* ── Send command ───────────────────── */
  async function sendCommand(payload) {
    setState('processing');
    setResponse('');
    setPending(null);

    try {
      const r = await fetch('/api/jarvis/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, language }),
      });
      const d = await r.json();

      if (!d.success) {
        setState('error');
        setResponse(d.error || 'Erro no Jarvis.');
        setTimeout(() => setState('idle'), 1500);
        return;
      }

      if (d.quota) setQuota({ remaining: d.quota.remaining, limit: d.quota.limit });
      setText('');

      if (d.requiresConfirmation) {
        setPending({ action: d.confirmAction, data: d.data, summary: d.response });
        setResponse(d.response);
        setState('idle');
        return;
      }

      setResponse(d.response);
      setState('speaking');

      const played = await playTTS(d.response);
      if (!played) {
        setTimeout(() => setState('idle'), Math.max(1500, d.response.length * 30));
      }
    } catch (err) {
      console.error('[ERRO][JarvisOrb] sendCommand', err.message);
      setState('error');
      setResponse('Falha de conexão.');
      setTimeout(() => setState('idle'), 1500);
    }
  }

  /* ── Confirm / cancel actions ───────── */
  async function confirmAction() {
    if (!pendingAction) return;
    setState('processing');
    try {
      const r = await fetch('/api/jarvis/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: pendingAction.action, data: pendingAction.data }),
      });
      const d = await r.json();
      if (d.success) {
        setResponse(d.message || 'Ação concluída.');
        setState('speaking');
        await playTTS(d.message || 'Concluído');
      } else {
        setResponse(d.error || 'Falha ao confirmar.');
        setState('error');
      }
    } catch {
      setResponse('Falha ao confirmar ação.');
      setState('error');
    }
    setPending(null);
    setTimeout(() => setState('idle'), 1800);
  }

  function cancelAction() {
    setPending(null);
    setResponse('');
    setState('idle');
  }

  /* ── Audio recording ────────────────── */
  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = async () => {
            await sendCommand({ audioBase64: reader.result });
          };
          reader.readAsDataURL(blob);
        } finally {
          stream.getTracks().forEach(t => t.stop());
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setState('listening');
    } catch (err) {
      console.error('[ERRO][JarvisOrb] startRecording', err.message);
    }
  }

  function stopRecording() {
    try { recorderRef.current?.stop(); } catch {}
    setRecording(false);
  }

  function handleSendText() {
    const v = text.trim();
    if (!v) return;
    sendCommand({ text: v });
  }

  /* ── Close panel (desliga tudo) ─────── */
  function handleClose() {
    if (recording) stopRecording();
    pauseTTS();
    setOpen(false);
    setState('idle');
    setResponse('');
    setPending(null);
    setText('');
    setShowChat(false);
  }

  function toggleChat() {
    setShowChat(prev => !prev);
  }

  /* ── Render confirm card ────────────── */
  function renderConfirmCard() {
    if (!pendingAction) return null;
    const { action, data } = pendingAction;
    const title =
      action === 'create_task'        ? 'Nova Tarefa'
      : action === 'save_income'      ? 'Nova Receita'
      : action === 'save_expense'     ? 'Nova Despesa'
      : action === 'generate_summary' ? 'Gerar Resumo IA'
      : 'Confirmar Ação';

    const rows = [];
    if (action === 'create_task') {
      rows.push(['Título', data?.title]);
      if (data?.priority)         rows.push(['Prioridade', String(data.priority).toUpperCase()]);
      if (data?.client_name)      rows.push(['Cliente', data.client_name]);
      if (data?.assigned_to_name) rows.push(['Para', data.assigned_to_name]);
      if (data?.due_date)         rows.push(['Vencimento', data.due_date]);
    } else if (action === 'save_income' || action === 'save_expense') {
      rows.push(['Descrição', data?.description]);
      rows.push(['Valor', `R$ ${Number(data?.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      if (data?.category) rows.push(['Categoria', data.category]);
      rows.push(['Data', data?.date]);
    } else if (action === 'generate_summary') {
      rows.push(['Cliente', data?.client_name]);
    }

    return (
      <div className={styles.confirmCard}>
        <div className={styles.confirmTitle}>{BoltIcon} {title}</div>
        {rows.map(([k, v]) => (
          <div key={k} className={styles.confirmRow}>
            <span>{k}</span><strong>{v || '—'}</strong>
          </div>
        ))}
        <div className={styles.confirmActions}>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={cancelAction}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={confirmAction}>Confirmar</button>
        </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════
     RENDER
     ═════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── FAB ────────────────────────────────────────── */}
      {!open && (
        <button
          className={styles.fab}
          onClick={() => setOpen(true)}
          aria-label="Abrir J.A.R.V.I.S"
          title="J.A.R.V.I.S"
        >
          <div className={styles.fabStage}>
            <div className={styles.fabSphere}>
              {renderRings(RINGS_FAB)}
              <div className={styles.fabCore} />
            </div>
          </div>
          {quota && (
            <span className={styles.fabBadge} title={`${quota.remaining}/${quota.limit}`}>
              {quota.remaining}
            </span>
          )}
        </button>
      )}

      {/* ── PANEL ──────────────────────────────────────── */}
      {open && (
        <div className={styles.panel} role="dialog" aria-label="J.A.R.V.I.S">
          {/* Stars de fundo */}
          <div className={styles.stars}>
            {STARS.map((s, i) => (
              <span
                key={i}
                className={styles.star}
                style={{ top: s.top, left: s.left, '--dur': s.dur, '--del': s.del }}
              />
            ))}
          </div>

          {/* Conteúdo central */}
          <div className={styles.content}>
            {/* Header */}
            <div className={styles.header}>
              <h2 className={styles.title}>J.A.R.V.I.S</h2>
              <div className={styles.subtitle}>Assistente de Comando — Sigma</div>
            </div>

            {/* ORB wireframe grande */}
            <div className={styles.orbStage}>
              <div className={styles.orbRim} />
              <div className={`${styles.orbSphere} ${stateClass}`}>
                {renderRings(RINGS_BIG)}
                <div className={styles.orbCore} />
                <div className={styles.orbGlow} />
              </div>
            </div>

            {/* Status */}
            <div className={`${styles.statusText} ${state !== 'idle' ? styles.statusActive : ''}`}>
              {STATUS_LABELS[state]}
            </div>

            {/* Response text */}
            {response && state !== 'speaking' && !pendingAction && (
              <div className={styles.responseText}>{response}</div>
            )}
            {state === 'speaking' && (
              <div className={styles.responseText}>{typed}</div>
            )}

            {/* Confirm card */}
            {renderConfirmCard()}
          </div>

          {/* Bottom section */}
          <div className={styles.bottomSection}>
            {/* Chat bar (visível somente quando ativado) */}
            {showChat && (
              <div className={styles.chatBar}>
                <input
                  ref={inputRef}
                  className={styles.chatInput}
                  type="text"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSendText(); }}
                  placeholder="Digite um comando..."
                  disabled={state === 'processing' || recording}
                />
                <button
                  className={styles.chatSend}
                  onClick={handleSendText}
                  disabled={!text.trim() || state === 'processing'}
                  title="Enviar"
                >
                  {SendIcon}
                </button>
              </div>
            )}

            {/* Action bar — 3 botões */}
            <div className={styles.actionBar}>
              {/* Esquerda: toggle chat/voz */}
              <button
                className={styles.sideBtn}
                onClick={toggleChat}
                title={showChat ? 'Modo voz' : 'Modo texto'}
              >
                {showChat ? MicIcon : ChatIcon}
              </button>

              {/* Centro: mic / stop / pause */}
              {state === 'speaking' ? (
                <button
                  className={`${styles.mainBtn} ${styles.mainBtnSpeaking}`}
                  onClick={pauseTTS}
                  title="Pausar resposta"
                >
                  {PauseIcon}
                </button>
              ) : (
                <button
                  className={`${styles.mainBtn} ${recording ? styles.mainBtnRecording : ''}`}
                  onClick={recording ? stopRecording : startRecording}
                  disabled={state === 'processing'}
                  title={recording ? 'Parar gravação' : 'Gravar áudio'}
                >
                  {recording ? StopIcon : MicIcon}
                </button>
              )}

              {/* Direita: fechar */}
              <button
                className={styles.sideBtn}
                onClick={handleClose}
                title="Fechar"
              >
                {CloseIcon}
              </button>
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              <span>{quota ? `${quota.remaining}/${quota.limit}` : '—'}</span>
              <div className={styles.langPicker}>
                <button
                  className={`${styles.langBtn} ${language === 'pt' ? styles.langActive : ''}`}
                  onClick={() => setLanguage('pt')}
                >PT</button>
                <button
                  className={`${styles.langBtn} ${language === 'en' ? styles.langActive : ''}`}
                  onClick={() => setLanguage('en')}
                >EN</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
