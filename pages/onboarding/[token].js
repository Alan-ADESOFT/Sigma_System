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
import refStyles from '../../assets/style/indicacao.module.css';

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
            {snapshot.state === 'completed'    && <CompletedScreen token={token} client={snapshot.client} />}
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

/* ─────────────────────────────────────────────────────────────────────────────
 * CompletedScreen — tela final do onboarding.
 * Contém celebração + bloco de indicação (link único + WhatsApp + status).
 * O ReferralBlock dispara /api/referral/generate no mount pra criar/buscar
 * o link e /api/referral/list pra carregar o histórico de indicações.
 * ──────────────────────────────────────────────────────────────────────────── */
function CompletedScreen({ token, client }) {
  return (
    <div className={refStyles.completionWrapper}>
      {/* ── BLOCO DE CELEBRAÇÃO ── */}
      <div className={refStyles.celebrationBlock}>
        <div className={`${styles.stateIcon} ${styles.success}`} style={{ margin: '0 auto' }}>
          <IconCheck />
        </div>
        <h1 className={refStyles.celebrationTitle}>RAIO-X COMPLETO</h1>
        <p className={refStyles.celebrationSubtitle}>
          Você respondeu todas as 12 etapas em 15 dias.<br />
          Isso é de quem leva a sério.
        </p>
        <p className={refStyles.celebrationFootnote}>
          Nos próximos dias, o time Sigma analisa tudo e constrói sua estratégia.
        </p>
      </div>

      <div className={refStyles.completionDivider} />

      {/* ── BLOCO DE INDICAÇÃO ── */}
      <ReferralBlock token={token} client={client} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ReferralBlock — gera o link único do cliente e lista as indicações já feitas.
 * Carrega assíncrono no mount: primeiro o link (POST generate), depois o
 * histórico (GET list?token=). Painel de "minhas indicações" colapsável.
 * ──────────────────────────────────────────────────────────────────────────── */
function ReferralBlock({ token, client }) {
  const { notify } = useNotification();
  const [referral, setReferral] = useState(null);
  const [config, setConfig] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);

  // Busca/cria o link e a lista no mount
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        // 1. Gera (ou reusa) o link — já vem com config (textos editáveis)
        const genRes = await fetch('/api/referral/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const genData = await genRes.json();
        if (cancelled) return;
        if (!genData.success) {
          console.warn('[ReferralBlock] generate falhou', genData);
          notify('Não foi possível gerar o link agora', 'error');
          return;
        }
        setReferral(genData.referral);
        setConfig(genData.config || null);

        // 2. Lista todas as indicações desse cliente
        const listRes = await fetch(`/api/referral/list?token=${encodeURIComponent(token)}`);
        const listData = await listRes.json();
        if (cancelled) return;
        if (listData.success) {
          setReferrals(listData.referrals || []);
        }
      } catch (err) {
        console.error('[ReferralBlock] erro', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, notify]);

  function handleCopy() {
    if (!referral?.refLink) return;
    try {
      navigator.clipboard.writeText(referral.refLink);
    } catch (err) {
      // Fallback antigo
      const ta = document.createElement('textarea');
      ta.value = referral.refLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setWarningOpen(true); // abre o modal com o aviso editável
    setTimeout(() => setCopied(false), 2200);
  }

  // Mensagem pré-preenchida pro WhatsApp — vem editável da config,
  // com placeholder {LINK} substituído pelo refLink real
  function whatsappUrl() {
    if (!referral?.refLink) return '#';
    const template = config?.whatsappMessage
      || 'Fala! Tô num processo com a Sigma que tá mudando minha visão. Consegui acesso EXCLUSIVO pra você. Só liberam quando cliente indica. Clica: {LINK}';
    const msg = template.replace(/\{LINK\}/g, referral.refLink);
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  // Mapeia status do banco pra label + classe CSS do dot
  function statusInfo(status) {
    switch (status) {
      case 'link_created':    return { label: 'Aguardando', dotClass: 'created' };
      case 'page_visited':    return { label: 'Acessou',    dotClass: 'visited' };
      case 'video_started':   return { label: 'Assistindo', dotClass: 'video' };
      case 'video_completed': return { label: 'Assistiu',   dotClass: 'completed' };
      case 'purchased':       return { label: 'Comprou!',   dotClass: 'purchased' };
      default:                return { label: status,       dotClass: 'created' };
    }
  }

  if (loading) {
    return (
      <div className={refStyles.referralCard}>
        <div className={refStyles.referralLabel}>ACESSO EXCLUSIVO — SÓ CLIENTES SIGMA</div>
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
          Gerando seu link...
        </div>
      </div>
    );
  }

  if (!referral) return null;

  return (
    <div className={refStyles.referralCard}>
      <div className={refStyles.referralLabel}>ACESSO EXCLUSIVO — SÓ CLIENTES SIGMA</div>

      <p className={refStyles.referralPitch}>
        Se você conhece alguém de <strong>outro segmento</strong> que merece o mesmo cuidado,
        compartilha o link abaixo. Sem disputa.
      </p>

      <p className={refStyles.referralExclusivity}>
        A Sigma não trabalha com seus concorrentes. Sua camisa é SUA.
      </p>

      {/* Linha do link copiável */}
      <div className={refStyles.linkRow}>
        <input
          type="text"
          readOnly
          value={referral.refLink}
          className={refStyles.linkInput}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          className={`${refStyles.copyBtn} ${copied ? refStyles.copied : ''}`}
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              OK
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copiar
            </>
          )}
        </button>
      </div>

      {/* Botão WhatsApp */}
      <a
        href={whatsappUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className={refStyles.whatsappBtn}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
        </svg>
        Enviar por WhatsApp
      </a>

      {/* Painel de indicações já feitas — colapsável */}
      <div className={refStyles.referralsList}>
        <div
          className={refStyles.referralsListHeader}
          onClick={() => setListOpen(o => !o)}
          role="button"
          tabIndex={0}
        >
          <span className={refStyles.referralsListTitle}>
            MINHAS INDICAÇÕES ({referrals.length})
          </span>
          <svg
            className={`${refStyles.referralsListChevron} ${listOpen ? refStyles.open : ''}`}
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {listOpen && (
          <div className={refStyles.referralItems}>
            {referrals.length === 0 && (
              <div className={refStyles.referralItemEmpty}>
                Nenhuma indicação ainda — copia o link e manda pra alguém.
              </div>
            )}
            {referrals.map((r) => {
              const info = statusInfo(r.status);
              const label = r.referredName || `#${r.refCode}`;
              return (
                <div key={r.id} className={refStyles.referralItem}>
                  <span className={`${refStyles.referralItemDot} ${refStyles[`${info.dotClass}`] || ''}`} />
                  <span className={refStyles.referralItemLabel}>{label}</span>
                  <span className={refStyles.referralItemStatus}>{info.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL DE AVISO AO COPIAR ── */}
      {warningOpen && (
        <CopyWarningModal
          message={config?.copyWarningMessage}
          onClose={() => setWarningOpen(false)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * CopyWarningModal — modal mostrado quando o cliente clica "Copiar".
 * Avisa sobre as 72h e pede pra ele não distribuir o link em massa.
 * O texto vem editável da config (referral_config.copy_warning_message).
 * ──────────────────────────────────────────────────────────────────────────── */
function CopyWarningModal({ message, onClose }) {
  // ESC fecha
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={refStyles.warningOverlay}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={refStyles.warningModal}>
        <div className={refStyles.warningModalIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div className={refStyles.warningModalLabel}>LINK COPIADO · ATENÇÃO</div>
        <p className={refStyles.warningModalText}>
          {message || 'ATENÇÃO: esse link é único e exclusivo. Quem você indicar tem APENAS 72 horas após o primeiro acesso pra ver a oferta — depois ela some pra sempre. Não envia pra qualquer um.'}
        </p>
        <button
          type="button"
          className={refStyles.warningModalBtn}
          onClick={onClose}
          autoFocus
        >
          ENTENDI
        </button>
      </div>
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
