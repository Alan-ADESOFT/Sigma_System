/**
 * pages/indicacao/[refCode].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Página secreta de venda — exclusiva para mobile, usada por quem recebeu
 * uma indicação de um cliente Sigma.
 *
 * Fluxo:
 *   1. Loading inicial → POST /api/referral/visit { refCode } registra
 *      a primeira visita (inicia o timer 72h) e retorna referral + config.
 *   2. Renderiza S1 (header) → S2 (VSL) → S3 (oferta) → S4 (CTA + timer).
 *   3. S3 e S4 só aparecem após o vídeo atingir 87% de duration (≈ 3:30 de 4min).
 *   4. Player customizado dispara /api/referral/video-progress a cada
 *      checkpoint (25%, 50%, 75%, 100%).
 *   5. Timer faz countdown local sincronizado com expires_at do servidor;
 *      revalida via /api/referral/check-timer ao bater em 0.
 *
 * Layout responsivo: a mesma página renderiza bem em mobile e desktop.
 * No desktop ganha mais respiro, tipografia maior e container mais largo
 * (até 720px). Sem header, sem sidebar — landing pura nos dois tamanhos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '../../assets/style/indicacao.module.css';

/* ═══════════════════════════════════════════════════════════
   PÁGINA — orquestrador
═══════════════════════════════════════════════════════════ */

export default function IndicacaoPage() {
  const router = useRouter();
  const { refCode } = router.query;

  const [loading, setLoading] = useState(true);
  const [referral, setReferral] = useState(null);
  const [config, setConfig] = useState(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState(null);
  const [msRemaining, setMsRemaining] = useState(null);

  // Carrega na entrada — registra visita + busca config
  useEffect(() => {
    if (!refCode) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/referral/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refCode }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (!data.success) {
          setError(data.error || 'Link inválido');
          setLoading(false);
          return;
        }

        setReferral(data.referral);
        setConfig(data.config);
        setExpired(!!data.expired);
        setMsRemaining(data.msRemaining);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[Indicacao] erro ao carregar', err);
        setError('Erro de conexão');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [refCode]);

  /* ─── Loading ─── */
  if (loading) {
    return (
      <>
        <Head>
          <title>SIGMA</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className={styles.secretLoading}>
          <div className={styles.secretLoadingSpinner} />
          <div className={styles.secretLoadingText}>Validando acesso...</div>
        </div>
      </>
    );
  }

  /* ─── Erro / link inválido ─── */
  if (error || !referral) {
    return (
      <>
        <Head>
          <title>SIGMA</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className={styles.secretPage}>
          <div className={styles.secretContainer}>
            <div className={styles.expiredScreen}>
              <div className={styles.expiredIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <h1 className={styles.expiredTitle}>Link inválido</h1>
              <p className={styles.expiredText}>
                Este acesso não existe ou foi digitado incorretamente. Peça
                ao seu amigo que reenvie o link.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ─── Expirado — animação de dissolução ─── */
  if (expired || (msRemaining !== null && msRemaining <= 0)) {
    return <ExpiredScreen />;
  }

  return <SecretPageContent
    refCode={refCode}
    referral={referral}
    config={config}
    msRemaining={msRemaining}
  />;
}

/* ═══════════════════════════════════════════════════════════
   CONTAINER — controla revelação da oferta baseada no tempo
   da VSL. A oferta + CTA ficam ESCONDIDOS até o vídeo passar
   de offer_reveal_at segundos (config do tenant). Enquanto
   isso, mostra um aviso "ASSISTA O VÍDEO EM DESTAQUE".
═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   EXPIRED SCREEN — animação cinematográfica de dissolução
═══════════════════════════════════════════════════════════ */
function ExpiredScreen() {
  const [phase, setPhase] = useState(0); // 0=glitch, 1=dissolve, 2=message

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <>
      <Head>
        <title>SIGMA · Acesso expirado</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <style jsx global>{`
        @keyframes expGlitch {
          0%, 100% { transform: translate(0); filter: none; }
          20% { transform: translate(-3px, 2px); filter: hue-rotate(90deg); }
          40% { transform: translate(3px, -2px); filter: hue-rotate(-90deg) saturate(3); }
          60% { transform: translate(-2px, -1px); filter: brightness(1.5) contrast(2); }
          80% { transform: translate(2px, 1px); filter: invert(0.1); }
        }
        @keyframes expDissolve {
          0% { opacity: 1; filter: blur(0px) brightness(1); transform: scale(1); }
          40% { opacity: 0.6; filter: blur(2px) brightness(0.8); transform: scale(0.98); }
          100% { opacity: 0; filter: blur(12px) brightness(0.3); transform: scale(0.92); }
        }
        @keyframes expFadeIn {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes expPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
      <div style={{
        minHeight: '100vh', background: '#000', display: 'flex',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {/* Fase 0-1: conteúdo fantasma que "dissolve" */}
        {phase < 2 && (
          <div style={{
            textAlign: 'center', padding: '0 24px',
            animation: phase === 0 ? 'expGlitch 0.8s ease-in-out' : 'expDissolve 1.4s ease-out forwards',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
              background: 'rgba(255,0,51,0.1)', border: '2px solid rgba(255,0,51,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.1rem', color: '#fff', fontWeight: 700 }}>
              SIGMA
            </div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.7rem', color: '#555', marginTop: 8 }}>
              Acesso Exclusivo
            </div>
          </div>
        )}

        {/* Fase 2: mensagem final */}
        {phase === 2 && (
          <div style={{
            textAlign: 'center', padding: '0 32px', maxWidth: 440,
            animation: 'expFadeIn 0.8s ease-out',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 24px',
              background: 'rgba(255,0,51,0.06)', border: '1px solid rgba(255,0,51,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h1 style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: '1.2rem',
              color: '#fff', fontWeight: 700, marginBottom: 12, lineHeight: 1.3,
            }}>
              Infelizmente, seu tempo acabou
            </h1>
            <p style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: '0.72rem',
              color: '#666', lineHeight: 1.7, marginBottom: 24,
            }}>
              Essa oferta era exclusiva e tinha validade de 72 horas
              a partir do primeiro acesso. O prazo expirou e a página
              não está mais disponível.
            </p>
            <div style={{
              padding: '12px 18px', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: 'var(--font-mono, monospace)', fontSize: '0.62rem', color: '#444',
              animation: 'expPulse 3s infinite',
            }}>
              Se tiver interesse, converse com quem te indicou para saber mais sobre a Sigma.
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   NAME GATE — coleta nome + telefone antes de liberar conteúdo
═══════════════════════════════════════════════════════════ */
function NameGate({ refCode, onComplete }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function maskPhone(v) {
    let d = (v || '').replace(/\D/g, '').slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Informe seu nome'); return; }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { setError('Informe um telefone válido'); return; }

    setSaving(true); setError('');
    try {
      const r = await fetch('/api/referral/collect-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refCode, name: name.trim(), phone: digits }),
      });
      const d = await r.json();
      if (!d.success) { setError(d.error || 'Erro ao salvar'); setSaving(false); return; }
      // Salva no localStorage para não pedir de novo
      try { localStorage.setItem(`ref_gate_${refCode}`, '1'); } catch {}
      onComplete();
    } catch {
      setError('Erro de conexão');
    }
    setSaving(false);
  }

  const inputStyle = {
    width: '100%', padding: '14px 16px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#fff',
    fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem',
    outline: 'none', transition: 'border-color 0.2s',
  };

  return (
    <>
      <Head>
        <title>SIGMA · Acesso Exclusivo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#000000" />
      </Head>
      <style jsx global>{`
        @keyframes gateIn { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes gatePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,0,51,0.4); } 50% { box-shadow: 0 0 20px 4px rgba(255,0,51,0.15); } }
      `}</style>
      <div style={{
        minHeight: '100vh', background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}>
        <form
          onSubmit={handleSubmit}
          style={{
            width: '100%', maxWidth: 400,
            animation: 'gateIn 0.6s ease-out',
          }}
        >
          {/* Logo / Badge */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              display: 'inline-block', padding: '6px 16px', borderRadius: 20,
              background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)',
              fontFamily: 'var(--font-mono, monospace)', fontSize: '0.55rem',
              fontWeight: 700, letterSpacing: '0.2em', color: '#D4A843',
              textTransform: 'uppercase', marginBottom: 20,
            }}>
              Acesso Exclusivo
            </div>
            <h1 style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: '1.15rem',
              color: '#fff', fontWeight: 700, lineHeight: 1.4, marginBottom: 8,
            }}>
              Você foi convidado para algo especial
            </h1>
            <p style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem',
              color: '#666', lineHeight: 1.6,
            }}>
              Para liberar seu acesso exclusivo, informe seus dados abaixo.
            </p>
          </div>

          {/* Campos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{
                fontFamily: 'var(--font-mono, monospace)', fontSize: '0.58rem',
                fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: '#555', marginBottom: 6, display: 'block',
              }}>Seu nome</label>
              <input
                style={inputStyle}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Como podemos te chamar?"
                autoFocus
              />
            </div>
            <div>
              <label style={{
                fontFamily: 'var(--font-mono, monospace)', fontSize: '0.58rem',
                fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: '#555', marginBottom: 6, display: 'block',
              }}>WhatsApp</label>
              <input
                style={inputStyle}
                value={maskPhone(phone)}
                onChange={e => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                inputMode="tel"
              />
            </div>
          </div>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 14,
              background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.2)',
              fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem', color: '#ff6680',
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%', padding: '16px 0', borderRadius: 8, border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? 'rgba(255,0,51,0.4)' : 'linear-gradient(135deg, #ff0033, #cc0029)',
              color: '#fff', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem',
              fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              animation: saving ? 'none' : 'gatePulse 2.4s infinite',
              opacity: saving ? 0.6 : 1, transition: 'opacity 0.2s',
            }}
          >
            {saving ? 'Liberando...' : 'Liberar Acesso'}
          </button>

          <div style={{
            textAlign: 'center', marginTop: 16,
            fontFamily: 'var(--font-mono, monospace)', fontSize: '0.55rem', color: '#333',
          }}>
            Seus dados estão seguros e não serão compartilhados.
          </div>
        </form>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   CONTAINER — controla revelação da oferta baseada no tempo
   da VSL + gate de nome/telefone antes do conteúdo.
═══════════════════════════════════════════════════════════ */

function SecretPageContent({ refCode, referral, config, msRemaining }) {
  const revealAtSeconds = config?.offerRevealAt ?? 210;
  const [offerRevealed, setOfferRevealed] = useState(false);

  // Gate: checa se já preencheu (localStorage ou referral.referred_name)
  const alreadyFilled = !!(referral?.referred_name || referral?.referredName);
  const [gateCleared, setGateCleared] = useState(() => {
    if (alreadyFilled) return true;
    try { return localStorage.getItem(`ref_gate_${refCode}`) === '1'; } catch { return false; }
  });

  // Se ainda não preencheu nome/telefone, mostra o gate
  if (!gateCleared) {
    return <NameGate refCode={refCode} onComplete={() => setGateCleared(true)} />;
  }

  function handleReveal() {
    if (offerRevealed) return;
    setOfferRevealed(true);
    setTimeout(() => {
      const el = document.getElementById('offer-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  }

  function handleMilestone(percent) {
    fetch('/api/referral/video-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refCode, percent }),
    }).catch(() => {});
  }

  return (
    <>
      <Head>
        <title>SIGMA · Acesso Exclusivo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#000000" />
      </Head>

      <div className={styles.secretPage}>
        <div className={styles.secretContainer}>
          <SecretHeader referrerName={null} />
          <VSLSection
            refCode={refCode}
            videoUrl={config?.vslVideoUrl}
            duration={config?.vslVideoDuration || 240}
            revealAtSeconds={revealAtSeconds}
            onMilestone={handleMilestone}
            onRevealOffer={handleReveal}
          />

          {/* Aviso enquanto a oferta tá oculta — chama atenção pro vídeo */}
          {!offerRevealed && <WatchVideoNotice />}

          {/* Oferta + CTA — só aparecem após revealAtSeconds da VSL */}
          {offerRevealed && (
            <>
              <OfferSection config={config} />
              <CTASection
                config={config}
                timerExpires={referral?.timerExpires}
                initialMs={msRemaining}
                refCode={refCode}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   AVISO — "Assista o vídeo em destaque"
   Aparece entre a VSL e o ponto onde a oferta vai surgir,
   enquanto o vídeo ainda não atingiu o tempo de revelação.
═══════════════════════════════════════════════════════════ */

function WatchVideoNotice() {
  return (
    <div className={styles.watchNotice}>
      <div className={styles.watchNoticeIcon}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      </div>
      <div className={styles.watchNoticeText}>
        <div className={styles.watchNoticeTitle}>ASSISTA O VÍDEO EM DESTAQUE</div>
        <div className={styles.watchNoticeSub}>
          O acesso completo libera durante a explicação. Não pula.
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   S1 — HEADER DE EXCLUSIVIDADE
═══════════════════════════════════════════════════════════ */

function SecretHeader({ referrerName }) {
  return (
    <div className={styles.secretHeader}>
      <div className={styles.exclusiveLabel}>ACESSO EXCLUSIVO</div>
      <h1 className={styles.secretHeadline}>
        Você recebeu algo que<br />não existe em lugar nenhum.
      </h1>
      <p className={styles.secretSubline}>
        {referrerName ? (
          <>
            <strong>{referrerName}</strong> confiou em você pra ver isso.
          </>
        ) : (
          'Alguém que você conhece confiou em você pra ver isso.'
        )}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   S2 — VSL (player com tracking de progresso)
═══════════════════════════════════════════════════════════ */

function VSLSection({ refCode, videoUrl, duration, revealAtSeconds, onMilestone, onRevealOffer }) {
  const videoRef = useRef(null);
  const milestonesHitRef = useRef(new Set());
  const [unmuted, setUnmuted] = useState(false);
  const [revealedOffer, setRevealedOffer] = useState(false);
  const revealAt = Math.max(0, Number(revealAtSeconds) || 210);

  // Detecta provedor pra montar embed correto
  const embed = (() => {
    if (!videoUrl) return null;
    const url = videoUrl.trim();

    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
    if (yt) {
      // autoplay + muted (mobile policy) + sem controles do YT
      return {
        type: 'iframe',
        src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1`,
      };
    }

    const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeo) {
      return {
        type: 'iframe',
        src: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&muted=1&controls=0&background=0&playsinline=1`,
      };
    }

    if (url.includes('pandavideo')) {
      return { type: 'iframe', src: url };
    }

    if (/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url)) {
      return { type: 'video', src: url };
    }

    return { type: 'iframe', src: url };
  })();

  /* ─── Tracking de progresso pro <video> nativo ─── */
  useEffect(() => {
    if (embed?.type !== 'video') return;
    const v = videoRef.current;
    if (!v) return;

    function onTimeUpdate() {
      if (!v.duration || v.duration === Infinity) return;
      const percent = (v.currentTime / v.duration) * 100;

      // Checkpoint 25%, 50%, 75%, 100% — métrica de progresso pro backend
      [25, 50, 75, 100].forEach(mark => {
        if (percent >= mark && !milestonesHitRef.current.has(mark)) {
          milestonesHitRef.current.add(mark);
          onMilestone(mark);
        }
      });

      // Revela oferta quando o tempo absoluto bate em revealAt segundos
      if (v.currentTime >= revealAt && !revealedOffer) {
        setRevealedOffer(true);
        onRevealOffer && onRevealOffer();
      }
    }

    v.addEventListener('timeupdate', onTimeUpdate);
    return () => v.removeEventListener('timeupdate', onTimeUpdate);
  }, [embed, onMilestone, onRevealOffer, revealedOffer, revealAt]);

  /* ─── Tracking via timer pro iframe (sem postMessage API) ───
   * Pra YT/Vimeo/Panda em iframe, não dá pra ouvir timeupdate.
   * Estimamos pelo relógio: a partir do mount, contamos N segundos
   * baseados na duração configurada e disparamos os checkpoints.
   * É aproximação, mas é o que dá sem SDK específico de cada player. */
  useEffect(() => {
    if (embed?.type !== 'iframe') return;
    if (!duration || duration <= 0) return;

    const startTs = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTs) / 1000;
      const percent = Math.min(100, (elapsed / duration) * 100);

      [25, 50, 75, 100].forEach(mark => {
        if (percent >= mark && !milestonesHitRef.current.has(mark)) {
          milestonesHitRef.current.add(mark);
          onMilestone(mark);
        }
      });

      // Revela oferta quando o relógio bate em revealAt segundos
      if (elapsed >= revealAt && !revealedOffer) {
        setRevealedOffer(true);
        onRevealOffer && onRevealOffer();
      }

      if (percent >= 100) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [embed, duration, onMilestone, onRevealOffer, revealedOffer, revealAt]);

  /* ─── Tap no overlay → ativa som no <video> ─── */
  function handleUnmute() {
    if (embed?.type === 'video' && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {});
    }
    // Para iframes (YouTube/Vimeo): recarrega sem mute
    if (embed?.type === 'iframe' && embed.src) {
      const el = document.querySelector(`.${styles.vslWrapper} iframe`);
      if (el) el.src = embed.src.replace(/mute=1|muted=1/g, 'mute=0');
    }
    setUnmuted(true);
  }

  return (
    <div className={styles.vslSection}>
      <div className={styles.vslWrapper}>
        {embed?.type === 'iframe' && (
          <iframe
            src={embed.src}
            title="VSL"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        )}
        {embed?.type === 'video' && (
          <video
            ref={videoRef}
            src={embed.src}
            autoPlay
            muted={!unmuted}
            playsInline
            controls={unmuted}
          />
        )}
        {!embed && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
          }}>
            Vídeo não configurado
          </div>
        )}

        {/* Overlay tap-to-unmute — funciona pra <video> nativo e iframes */}
        {embed && !unmuted && (
          <div className={styles.vslOverlay} onClick={handleUnmute}>
            <div className={styles.vslOverlayPlay}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
                <polygon points="6 4 20 12 6 20 6 4" />
              </svg>
            </div>
          </div>
        )}
      </div>

      <div className={styles.vslHint}>
        Assista até o final · tem algo pra você
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   S3 — OFERTA (preço + checklist + badges)
═══════════════════════════════════════════════════════════ */

function OfferSection({ config }) {
  const price        = Number(config?.offerPrice || 997);
  const original     = Number(config?.offerOriginal || 5000);
  const installments = config?.offerInstallments || 12;
  const installmentValue = (price / installments).toFixed(2);

  function fmt(v) {
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  const checklist = [
    '15 dias de raio-X completo do seu negócio',
    '15 vídeos exclusivos com a metodologia',
    'Análise profunda dos seus concorrentes',
    'Mapeamento de vazamentos de receita',
    'Diagnóstico de dados e automação',
    'Relatório final + plano de ação',
    'Reunião de estratégia 1:1',
    'Acesso à comunidade Sigma',
  ];

  return (
    <section className={styles.offerSection} id="offer-section">
      <div className={styles.offerCard}>
        <h2 className={styles.offerTitle}>
          DIAGNÓSTICO COMPLETO<br />— RAIO-X DO NEGÓCIO —
        </h2>

        <div className={styles.offerPriceRow}>
          <div className={styles.offerOriginalPrice}>De R$ {fmt(original)}</div>
          <div className={styles.offerCurrentPrice}>R$ {fmt(price)}</div>
          <div className={styles.offerInstallment}>
            ou {installments}x de R$ {installmentValue.replace('.', ',')}
          </div>
        </div>

        <div className={styles.offerChecklist}>
          {checklist.map((item, i) => (
            <div key={i} className={styles.offerChecklistItem}>
              <span className={styles.offerChecklistIcon}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              {item}
            </div>
          ))}
        </div>

        <div className={styles.offerBadges}>
          <span className={`${styles.offerBadge} ${styles.exclusive}`}>
            EXCLUSIVO PARA INDICADOS
          </span>
          <span className={`${styles.offerBadge} ${styles.guarantee}`}>
            Garantia 7 dias · 100%
          </span>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   S4 — CTA + TIMER
═══════════════════════════════════════════════════════════ */

function CTASection({ config, timerExpires, initialMs, refCode }) {
  const [msLeft, setMsLeft] = useState(initialMs ?? 72 * 3600 * 1000);

  // Sincroniza o tick local com o expires do servidor
  useEffect(() => {
    if (!timerExpires) return;
    const expiresAt = new Date(timerExpires).getTime();

    function tick() {
      setMsLeft(Math.max(0, expiresAt - Date.now()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerExpires]);

  // Quando bater em 0, revalida com o servidor (anti-relógio-local)
  useEffect(() => {
    if (msLeft > 0) return;
    fetch(`/api/referral/check-timer?refCode=${encodeURIComponent(refCode)}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.expired) {
          // Recarrega a página pra mostrar tela de expirado
          window.location.reload();
        }
      })
      .catch(() => {});
  }, [msLeft, refCode]);

  function fmtTimer(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const checkoutUrl = config?.checkoutUrl || '#';

  return (
    <section className={styles.ctaSection}>
      <a
        href={checkoutUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.ctaButton}
      >
        QUERO MEU DIAGNÓSTICO AGORA
      </a>

      <div className={styles.ctaSafetyRow}>
        <span>Pagamento seguro</span>
        <span>Até {config?.offerInstallments || 12}x</span>
        <span>Garantia 7 dias</span>
      </div>

      <div className={styles.timerBox}>
        <div className={styles.timerLabel}>Acesso expira em</div>
        <div className={styles.timerValue}>{fmtTimer(msLeft)}</div>
      </div>
    </section>
  );
}

