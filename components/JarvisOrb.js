/**
 * components/JarvisOrb.js
 * ─────────────────────────────────────────────────────────────────────────────
 * FAB do JARVIS — esfera de partículas Canvas 2D no canto inferior direito.
 *
 * 2200 partículas formando uma esfera 3D com rotação individual (Rodrigues).
 * 5 estados visuais: idle, listening, processing, speaking, error.
 * Speaking: partículas ejetadas individualmente por pulso de voz.
 * Sem texto de resposta — apenas a esfera pulsa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../assets/style/jarvisOrb.module.css';

/* ═══════════════════════════════════════════════════════════════
   CANVAS ORB — Esfera de partículas
   ═══════════════════════════════════════════════════════════ */

const PARTICLE_COUNT = 2200;
const BASE_RADIUS = 125;
const REF_SIZE = 250;

const STATES = {
  idle:       { radius: 125, speed: 0.0008, scatter: 1.00, pulseAmp: 4,  pulseFreq: 0.5, colorShift: 0,   rings: 0 },
  listening:  { radius: 135, speed: 0.0022, scatter: 1.35, pulseAmp: 14, pulseFreq: 1.4, colorShift: 12,  rings: 3 },
  processing: { radius: 132, speed: 0.0060, scatter: 1.70, pulseAmp: 8,  pulseFreq: 3.2, colorShift: -15, rings: 0 },
  speaking:   { radius: 140, speed: 0.0030, scatter: 1.55, pulseAmp: 28, pulseFreq: 2.0, colorShift: 8,   rings: 4 },
};

function randomOnSphere(r) {
  const u = Math.random(), v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.sin(phi) * Math.sin(theta),
    z: r * Math.cos(phi),
  };
}

function randomAxis() {
  const p = randomOnSphere(1);
  return { x: p.x, y: p.y, z: p.z };
}

function rotateAxis(p, ax, ay, az, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return {
    x: (t * ax * ax + c) * p.x + (t * ax * ay - s * az) * p.y + (t * ax * az + s * ay) * p.z,
    y: (t * ax * ay + s * az) * p.x + (t * ay * ay + c) * p.y + (t * ay * az - s * ax) * p.z,
    z: (t * ax * az - s * ay) * p.x + (t * ay * az + s * ax) * p.y + (t * az * az + c) * p.z,
  };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function createParticles() {
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const r = BASE_RADIUS + (Math.random() - 0.5) * 20;
    const pos = randomOnSphere(r);
    const ax = randomAxis();
    const dx = Math.random() - 0.5, dy = Math.random() - 0.5, dz = Math.random() - 0.5;
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    particles.push({
      ox: pos.x, oy: pos.y, oz: pos.z,
      x: 0, y: 0, z: 0,
      ax,
      spd: 0.00025 + Math.random() * 0.00055,
      phase: Math.random() * Math.PI * 2,
      size: 0.7 + Math.random() * 1.5,
      dispX: dx / dl, dispY: dy / dl, dispZ: dz / dl,
      dispPhase: Math.random() * Math.PI * 2,
    });
  }
  return particles;
}

function CanvasOrb({ orbState, size }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef(orbState);

  useEffect(() => { stateRef.current = orbState; }, [orbState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const S = size;
    canvas.width = S * dpr;
    canvas.height = S * dpr;
    canvas.style.width = S + 'px';
    canvas.style.height = S + 'px';
    ctx.scale(dpr, dpr);

    const CX = S / 2, CY = S / 2;
    const sc = S / REF_SIZE;

    const particles = createParticles();
    let time = 0;

    // Current lerped values
    const cur = { ...STATES.idle };

    function frame() {
      const target = STATES[stateRef.current] || STATES.idle;
      const lf = 0.03;
      cur.radius     = lerp(cur.radius,     target.radius,     lf);
      cur.speed      = lerp(cur.speed,      target.speed,      lf);
      cur.scatter    = lerp(cur.scatter,     target.scatter,    lf);
      cur.pulseAmp   = lerp(cur.pulseAmp,   target.pulseAmp,   lf);
      cur.pulseFreq  = lerp(cur.pulseFreq,  target.pulseFreq,  lf);
      cur.colorShift = lerp(cur.colorShift,  target.colorShift, lf);
      cur.rings      = lerp(cur.rings,       target.rings,      lf);

      const pulse = Math.sin(time * cur.pulseFreq) * cur.pulseAmp;
      const globalR = (cur.radius + pulse) * sc;
      const breathe = 1 + 0.03 * Math.sin(time * 0.4);
      const isSpeaking = stateRef.current === 'speaking';

      ctx.clearRect(0, 0, S, S);

      // Update particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const np = rotateAxis(
          { x: p.ox, y: p.oy, z: p.oz },
          p.ax.x, p.ax.y, p.ax.z,
          time * p.spd * (cur.speed / 0.0008)
        );
        let sx = np.x, sy = np.y, sz = np.z;

        if (isSpeaking) {
          const burst = Math.max(0, Math.sin(time * cur.pulseFreq * 0.7 + p.dispPhase));
          const disp = burst * 22;
          sx += p.dispX * disp;
          sy += p.dispY * disp;
          sz += p.dispZ * disp;
        }

        const curLen = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
        const targetR = globalR * breathe;
        const scale = targetR / curLen;

        p.x = sx * scale * cur.scatter;
        p.y = sy * scale * cur.scatter;
        p.z = sz * scale;

        p.ox = np.x; p.oy = np.y; p.oz = np.z;
      }

      // Sort by Z for painter's algorithm
      particles.sort((a, b) => a.z - b.z);

      // Draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const projX = CX + p.x * sc;
        const projY = CY + p.y * 0.9 * sc;

        const zNorm = (p.z + globalR * 1.5) / (globalR * 3.0);
        const distC = Math.sqrt(p.x * p.x + p.y * p.y) / (globalR || 1);
        const edge = 1 - Math.max(0, distC - 0.75) * 1.8;
        const alpha = Math.max(0.04, Math.min(1, zNorm * 1.1)) * Math.max(0, edge) * (0.55 + zNorm * 0.45);

        const hue = 350 + cur.colorShift + Math.sin(time * 0.3 + p.phase) * 6;
        const sat = 88 + zNorm * 12;
        const lgt = 32 + zNorm * 42;
        const sz2 = p.size * (0.45 + zNorm * 0.9) * sc;

        ctx.beginPath();
        ctx.arc(projX, projY, Math.max(0.3, sz2), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue},${sat}%,${lgt}%,${alpha})`;
        ctx.fill();
      }

      // Rings (listening + speaking)
      if (cur.rings > 0.5) {
        const ringCount = Math.round(cur.rings);
        for (let r = 1; r <= ringCount; r++) {
          const rT = time * (isSpeaking ? 1.6 : 1.1);
          const ringR = globalR + (20 * r + 12 * Math.sin(rT - r * 0.9)) * sc;
          const ringA = Math.max(0, 0.22 - r * 0.05) * Math.abs(Math.sin(rT - r * 0.7));
          if (ringA > 0.01) {
            ctx.beginPath();
            ctx.arc(CX, CY, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `hsla(355,95%,55%,${ringA})`;
            ctx.lineWidth = 1.0 * sc;
            ctx.stroke();
          }
        }
      }

      // Orbiting dots (processing)
      if (stateRef.current === 'processing') {
        for (let i = 0; i < 3; i++) {
          const angle = time * 2.5 + i * (Math.PI * 2 / 3);
          const oR = (globalR + (28 + i * 10) * sc);
          const ox = CX + Math.cos(angle) * oR;
          const oy = CY + Math.sin(angle) * oR * 0.38;
          ctx.beginPath();
          ctx.arc(ox, oy, 2.2 * sc, 0, Math.PI * 2);
          ctx.fillStyle = 'hsla(355,100%,62%,0.95)';
          ctx.fill();
        }
      }

      time += 0.012;
      animRef.current = requestAnimationFrame(frame);
    }

    animRef.current = requestAnimationFrame(frame);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.orbCanvas}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   BACKGROUND PARTICLES — floating dots + connecting lines
   ═══════════════════════════════════════════════════════════ */

function BgParticles() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let W = window.innerWidth, H = window.innerHeight;

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 90;
    const pts = [];
    for (let i = 0; i < COUNT; i++) {
      pts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 1 + Math.random() * 2,
        a: 0.2 + Math.random() * 0.35,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    let t = 0;
    function frame() {
      ctx.clearRect(0, 0, W, H);
      t += 0.008;

      for (let i = 0; i < COUNT; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;

        const glow = 0.7 + 0.3 * Math.sin(t * 1.5 + p.pulse);
        const alpha = p.a * 0.5 * glow;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * glow, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 20, 60, ${alpha})`;
        ctx.fill();
      }

      // Connect nearby particles with lines
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            const alpha = (1 - dist / 160) * 0.12;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(255, 0, 51, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      animRef.current = requestAnimationFrame(frame);
    }
    animRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.bgCanvas} />;
}

/* ═══════════════════════════════════════════════════════════════
   STATUS TEXT — frases que ciclam por estado
   ═══════════════════════════════════════════════════════════ */

const STATUS_PHRASES = {
  idle: ['AGUARDANDO COMANDO'],
  listening: [
    'CAPTURANDO AUDIO',
    'PROCESSANDO FREQUENCIAS',
    'ANALISANDO VOZ',
    'OUVINDO OPERADOR',
  ],
  processing: [
    'CONSULTANDO BANCO DE DADOS',
    'ANALISANDO PARAMETROS',
    'PROCESSANDO REQUISICAO',
    'EXECUTANDO QUERY',
    'COMPILANDO RESPOSTA',
    'CRUZANDO DADOS',
    'VERIFICANDO REGISTROS',
  ],
  speaking: [
    'TRANSMITINDO RESPOSTA',
    'SINTETIZANDO VOZ',
    'CANAL ABERTO',
  ],
  error: ['FALHA NO PROCESSAMENTO'],
};

function useStatusCycle(state) {
  const [phrase, setPhrase] = useState(STATUS_PHRASES.idle[0]);
  const indexRef = useRef(0);

  useEffect(() => {
    const phrases = STATUS_PHRASES[state] || STATUS_PHRASES.idle;
    indexRef.current = 0;
    setPhrase(phrases[0]);

    if (phrases.length <= 1) return;

    const interval = state === 'processing' ? 1800 : 2400;
    const timer = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % phrases.length;
      setPhrase(phrases[indexRef.current]);
    }, interval);

    return () => clearInterval(timer);
  }, [state]);

  return phrase;
}

/* ═══════════════════════════════════════════════════════════════
   Icons
   ═══════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════ */
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

  const statusPhrase = useStatusCycle(state);

  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const audioRef    = useRef(null);
  const inputRef    = useRef(null);

  // Error flash: briefly go to error then back to idle
  useEffect(() => {
    if (state === 'error') {
      const t = setTimeout(() => setState('idle'), 1500);
      return () => clearTimeout(t);
    }
  }, [state]);

  const loadQuota = useCallback(async () => {
    try {
      const r = await fetch('/api/jarvis/usage');
      const d = await r.json();
      if (d.success) setQuota({ remaining: d.remaining, limit: d.limit });
    } catch {}
  }, []);

  useEffect(() => { loadQuota(); }, [open, loadQuota]);

  useEffect(() => {
    if (showChat && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [showChat]);

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
        const errMsg = d.error || 'Não consegui processar sua solicitação. Tente novamente.';
        setResponse(errMsg);
        setState('speaking');
        await playTTS(errMsg);
        return;
      }
      if (d.quota) setQuota({ remaining: d.quota.remaining, limit: d.quota.limit });
      setText('');
      if (d.requiresConfirmation) {
        setPending({ action: d.confirmAction, data: d.data, summary: d.response });
        setResponse(d.response);
        setState('speaking');
        await playTTS(d.response);
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
      const errMsg = 'Falha de conexão com o servidor. Tente novamente.';
      setResponse(errMsg);
      setState('speaking');
      await playTTS(errMsg);
    }
  }

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
        await playTTS(d.message || 'Concluído.');
      } else {
        const errMsg = d.error || 'Não consegui executar essa ação. Tente novamente.';
        setResponse(errMsg);
        setState('speaking');
        await playTTS(errMsg);
      }
    } catch {
      const errMsg = 'Ocorreu um erro de conexão. Tente novamente.';
      setResponse(errMsg);
      setState('speaking');
      await playTTS(errMsg);
    }
    setPending(null);
  }

  async function cancelAction() {
    setPending(null);
    const msg = 'Ação cancelada. Se precisar, é só pedir novamente.';
    setResponse(msg);
    setState('speaking');
    await playTTS(msg);
  }

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
          reader.onloadend = async () => { await sendCommand({ audioBase64: reader.result }); };
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

  function renderConfirmCard() {
    if (!pendingAction) return null;
    const { action, data } = pendingAction;
    const title =
      action === 'create_task'        ? 'Nova Tarefa'
      : action === 'save_income'      ? 'Nova Receita'
      : action === 'save_expense'     ? 'Nova Despesa'
      : action === 'generate_summary' ? 'Rodar Pipeline'
      : action === 'send_form'        ? 'Enviar Formulário'
      : 'Confirmar Ação';
    const rows = [];
    if (action === 'create_task') {
      rows.push(['Título', data?.title]);
      if (data?.priority) rows.push(['Prioridade', String(data.priority).toUpperCase()]);
      if (data?.client_name) rows.push(['Cliente', data.client_name]);
      if (data?.assigned_to_name) rows.push(['Para', data.assigned_to_name]);
      if (data?.due_date) rows.push(['Vencimento', data.due_date]);
    } else if (action === 'save_income' || action === 'save_expense') {
      rows.push(['Descrição', data?.description]);
      rows.push(['Valor', `R$ ${Number(data?.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      if (data?.category) rows.push(['Categoria', data.category]);
      rows.push(['Data', data?.date]);
    } else if (action === 'generate_summary') {
      rows.push(['Cliente', data?.client_name]);
      rows.push(['Ação', 'Pipeline estratégico completo']);
    } else if (action === 'send_form') {
      rows.push(['Cliente', data?.client_name]);
      rows.push(['WhatsApp', data?.phone]);
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

  return (
    <>
      {/* FAB */}
      {!open && (
        <button className={styles.fab} onClick={() => setOpen(true)} aria-label="Abrir JARVIS" title="JARVIS">
          <span className={styles.fabPulseRing} />
          <svg className={styles.fabIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
          </svg>
          <span className={styles.fabBadge}>J.A.R.V.I.S</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className={styles.panel} role="dialog" aria-label="JARVIS">
          <div className={styles.panelBg} />
          <BgParticles />

          <div className={styles.content}>
            <div className={styles.header}>
              <h2 className={styles.title}>JARVIS</h2>
              <div className={styles.subtitle}>Assistente de Comando — Sigma</div>
            </div>

            <CanvasOrb orbState={state} size={280} />

            <div className={styles.statusWrap}>
              <span
                key={statusPhrase}
                className={`${styles.statusText} ${state === 'idle' ? styles.statusIdle : ''}`}
              >
                {statusPhrase}
              </span>
            </div>

            {renderConfirmCard()}
          </div>

          <div className={styles.bottomSection}>
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
                >{SendIcon}</button>
              </div>
            )}

            <div className={styles.actionBar}>
              <button className={styles.sideBtn} onClick={toggleChat} title={showChat ? 'Modo voz' : 'Modo texto'}>
                {showChat ? MicIcon : ChatIcon}
              </button>

              {state === 'speaking' ? (
                <button className={`${styles.mainBtn} ${styles.mainBtnSpeaking}`} onClick={pauseTTS} title="Pausar">
                  {PauseIcon}
                </button>
              ) : (
                <button
                  className={`${styles.mainBtn} ${recording ? styles.mainBtnRecording : ''}`}
                  onClick={recording ? stopRecording : startRecording}
                  disabled={state === 'processing'}
                  title={recording ? 'Parar gravação' : 'Gravar áudio'}
                >{recording ? StopIcon : MicIcon}</button>
              )}

              <button className={styles.sideBtn} onClick={handleClose} title="Fechar">
                {CloseIcon}
              </button>
            </div>

            <div className={styles.footer}>
              <span>{quota ? `${quota.remaining}/${quota.limit}` : '—'}</span>
              <div className={styles.langPicker}>
                <button className={`${styles.langBtn} ${language === 'pt' ? styles.langActive : ''}`} onClick={() => setLanguage('pt')}>PT</button>
                <button className={`${styles.langBtn} ${language === 'en' ? styles.langActive : ''}`} onClick={() => setLanguage('en')}>EN</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
