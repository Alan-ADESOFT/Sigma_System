/**
 * pages/form/[token].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Formulário público de briefing SIGMA.
 * Página SEM autenticação — o token na URL é o único controle de acesso.
 * Mobile-first, design 100% brandbook SIGMA.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import FormWizard from '../../components/FormWizard';
import { useFormDraft } from '../../hooks/useFormDraft';
import { useNotification } from '../../context/NotificationContext';
import styles from '../../assets/style/form.module.css';

/* ═══════════════════════════════════════════════════════════
   ÍCONES SVG — inline para não depender de lib externa
═══════════════════════════════════════════════════════════ */

function IconX() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════ */

/**
 * Formata data ISO para PT-BR legível: "15 de março de 2026, 14:32"
 */
function formatDatePTBR(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function FormPage() {
  const router = useRouter();
  const { token } = router.query;
  const { notify } = useNotification();

  // 'loading' | 'not_found' | 'expired' | 'already_used' | 'valid'
  const [screenState, setScreenState] = useState('loading');
  const [clientData, setClientData] = useState(null);
  const [serverDraft, setServerDraft] = useState(null);

  // Draft aceito pelo usuário no modal de restauração
  const [acceptedDraft, setAcceptedDraft] = useState(null);

  // Hook de rascunho — ativado só quando o token é válido
  const draft = useFormDraft(
    screenState === 'valid' ? token : null,
    serverDraft
  );

  /* ── Valida o token ao carregar ── */
  useEffect(() => {
    if (!token) return;

    console.log('[FORM] Validando token...', { token: token.slice(0, 8) + '...' });

    fetch(`/api/form/validate-token?token=${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          console.log('[FORM] Token válido', { client: data.client?.company_name });
          setClientData(data.client);
          setServerDraft(data.draft);
          setScreenState('valid');
        } else if (data.reason === 'in_progress') {
          // Formulário em andamento — permite continuar se tiver rascunho local
          const localKey = `form_draft_${token}`;
          const hasLocal = typeof window !== 'undefined' && localStorage.getItem(localKey);
          if (hasLocal) {
            console.log('[FORM] Token in_progress mas existe rascunho local, permitindo acesso');
            setClientData(data.client);
            setServerDraft(data.draft);
            setScreenState('valid');
          } else {
            console.log('[FORM] Token in_progress, sem rascunho local — bloqueando');
            setScreenState('in_progress');
          }
        } else {
          console.log('[FORM] Token inválido', { reason: data.reason });
          setScreenState(data.reason || 'not_found');
        }
      })
      .catch(err => {
        console.error('[FORM] Erro ao validar token', err);
        notify('Erro de conexão ao validar o link. Tente recarregar a página.', 'error');
        setScreenState('not_found');
      });
  }, [token]);

  /* ── Renderiza a tela correta ── */
  return (
    <div className={styles.pageWrapper}>
      <Head>
        <title>SIGMA | Formulário de Briefing</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      {/* Grid de circuito no fundo */}
      <div className={styles.circuitBg} />

      {/* Barra superior */}
      <header className={styles.topBar}>
        <div className={styles.topBarBrand}>
          <img src="/logo.ranca.png" alt="SIGMA" className={styles.topBarLogoImg} />
        </div>
        <span className={styles.topBarLabel}>Formulário de Briefing</span>
      </header>

      {/* Conteúdo principal */}
      <main className={styles.contentArea}>
        {screenState === 'loading' && <LoadingScreen />}
        {screenState === 'not_found' && <InvalidScreen />}
        {screenState === 'expired' && <ExpiredScreen />}
        {screenState === 'already_used' && <AlreadyUsedScreen />}
        {screenState === 'in_progress' && <InProgressScreen />}
        {screenState === 'valid' && (
          <>
            {/* Modal de restauração de rascunho — aparece antes do wizard */}
            {draft.showDraftRestore ? (
              <DraftRestoreModal
                draft={draft.pendingDraft}
                onAccept={() => {
                  const restored = draft.acceptDraft();
                  setAcceptedDraft(restored);
                  notify('Rascunho restaurado. Continue de onde parou.', 'success', 3000);
                }}
                onReject={() => {
                  draft.rejectDraft();
                  notify('Rascunho descartado. Começando do zero.', 'info', 3000);
                }}
              />
            ) : (
              <FormWizard
                token={token}
                clientData={clientData}
                draft={acceptedDraft}
              />
            )}
          </>
        )}
      </main>

      {/* Rodapé */}
      <footer className={styles.footer}>
        © Sigma Marketing · Este formulário é confidencial.
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TELAS DE ESTADO
═══════════════════════════════════════════════════════════ */

function LoadingScreen() {
  return (
    <div className={styles.loadingScreen}>
      <span className={styles.loadingText}>// validando acesso...</span>
      <div className={styles.loadingDots}>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function InvalidScreen() {
  return (
    <div className={styles.errorScreen}>
      <div className={`${styles.errorIcon} ${styles.invalid}`}>
        <IconX />
      </div>
      <h1 className={styles.errorTitle}>Link inválido</h1>
      <p className={styles.errorDescription}>
        Este link não existe ou foi digitado incorretamente.
      </p>
    </div>
  );
}

function ExpiredScreen() {
  return (
    <div className={styles.errorScreen}>
      <div className={`${styles.errorIcon} ${styles.expired}`}>
        <IconClock />
      </div>
      <h1 className={styles.errorTitle}>Este link expirou</h1>
      <p className={styles.errorDescription}>
        Links de formulário são válidos por 7 dias.
        Entre em contato com a Sigma para receber um novo link.
      </p>
    </div>
  );
}

function AlreadyUsedScreen() {
  return (
    <div className={styles.errorScreen}>
      <div className={`${styles.errorIcon} ${styles.used}`}>
        <IconCheck />
      </div>
      <h1 className={styles.errorTitle}>Formulário já enviado</h1>
      <p className={styles.errorDescription}>
        Recebemos suas respostas. Obrigado!
        Nossa equipe entrará em contato em breve.
      </p>
    </div>
  );
}

function InProgressScreen() {
  return (
    <div className={styles.errorScreen}>
      <div className={`${styles.errorIcon} ${styles.inProgress}`}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h1 className={styles.errorTitle}>Formulário em andamento</h1>
      <p className={styles.errorDescription}>
        Este formulário já está sendo preenchido em outro dispositivo.
        Se você é o responsável, continue no navegador onde iniciou.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   RASCUNHO — Modal de restauração e banner informativo
═══════════════════════════════════════════════════════════ */

function DraftRestoreModal({ draft, onAccept, onReject }) {
  if (!draft) return null;

  const savedDate = formatDatePTBR(draft.savedAt);
  const step = draft.currentStep || 1;
  // Estimativa grosseira de % baseada na etapa (será refinada pelo wizard)
  const pct = Math.round((step / 11) * 100);

  return (
    <div className={styles.draftModal}>
      <div className={styles.draftModalCard}>
        <h2 className={styles.draftModalTitle}>Rascunho encontrado</h2>
        <p className={styles.draftModalText}>
          Você preencheu parte deste formulário em {savedDate}.
        </p>
        <p className={styles.draftModalMeta}>
          Etapa {step} de 11 · {pct}% preenchido
        </p>
        <div className={styles.draftModalButtons}>
          <button className={styles.draftModalBtnPrimary} onClick={onAccept}>
            Continuar de onde parou
          </button>
          <button className={styles.draftModalBtnSecondary} onClick={onReject}>
            Começar do zero
          </button>
        </div>
      </div>
    </div>
  );
}

