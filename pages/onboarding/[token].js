/**
 * pages/onboarding/[token].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Página pública (sem auth) do sistema de onboarding por etapas.
 *
 * O cliente acessa pelo link enviado via WhatsApp:
 *   https://app.sigma/onboarding/{token}
 *
 * Estados possíveis (vindos da API current-stage):
 *   - 'not_found'    → token inválido
 *   - 'expired'      → token vencido
 *   - 'not_started'  → progresso criado mas onboarding não foi ativado
 *   - 'rest_day'     → hoje é dia de descanso (4, 8 ou 13)
 *   - 'stage_ready'  → tem etapa nova pra responder (renderiza StageView)
 *   - 'stage_done'   → a etapa do dia já foi respondida (botão de adiantar)
 *   - 'completed'    → onboarding terminou
 *   - 'waiting_next' → caso de borda (não deveria acontecer com config padrão)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import OnboardingStageView from '../../components/OnboardingStageView';
import { useNotification } from '../../context/NotificationContext';
import styles from '../../assets/style/onboarding.module.css';

/* ═══════════════════════════════════════════════════════════
   ÍCONES SVG
═══════════════════════════════════════════════════════════ */

function IconX() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconCoffee() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA
═══════════════════════════════════════════════════════════ */

export default function OnboardingPage() {
  const router = useRouter();
  const { token } = router.query;
  const { notify } = useNotification();

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);

  /* ─── Carrega o snapshot da API ─── */
  const loadStage = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/current-stage?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!data.success) {
        if (data.state === 'not_found') setError('not_found');
        else setError(data.error || 'unknown');
        return;
      }
      setSnapshot(data);
      setError(null);
    } catch (err) {
      console.error('[OnboardingPage] erro ao carregar', err);
      setError('connection');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadStage();
  }, [loadStage]);

  /* ─── Calcula progresso geral pra barra do topo ─── */
  const totalStages = 12;
  const currentProgress = snapshot?.progress?.currentStage || 0;
  const progressPct = Math.min(100, Math.round((currentProgress / totalStages) * 100));

  return (
    <div className={styles.pageWrapper}>
      <Head>
        <title>SIGMA | Onboarding</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className={styles.circuitBg} />

      {/* ── BARRA SUPERIOR ── */}
      <header className={styles.topBar}>
        <div className={styles.topBarBrand}>
          <img src="/logo.ranca.png" alt="SIGMA" className={styles.topBarLogo} />
        </div>
        <span className={styles.topBarLabel}>// Onboarding</span>
      </header>

      {/* ── PROGRESS BAR (só quando temos snapshot ativo) ── */}
      {snapshot && (snapshot.state === 'stage_ready' || snapshot.state === 'stage_done') && (
        <>
          <div className={styles.progressBarTrack}>
            <div className={styles.progressBarFill} style={{ width: `${progressPct}%` }} />
          </div>
          <div className={styles.progressLabel}>
            ETAPA {currentProgress} DE {totalStages} — {progressPct}% CONCLUÍDO
          </div>
        </>
      )}

      {/* ── CONTEÚDO PRINCIPAL ── */}
      <main className={styles.contentArea}>
        {loading && <LoadingScreen />}

        {!loading && error && <ErrorScreen reason={error} />}

        {!loading && !error && snapshot && (
          <>
            {snapshot.state === 'not_started'  && <NotStartedScreen />}
            {snapshot.state === 'expired'      && <ExpiredScreen />}
            {snapshot.state === 'completed'    && <CompletedScreen />}
            {snapshot.state === 'rest_day'     && <RestDayScreen day={snapshot.day} message={snapshot.message} />}
            {snapshot.state === 'waiting_next' && <WaitingNextScreen day={snapshot.day} />}

            {snapshot.state === 'stage_ready' && (
              <OnboardingStageView
                token={token}
                day={snapshot.day}
                stage={snapshot.stage}
                response={snapshot.response}
                nextStage={snapshot.nextStage}
                onSubmitted={loadStage}
              />
            )}

            {snapshot.state === 'stage_done' && (
              <StageDoneScreen
                day={snapshot.day}
                stage={snapshot.stage}
                nextStage={snapshot.nextStage}
                token={token}
                onAdvanced={loadStage}
              />
            )}
          </>
        )}
      </main>

      <footer className={styles.footer}>
        © Sigma Marketing · Confidencial
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TELAS DE ESTADO
═══════════════════════════════════════════════════════════ */

function LoadingScreen() {
  return (
    <div className={styles.stateScreen}>
      <div className={styles.stateIcon}>
        <span className="spinner" style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#ff0033', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
      <div className={styles.stateText}>// validando acesso...</div>
    </div>
  );
}

function ErrorScreen({ reason }) {
  const messages = {
    not_found: { title: 'Link inválido', text: 'Este link não existe ou foi digitado incorretamente.' },
    connection: { title: 'Erro de conexão', text: 'Verifique sua internet e tente novamente.' },
    unknown: { title: 'Erro inesperado', text: 'Algo deu errado. Tente recarregar a página.' },
  };
  const m = messages[reason] || messages.unknown;
  return (
    <div className={styles.stateScreen}>
      <div className={styles.stateIcon}><IconX /></div>
      <h1 className={styles.stateTitle}>{m.title}</h1>
      <p className={styles.stateText}>{m.text}</p>
    </div>
  );
}

function ExpiredScreen() {
  return (
    <div className={styles.stateScreen}>
      <div className={`${styles.stateIcon} ${styles.warning}`}><IconClock /></div>
      <h1 className={styles.stateTitle}>Link expirado</h1>
      <p className={styles.stateText}>
        Esse link de onboarding venceu. Entre em contato com o time da Sigma
        para receber um novo.
      </p>
    </div>
  );
}

function NotStartedScreen() {
  return (
    <div className={styles.stateScreen}>
      <div className={styles.stateIcon}><IconClock /></div>
      <h1 className={styles.stateTitle}>Onboarding não iniciado</h1>
      <p className={styles.stateText}>
        Sua jornada ainda não foi ativada. O time da Sigma vai liberar em breve
        e te avisar via WhatsApp.
      </p>
    </div>
  );
}

function CompletedScreen() {
  return (
    <div className={styles.stateScreen}>
      <div className={`${styles.stateIcon} ${styles.success}`}><IconCheck /></div>
      <h1 className={styles.stateTitle}>Onboarding completo</h1>
      <p className={styles.stateText}>
        Você respondeu todas as 12 etapas. Obrigado pela honestidade — foi ela
        que fez esse trabalho valer. O time da Sigma já está montando sua
        estratégia personalizada.
      </p>
    </div>
  );
}

function RestDayScreen({ day, message }) {
  return (
    <div className={styles.stateScreen}>
      <div className={`${styles.stateIcon} ${styles.warning}`}><IconCoffee /></div>
      <h1 className={styles.stateTitle}>Dia {day} — Descanso</h1>
      <p className={styles.stateText}>{message}</p>
    </div>
  );
}

function WaitingNextScreen({ day }) {
  return (
    <div className={styles.stateScreen}>
      <div className={styles.stateIcon}><IconClock /></div>
      <h1 className={styles.stateTitle}>Aguardando próxima etapa</h1>
      <p className={styles.stateText}>
        Você está no dia {day} da jornada. A próxima etapa libera amanhã.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   STAGE_DONE — etapa do dia já respondida, mostra o botão de adiantar
═══════════════════════════════════════════════════════════ */

function StageDoneScreen({ day, stage, nextStage, token, onAdvanced }) {
  const { notify } = useNotification();
  const [advancing, setAdvancing] = useState(false);

  async function handleAdvance() {
    setAdvancing(true);
    try {
      const res = await fetch('/api/onboarding/advance-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!data.success) {
        notify(data.error || 'Não foi possível adiantar', 'error');
        setAdvancing(false);
        return;
      }
      notify(`Etapa ${data.nextStage.number} desbloqueada`, 'success');
      onAdvanced();
    } catch (err) {
      console.error('[StageDoneScreen] erro', err);
      notify('Erro de conexão', 'error');
      setAdvancing(false);
    }
  }

  return (
    <div style={{ animation: 'fadeInUp 0.5s ease-out both' }}>
      <div className={styles.stageHeader}>
        <div className={styles.stageDayTag}>
          <span className={styles.stageDayDot} />
          DIA {day} · ETAPA {stage?.number}
        </div>

        <h1 className={styles.stageTitleBig}>{stage?.title}</h1>
        <p className={styles.stageDescription}>Você já respondeu essa etapa. Tudo registrado.</p>

        <div className={styles.stageDivider} />

        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div className={`${styles.stateIcon} ${styles.success}`} style={{ margin: '0 auto 16px' }}>
            <IconCheck />
          </div>
          <div className={styles.stateText}>
            Próxima etapa libera amanhã.<br />
            Você pode aguardar ou adiantar agora.
          </div>
        </div>

        {nextStage && (
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div className={styles.advanceTitle}>Quer continuar agora?</div>
            <div className={styles.advanceSubtitle}>
              A próxima etapa será liberada amanhã, mas você pode adiantar.
            </div>
            <button
              className={styles.advanceBtn}
              onClick={handleAdvance}
              disabled={advancing}
            >
              {advancing ? '// adiantando...' : `→ Adiantar para ${nextStage.title}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
