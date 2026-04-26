/**
 * pages/aprovacao/[token].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Página PÚBLICA de aprovação de planejamento de conteúdo.
 * Sem autenticação. Token-gated. Apenas o link garante o acesso.
 *
 * State machine:
 *   loading → validate-token →
 *     ├─ not_found  → InvalidScreen
 *     ├─ expired    → ExpiredScreen
 *     ├─ revoked    → RevokedScreen
 *     ├─ password_required → PinScreen
 *     │     └─ password_incorrect → PinScreen com erro
 *     └─ valid      → ApprovalWizard
 *
 * IMPORTANTE: NUNCA usar resolveTenantId aqui (e nem nas APIs chamadas — elas
 * são as de /api/public/content-plan/*, todas validam pelo token).
 * NUNCA usar DashboardLayout / useAuth.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import styles from '../../assets/style/publicApproval.module.css';

import LoadingScreen from '../../components/contentPlanning/public/LoadingScreen';
import InvalidScreen from '../../components/contentPlanning/public/InvalidScreen';
import ExpiredScreen from '../../components/contentPlanning/public/ExpiredScreen';
import RevokedScreen from '../../components/contentPlanning/public/RevokedScreen';
import PinScreen from '../../components/contentPlanning/public/PinScreen';

const ApprovalWizard = dynamic(
  () => import('../../components/contentPlanning/public/ApprovalWizard'),
  { ssr: false, loading: () => <LoadingScreen /> }
);

const TRACK_OPEN_KEY_PREFIX = 'approval_tracked_';

export default function PublicApprovalPage() {
  const router = useRouter();
  const { token } = router.query;

  // 'loading' | 'not_found' | 'expired' | 'revoked' | 'pin_required' | 'valid' | 'rate_limited'
  const [screen, setScreen] = useState('loading');
  const [plan, setPlan] = useState(null);
  const [creatives, setCreatives] = useState([]);
  const [pin, setPin] = useState(null); // PIN aceito (passado pra cada submit)
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const saveResetRef = useRef(null);

  // Sininho da agencia: track-open uma unica vez por sessao
  const trackOpenOnce = useCallback((tk, currentPin) => {
    if (typeof window === 'undefined' || !tk) return;
    const key = TRACK_OPEN_KEY_PREFIX + tk;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {}
    fetch('/api/public/content-plan/track-open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tk, pin: currentPin || undefined }),
    }).catch(() => {});
  }, []);

  // Mapeamento HTTP/reason → screen
  function applyValidationResponse(status, data) {
    if (status === 429 || data.reason === 'rate_limited') return 'rate_limited';
    if (data.reason === 'password_required') return 'pin_required';
    if (data.success) return 'valid';
    if (data.reason === 'expired') return 'expired';
    if (data.reason === 'revoked') return 'revoked';
    return 'not_found';
  }

  // 1. Valida token na primeira carga (sem PIN)
  useEffect(() => {
    if (!token || typeof token !== 'string') return;
    let cancelled = false;

    fetch('/api/public/content-plan/validate-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json().then((d) => ({ status: r.status, data: d })))
      .then(({ status, data }) => {
        if (cancelled) return;
        const next = applyValidationResponse(status, data);
        setScreen(next);
        if (next === 'valid') {
          setPlan(data.plan);
          setCreatives(data.creatives || []);
          trackOpenOnce(token, null);
        }
      })
      .catch(() => { if (!cancelled) setScreen('not_found'); });

    return () => { cancelled = true; };
  }, [token, trackOpenOnce]);

  // 2. Submit do PIN
  function handlePinSubmit(pinValue, cb) {
    fetch('/api/public/content-plan/validate-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin: pinValue }),
    })
      .then((r) => r.json().then((d) => ({ status: r.status, data: d })))
      .then(({ status, data }) => {
        if (data.success) {
          setPin(pinValue);
          setPlan(data.plan);
          setCreatives(data.creatives || []);
          setScreen('valid');
          trackOpenOnce(token, pinValue);
          cb(null);
        } else if (status === 429 || data.reason === 'rate_limited') {
          cb('rate_limited');
        } else if (data.reason === 'password_incorrect' || data.reason === 'password_required') {
          cb('password_incorrect');
        } else {
          cb(data.reason || 'erro');
        }
      })
      .catch(() => cb('network'));
  }

  // 3. Indicador de salvamento (debounce do "saved" → idle apos 2s)
  function pushSaveStatus(s) {
    setSaveStatus(s);
    if (saveResetRef.current) clearTimeout(saveResetRef.current);
    if (s === 'saved') {
      saveResetRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }

  return (
    <>
      <Head>
        <title>SIGMA · Aprovação de planejamento</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#050505" />
      </Head>

      <div className={styles.pageWrap}>
        <div className={styles.circuitBg} aria-hidden="true" />
        <div className="hud-scanlines" aria-hidden="true" />
        <div className="hud-vignette" aria-hidden="true" />

        <header className={styles.topBar}>
          <img src="/logo.ranca.png" alt="SIGMA" className={styles.logoImg} />
          <span className={styles.topBarLabel}>Aprovação de Planejamento</span>
          <SaveBadge status={saveStatus} />
        </header>

        <main className={styles.contentArea}>
          {screen === 'loading'      && <LoadingScreen />}
          {screen === 'not_found'    && <InvalidScreen />}
          {screen === 'expired'      && <ExpiredScreen />}
          {screen === 'revoked'      && <RevokedScreen />}
          {screen === 'rate_limited' && <RateLimitedScreen />}
          {screen === 'pin_required' && <PinScreen onSubmit={handlePinSubmit} />}
          {screen === 'valid' && plan && (
            <ApprovalWizard
              token={typeof token === 'string' ? token : ''}
              plan={plan}
              creatives={creatives}
              pin={pin}
              onSaveStatus={pushSaveStatus}
            />
          )}
        </main>

        <footer className={styles.footer}>
          © Sigma Marketing · Esta página é confidencial. Não compartilhe o link.
        </footer>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Mini-componentes locais
───────────────────────────────────────────────────────────── */

function SaveBadge({ status }) {
  if (!status || status === 'idle') return null;
  if (status === 'saving') {
    return <span className={`${styles.saveStatus} ${styles.saveStatusSaving}`}>// salvando...</span>;
  }
  if (status === 'saved') {
    return <span className={`${styles.saveStatus} ${styles.saveStatusSaved}`}>✓ salvo</span>;
  }
  if (status === 'error') {
    return <span className={`${styles.saveStatus} ${styles.saveStatusError}`}>! erro ao salvar</span>;
  }
  return null;
}

function RateLimitedScreen() {
  return (
    <div className={`${styles.card} ${styles.statusCard}`}>
      <div className={`${styles.statusIcon} ${styles.statusIconWarning}`} aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h1 className={styles.statusTitle}>Muitas tentativas</h1>
      <p className={styles.statusDesc}>
        O acesso a este link foi temporariamente bloqueado por excesso de tentativas.
        Aguarde 15 minutos e tente novamente.
      </p>
      <div className={styles.statusHint}>// rate-limited</div>
    </div>
  );
}
