/**
 * components/comercial/ProposalIntro.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sequência boot/hack/cta/login que toca antes da proposta SIGMA.
 * Portada de Sigma_proposta/pages/index.js → componente reutilizável.
 *
 * Props:
 *   - clientName (obrigatório): nome do cliente que aparece no SIGMA × {nome}
 *   - hostHint? (opcional): texto pequeno que vai em "HOST" no card de target
 *   - regionHint? (opcional): texto que vai em "REGION"
 *   - onComplete: callback chamado ao final da animação (substitui o redirect)
 *   - onSkip?: callback opcional ao clicar "pular" (default = mesmo onComplete)
 *
 * Mantém os efeitos: matrix rain, web audio (sawtooth/sine), scan, breach flash.
 * Áudio só inicia após interação do usuário (click no GATE) — política do browser.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react';
import styles from '../../assets/style/proposalIntro.module.css';

const HACK_LOG_LINES = [
  '[INIT] spawning attack vector...',
  '[NET] resolving target → 177.XX.XX.XX',
  '[PORT] scanning 1-65535...',
  '[PORT] 22/tcp open · ssh',
  '[PORT] 443/tcp open · https',
  '[PORT] 8443/tcp open · vault',
  '[TLS] negotiating handshake RSA-4096',
  '[EXPLOIT] payload delivered · CVE-2026-0x7A3F',
  '[BYPASS] firewall neutralized',
  '[AUTH] brute-forcing credentials...',
  '[AUTH] rotating dictionary 4096 keys/s',
  '[HIT] root shell acquired',
  '[DIR] /var/sigma/vault/ enumerated',
  '[FILE] dossie_cliente.enc',
  '[KEY] extracting master cipher...',
  '[CIPHER] AES-256-GCM unlocked',
  '[DECRYPT] streaming 43.7MB...',
  '[DECRYPT] chunk 01/12 OK',
  '[DECRYPT] chunk 04/12 OK',
  '[DECRYPT] chunk 08/12 OK',
  '[DECRYPT] chunk 12/12 OK',
  '[VERIFY] SHA-256 checksum valid',
  '[PAYLOAD] plano_de_guerra_12_meses.pdf',
  '[PAYLOAD] 3 pilares · 10 entregas',
  '[WIPE] covering tracks...',
  '[EXFIL] transfer complete',
];

const MATRIX_CHARS = 'アイウエオカキクケコサシスセソABCDEF0123456789#$%&@{}[]<>/\\|*^?!'.split('');

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function ProposalIntro({ clientName, hostHint, regionHint, onComplete, onSkip }) {
  const canvasRef = useRef(null);
  const gateRef = useRef(null);
  const hackRef = useRef(null);
  const hackFillRef = useRef(null);
  const hackPctRef = useRef(null);
  const hackLogRef = useRef(null);
  const breachRef = useRef(null);
  const ctaStageRef = useRef(null);
  const loginRef = useRef(null);
  const loginFillRef = useRef(null);
  const loginStatusRef = useRef(null);
  const loginPctRef = useRef(null);

  const audioRef = useRef({ AC: null, masterGain: null });
  const matrixRef = useRef({ running: false, cols: 0, drops: [] });
  const bootedRef = useRef(false);
  const completedRef = useRef(false);

  const safeClient = String(clientName || 'CLIENTE').toUpperCase();
  const safeHost = String(hostHint || `${safeClient.toLowerCase().replace(/[^a-z0-9]+/g, '')}.secure`).slice(0, 32);
  const safeRegion = String(regionHint || 'BR-SE').toUpperCase().slice(0, 12);

  function safeComplete() {
    if (completedRef.current) return;
    completedRef.current = true;
    try { onComplete?.(); } catch {}
  }

  /* ═════ WEB AUDIO ═════ */
  function initAudio() {
    const a = audioRef.current;
    if (a.AC) return;
    try {
      a.AC = new (window.AudioContext || window.webkitAudioContext)();
      a.masterGain = a.AC.createGain();
      a.masterGain.gain.value = 0.35;
      a.masterGain.connect(a.AC.destination);
      const o = a.AC.createOscillator(); const g = a.AC.createGain(); const f = a.AC.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 55;
      f.type = 'lowpass'; f.frequency.value = 220;
      o.connect(f); f.connect(g); g.connect(a.masterGain);
      g.gain.value = 0.05; o.start();
      const lfo = a.AC.createOscillator(); const lfoG = a.AC.createGain();
      lfo.frequency.value = 0.18; lfoG.gain.value = 0.025;
      lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
    } catch {}
  }

  function beep(freq, dur = 0.06, type = 'square', peak = 0.18) {
    const { AC, masterGain } = audioRef.current;
    if (!AC) return;
    try {
      const o = AC.createOscillator(); const g = AC.createGain();
      o.type = type; o.frequency.value = freq;
      o.connect(g); g.connect(masterGain);
      const t = AC.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.004 + dur);
      o.start(t); o.stop(t + dur + 0.04);
    } catch {}
  }

  const sfx = {
    type() { beep(1500 + Math.random() * 600, 0.03, 'square', 0.05); },
    scramble() { beep(2200 + Math.random() * 1600, 0.025, 'square', 0.05); },
    glitch() { for (let i = 0; i < 6; i++) setTimeout(() => beep(80 + Math.random() * 1200, 0.035, 'square', 0.14), i * 30); },
    progress() {
      const { AC, masterGain } = audioRef.current;
      if (!AC) return;
      try {
        const o = AC.createOscillator(); const g = AC.createGain(); const f = AC.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(110, AC.currentTime);
        o.frequency.linearRampToValueAtTime(560, AC.currentTime + 5.2);
        f.type = 'lowpass'; f.frequency.value = 1800; f.Q.value = 6;
        o.connect(f); f.connect(g); g.connect(masterGain);
        g.gain.setValueAtTime(0, AC.currentTime);
        g.gain.linearRampToValueAtTime(0.14, AC.currentTime + 0.3);
        g.gain.linearRampToValueAtTime(0.14, AC.currentTime + 5);
        g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 5.4);
        o.start(); o.stop(AC.currentTime + 5.5);
      } catch {}
    },
    breach() {
      [220, 330, 110, 440].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'square', 0.3), i * 60));
      sfx.whoosh();
    },
    granted() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => beep(f, 0.24, 'sine', 0.28), i * 90));
    },
    whoosh() {
      const { AC, masterGain } = audioRef.current;
      if (!AC) return;
      try {
        const bufferSize = AC.sampleRate * 0.7;
        const buf = AC.createBuffer(1, bufferSize, AC.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const src = AC.createBufferSource(); src.buffer = buf;
        const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
        f.frequency.setValueAtTime(200, AC.currentTime);
        f.frequency.exponentialRampToValueAtTime(3000, AC.currentTime + 0.6);
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, AC.currentTime);
        g.gain.linearRampToValueAtTime(0.32, AC.currentTime + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.65);
        src.connect(f); f.connect(g); g.connect(masterGain);
        src.start(); src.stop(AC.currentTime + 0.7);
      } catch {}
    },
    click() { beep(880, 0.05, 'triangle', 0.16); },
    success() { beep(1046.5, 0.12, 'sine', 0.22); setTimeout(() => beep(1318.5, 0.16, 'sine', 0.22), 80); },
  };

  /* ═════ MATRIX RAIN ═════ */
  function matrixResize() {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    const fontSize = 14;
    const m = matrixRef.current;
    m.cols = Math.floor(cv.width / fontSize);
    m.drops = new Array(m.cols).fill(0).map(() => Math.random() * -cv.height);
  }

  function matrixFrame() {
    const m = matrixRef.current;
    const cv = canvasRef.current;
    if (!m.running || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = 'bold 14px JetBrains Mono,monospace';
    for (let i = 0; i < m.cols; i++) {
      const ch = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
      const x = i * 14;
      const y = m.drops[i] * 14;
      ctx.fillStyle = y < 20 ? '#ff6680' : 'rgba(255,0,51,.85)';
      ctx.fillText(ch, x, y);
      if (y > cv.height && Math.random() > 0.975) m.drops[i] = 0;
      m.drops[i]++;
    }
    requestAnimationFrame(matrixFrame);
  }

  function startMatrix() {
    matrixRef.current.running = true;
    canvasRef.current?.classList.add(styles.on);
    matrixFrame();
  }

  function stopMatrix() {
    matrixRef.current.running = false;
    canvasRef.current?.classList.remove(styles.on);
  }

  /* ═════ LOG ROW ═════ */
  function logRow(text) {
    const log = hackLogRef.current;
    if (!log) return;
    const row = document.createElement('div');
    row.className = styles.row;
    const m = text.match(/^\[([A-Z]+)\]\s(.*)$/);
    const tag = m ? m[1] : 'SYS';
    const msg = m ? m[2] : text;
    const p = document.createElement('span'); p.className = styles.p; p.textContent = '>';
    const t = document.createElement('span'); t.className = styles.msg; t.textContent = msg;
    const g = document.createElement('span'); g.className = styles.t; g.textContent = '[' + tag + ']';
    if (['INIT', 'NET', 'PORT', 'TLS', 'AUTH'].includes(tag)) g.className = styles.t + ' ' + styles.w;
    if (['EXPLOIT', 'BYPASS', 'HIT', 'WIPE', 'EXFIL'].includes(tag)) g.className = styles.t + ' ' + styles.r;
    row.appendChild(p); row.appendChild(t); row.appendChild(g);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    sfx.type();
  }

  /* ═════ HACK SEQUENCE — 6s ═════ */
  async function runHack() {
    if (!hackRef.current) return;
    hackRef.current.classList.add(styles.show);
    startMatrix();
    sfx.progress();
    requestAnimationFrame(() => {
      if (hackFillRef.current) hackFillRef.current.style.right = '0%';
    });
    const pctEl = hackPctRef.current;
    const pctStart = performance.now();
    (function updatePct() {
      const t = Math.min(1, (performance.now() - pctStart) / 5400);
      if (pctEl) pctEl.textContent = String(Math.floor(t * 100)).padStart(2, '0') + '%';
      if (t < 1) requestAnimationFrame(updatePct);
    })();
    const total = HACK_LOG_LINES.length;
    const interval = 5200 / total;
    for (let i = 0; i < total; i++) {
      logRow(HACK_LOG_LINES[i]);
      if (i === 7) sfx.glitch();
      if (i === 11) sfx.glitch();
      if (i === 15) sfx.scramble();
      await wait(interval);
    }
    await wait(200);
    sfx.breach();
    breachRef.current?.classList.add(styles.show);
    await wait(900);
    breachRef.current?.classList.remove(styles.show);
    hackRef.current.classList.add(styles.gone);
    stopMatrix();
    await wait(700);
    if (hackRef.current) hackRef.current.style.display = 'none';
    sfx.granted();
    ctaStageRef.current?.classList.add(styles.show);
  }

  /* ═════ LOGIN SEQUENCE — 4s ═════ */
  async function runLogin() {
    sfx.click();
    if (ctaStageRef.current) ctaStageRef.current.style.display = 'none';
    loginRef.current?.classList.add(styles.show);
    sfx.whoosh();
    const icons = loginRef.current?.querySelectorAll(`.${styles.icn}`) || [];
    const statuses = [
      'Validando estratégia...',
      'Carregando conteúdo...',
      'Ativando tráfego...',
      'Liberando autoridade...',
    ];
    const statusEl = loginStatusRef.current;
    const pctEl = loginPctRef.current;
    const fill = loginFillRef.current;
    requestAnimationFrame(() => { if (fill) fill.style.right = '0%'; });
    const pctStart = performance.now();
    (function upd() {
      const t = Math.min(1, (performance.now() - pctStart) / 3800);
      if (pctEl) pctEl.textContent = String(Math.floor(t * 100)).padStart(2, '0') + '%';
      if (t < 1) requestAnimationFrame(upd);
    })();
    for (let i = 0; i < icons.length; i++) {
      await wait(i === 0 ? 300 : 800);
      if (statusEl) statusEl.textContent = statuses[i];
      icons[i].classList.add(styles.on);
      sfx.success();
    }
    await wait(500);
    if (statusEl) statusEl.textContent = 'Acesso concedido · Redirecionando...';
    sfx.granted();
    await wait(400);
    safeComplete();
  }

  /* ═════ BOOT ═════ */
  function boot() {
    if (bootedRef.current) return;
    bootedRef.current = true;
    initAudio();
    const { AC } = audioRef.current;
    if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
    sfx.whoosh();
    const gate = gateRef.current;
    if (gate) {
      gate.classList.add(styles.hidden);
      setTimeout(() => {
        gate.style.display = 'none';
        runHack();
      }, 500);
    } else {
      runHack();
    }
  }

  function handleSkip() {
    matrixRef.current.running = false;
    try { audioRef.current.AC?.close(); } catch {}
    if (onSkip) onSkip();
    else safeComplete();
  }

  /* ═════ SETUP ═════ */
  useEffect(() => {
    matrixResize();
    function handleResize() { matrixResize(); }
    function handleKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && !audioRef.current.AC) boot();
      if (e.key === 'Escape') handleSkip();
    }
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKey);
      matrixRef.current.running = false;
      try { audioRef.current.AC?.close(); } catch {}
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  return (
    <div className={styles.root}>
      <button className={styles.skipBtn} onClick={handleSkip} title="Pular intro (Esc)">
        Pular intro
      </button>

      <canvas ref={canvasRef} className={styles.matrix} />

      {/* GATE */}
      <div ref={gateRef} className={styles.gate} onClick={boot}>
        <div className={styles.ring}><div className={styles.play} /></div>
        <h2>Clique para <em>iniciar a invasão</em></h2>
        <p>// canal seguro · áudio cifrado · ativar transmissão</p>
      </div>

      {/* HACK STAGE */}
      <div ref={hackRef} className={styles.hack}>
        <div className={styles.hackGrid} />
        <div className={styles.glow} />
        <div className={styles.wrap}>
          {/* TARGET CARD */}
          <div className={styles.target}>
            <div className={styles.scan} />
            <div className={styles.tag}><span>// TARGET ACQUIRED</span><b>● LOCKED</b></div>
            <div className={styles.logoRow}>
              <img src="/assets/sigma-logo.png" alt="SIGMA" />
              <div className={styles.info}>
                <div className={styles.t1}>Operação</div>
                <div className={styles.t2}>SIGMA <em>× {safeClient}</em></div>
              </div>
            </div>
            <div className={styles.meta}>
              <div><span className={styles.k}>HOST</span><span className={styles.v}>{safeHost}</span></div>
              <div><span className={styles.k}>PROTO</span><span className={`${styles.v} ${styles.brand}`}>RSA-4096</span></div>
              <div><span className={styles.k}>REGION</span><span className={styles.v}>{safeRegion}</span></div>
              <div><span className={styles.k}>CIPHER</span><span className={`${styles.v} ${styles.brand}`}>AES-256-GCM</span></div>
            </div>
            <div className={styles.bar}><div className={styles.fill} ref={hackFillRef} /></div>
            <div className={styles.pct}><span>DECRYPT PROGRESS</span><b ref={hackPctRef}>00%</b></div>
          </div>
          {/* LOG CONSOLE */}
          <div className={styles.log} ref={hackLogRef} />
        </div>
      </div>

      {/* BREACH FLASH */}
      <div ref={breachRef} className={styles.breach}><h1>SYSTEM BREACHED</h1></div>

      {/* CTA STAGE */}
      <div ref={ctaStageRef} className={styles.ctaStage}>
        <div className={styles.ctaBrand}>
          <img src="/assets/sigma-logo.png" alt="SIGMA" />
          <div>
            <div className={styles.t1}>// SIGMA SECURE VAULT</div>
            <div className={styles.t2}>Dossiê · {safeClient}</div>
          </div>
        </div>
        <h1>Acesso <em>liberado</em>.</h1>
        <p>Sistema hackeado. Dossiê confidencial descriptografado e pronto para leitura.</p>
        <button className={styles.cta} onClick={runLogin}>
          <span>Acesso confidencial</span>
          <span className={styles.arr}>→</span>
        </button>
      </div>

      {/* LOGIN STAGE */}
      <div ref={loginRef} className={styles.login}>
        <div className={styles.card}>
          <div className={styles.sigma}>
            <img src="/assets/sigma-logo.png" alt="SIGMA" />
            <span>SIGMA</span>
          </div>
          <div className={styles.brandTag}>// MARKETING DE VANTAGEM</div>
          <h2>Autenticando credenciais</h2>
          <div className={styles.sub}>Validando pilares do protocolo de crescimento...</div>

          <div className={styles.icons}>
            <div className={styles.icn} data-k="estr">
              <div className={styles.svg}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="5" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                </svg>
              </div>
              <div className={styles.nm}>Estratégia</div>
              <div className={styles.chk}>✓</div>
            </div>
            <div className={styles.icn} data-k="cont">
              <div className={styles.svg}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="14" rx="2" />
                  <path d="M3 9h18" />
                  <circle cx="7" cy="6.5" r=".6" fill="currentColor" />
                  <path d="M10 14l3-3 4 4" />
                </svg>
              </div>
              <div className={styles.nm}>Conteúdo</div>
              <div className={styles.chk}>✓</div>
            </div>
            <div className={styles.icn} data-k="traf">
              <div className={styles.svg}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17l5-5 4 4 8-8" />
                  <path d="M14 8h6v6" />
                </svg>
              </div>
              <div className={styles.nm}>Tráfego</div>
              <div className={styles.chk}>✓</div>
            </div>
            <div className={styles.icn} data-k="aut">
              <div className={styles.svg}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
                </svg>
              </div>
              <div className={styles.nm}>Autoridade</div>
              <div className={styles.chk}>✓</div>
            </div>
          </div>

          <div className={styles.loginBar}><div className={styles.fl} ref={loginFillRef} /></div>
          <div className={styles.status}>
            <span ref={loginStatusRef}>Inicializando handshake...</span>
            <b ref={loginPctRef}>00%</b>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className={styles.bottom}>
        <span>// SIGNED · SIGMA AGÊNCIA HACKER</span>
        <span className={styles.ok}>SECURE CHANNEL</span>
        <span className={styles.hash}>0x7A3F · {safeClient.slice(0, 6)} · V1</span>
      </div>
    </div>
  );
}
