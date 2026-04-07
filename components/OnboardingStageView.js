/**
 * components/OnboardingStageView.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Componente que orquestra TODA a experiência de uma etapa do onboarding.
 *
 * Estados internos (linha do tempo do que o cliente vê):
 *   1. Header da etapa (sempre visível)
 *   2. Vídeo obrigatório
 *   3. Botão "Iniciar Formulário" — começa locked, libera após countdown de 20s
 *   4. Formulário (renderizado por OnboardingFormFields)
 *   5. Botão de envio
 *   6. Após envio: substitui tudo por <MicroCelebration />
 *   7. Botão flutuante de microfone abre <AudioRecorderPopup />
 *
 * Props:
 *   - token:        string
 *   - day:          number (dia atual da jornada)
 *   - stage:        objeto da etapa (vindo da API current-stage)
 *   - response:     respostas já salvas (rascunho ou submetidas)
 *   - nextStage:    teaser da próxima
 *   - onSubmitted:  () => void (chamado após envio bem-sucedido — pai pode recarregar)
 *
 * IMPORTANTE: o vídeo é barreira obrigatória. Se não tem URL configurada,
 * libera direto (modo teste). Se tem, o cliente assiste E aguarda 20s.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../assets/style/onboarding.module.css';
import { useNotification } from '../context/NotificationContext';
import OnboardingVideoPlayer from './OnboardingVideoPlayer';
import OnboardingFormFields from './OnboardingFormFields';
import AudioRecorderPopup from './AudioRecorderPopup';
import MicroCelebration from './MicroCelebration';

/* ─── Ícones inline ─── */
function PaperIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

const COUNTDOWN_SECONDS = 20;

export default function OnboardingStageView({
  token, day, stage, response, nextStage, onSubmitted,
}) {
  const { notify } = useNotification();

  /* ─── Estado do fluxo (vídeo → countdown → form → submit → celebração) ─── */
  const hasVideo = !!stage?.video?.url;
  // Se o cliente já assistiu o vídeo numa visita anterior (gravado no banco
  // via /api/onboarding/video-watched), pula a barreira: sem countdown,
  // sem precisar reassistir. O vídeo continua visível pra rever se quiser.
  const alreadyWatched = stage?.video?.watched || !hasVideo;

  const [videoWatched, setVideoWatched]   = useState(alreadyWatched);
  const [countdown, setCountdown]         = useState(alreadyWatched ? 0 : COUNTDOWN_SECONDS);
  const [formUnlocked, setFormUnlocked]   = useState(alreadyWatched);
  const [showForm, setShowForm]           = useState(false);

  /* ─── Estado do formulário ─── */
  const [formData, setFormData]   = useState(response?.responses || {});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [advancing, setAdvancing]   = useState(false);

  /* ─── Áudio popup ─── */
  const [audioOpen, setAudioOpen]                 = useState(false);
  const [recentlyFilled, setRecentlyFilled]      = useState(new Set());
  const [audioRemaining, setAudioRemaining]      = useState(6); // ajustado pelo backend depois
  const startTimeRef                              = useRef(Date.now());
  const draftDebounceRef                          = useRef(null);

  /* ─── Auto-save feedback visual ─── */
  // 'idle' = sem mudanças pendentes | 'saving' = request em andamento | 'saved' = ok
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  // Ref que espelha formData pra uso em beforeunload e no botão manual
  const formDataRef = useRef(formData);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  /* ─── Validação ─── */
  // Set de IDs de campos com erro (vazios + required)
  const [validationErrors, setValidationErrors] = useState(new Set());

  /* ── Insight colapsável ── */
  const [insightOpen, setInsightOpen] = useState(false);

  /* ═══════════════════════════════════════════════════════════
     EFEITOS — countdown, video watched, etc
  ═══════════════════════════════════════════════════════════ */

  /* ─── Countdown de 20s rodando EM PARALELO ao vídeo ─────────
   * Começa no mount e decrementa 1s por segundo até zerar.
   * Se não tem vídeo (modo teste), o countdown já começa em 0.
   * Se o vídeo dura 3 minutos, o countdown termina bem antes —
   * quando o vídeo acabar, libera imediato. Se o vídeo é curto
   * (ex: 5s), o cliente ainda precisa esperar os 15s restantes.
   * A ideia é não "contar 20s a mais" depois de assistir o vídeo,
   * mas sim GARANTIR 20s de tela, em paralelo. */
  useEffect(() => {
    if (!hasVideo) return; // modo teste — já liberado
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, hasVideo]);

  /* ─── Condição de unlock: vídeo assistido E countdown zerou ── */
  useEffect(() => {
    if (videoWatched && countdown <= 0) {
      setFormUnlocked(true);
    }
  }, [videoWatched, countdown]);

  /* ─── Reseta o estado quando muda a etapa (depois de adiantar dia) ── */
  useEffect(() => {
    const watched = stage?.video?.watched || !hasVideo;
    setVideoWatched(watched);
    setCountdown(watched ? 0 : COUNTDOWN_SECONDS);
    setFormUnlocked(watched);
    setShowForm(false);
    setFormData(response?.responses || {});
    setSubmitted(false);
    setRecentlyFilled(new Set());
    startTimeRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage?.number]);

  /* ═══════════════════════════════════════════════════════════
     CALLBACKS DE EVENTOS DO VÍDEO E FORMULÁRIO
  ═══════════════════════════════════════════════════════════ */

  /* Marca o vídeo como assistido — chama o backend pra registrar */
  const handleVideoWatched = useCallback(async () => {
    if (videoWatched) return;
    setVideoWatched(true);
    try {
      await fetch('/api/onboarding/video-watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, stageNumber: stage.number }),
      });
    } catch (err) {
      console.warn('[StageView] falha ao marcar vídeo (não bloqueante)', err);
    }
  }, [videoWatched, token, stage?.number]);

  /* Inicia o formulário — scroll suave até ele */
  function handleStartForm() {
    setShowForm(true);
    setTimeout(() => {
      document.getElementById('onboarding-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  /* ─── Salva o rascunho no servidor (assíncrono). Retorna Promise ─── */
  const saveDraft = useCallback(async (dataToSave) => {
    if (!token || !stage?.number) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/onboarding/submit-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          stageNumber: stage.number,
          responses: dataToSave,
          draftOnly: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        // Apaga o "Salvo" após 2.5s (volta a 'idle')
        setTimeout(() => {
          setSaveStatus(s => s === 'saved' ? 'idle' : s);
        }, 2500);
      } else {
        console.warn('[StageView] save retornou erro', data);
        setSaveStatus('idle');
      }
    } catch (err) {
      console.warn('[StageView] auto-save falhou', err);
      setSaveStatus('idle');
    }
  }, [token, stage?.number]);

  /* ─── Update de um campo + auto-save (debounced 1.2s) ─── */
  const handleFieldChange = useCallback((questionId, value) => {
    setFormData(prev => {
      const next = { ...prev, [questionId]: value };
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
      draftDebounceRef.current = setTimeout(() => saveDraft(next), 1200);
      return next;
    });

    // Remove o erro de validação assim que o cliente começa a corrigir
    setValidationErrors(prev => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  }, [saveDraft]);

  /* ─── Salvar manual (botão) — força save imediato ─── */
  const handleManualSave = useCallback(async () => {
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    await saveDraft(formDataRef.current);
    notify('Rascunho salvo', 'success', 2000);
  }, [saveDraft, notify]);

  /* ─── beforeunload: save síncrono via sendBeacon ao fechar aba ───
   * sendBeacon é a única forma de garantir que o request é enviado
   * mesmo que a aba feche. Usa POST com Blob pra mandar JSON. */
  useEffect(() => {
    if (!showForm) return;

    function handleBeforeUnload() {
      try {
        const payload = JSON.stringify({
          token,
          stageNumber: stage?.number,
          responses: formDataRef.current,
          draftOnly: true,
        });
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/onboarding/submit-stage', blob);
        console.log('[StageView] beforeunload — sendBeacon disparado');
      } catch (err) {
        console.warn('[StageView] sendBeacon falhou', err);
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [showForm, token, stage?.number]);

  /* ─── Helper: verifica se um valor pode ser considerado "preenchido" ─── */
  function isFilled(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'number') return true;
    return !!value;
  }

  /* ─── Valida required do formData contra a stage atual ─── */
  function validateRequiredFields() {
    const errors = new Set();
    const questions = stage?.questions || [];

    for (const q of questions) {
      if (!q.required) continue;

      // Composite: cada subcampo conta separado, todos obrigatórios se o pai é
      if (q.type === 'composite') {
        for (const sub of (q.fields || [])) {
          if (!isFilled(formData[sub.id])) errors.add(sub.id);
        }
        continue;
      }

      if (!isFilled(formData[q.id])) errors.add(q.id);
    }

    return errors;
  }

  /* Submit final */
  async function handleSubmit() {
    // 1. Valida required no front antes de mandar pro backend
    const errors = validateRequiredFields();
    if (errors.size > 0) {
      setValidationErrors(errors);
      notify(
        `Faltam ${errors.size} campo${errors.size > 1 ? 's' : ''} obrigatório${errors.size > 1 ? 's' : ''}.`,
        'error',
        4000
      );

      // Scroll suave pro primeiro campo faltante
      setTimeout(() => {
        const firstId = Array.from(errors)[0];
        const el = document.querySelector(`[data-question-id="${firstId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    // Limpa erros se passou
    setValidationErrors(new Set());

    setSubmitting(true);
    try {
      const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const res = await fetch('/api/onboarding/submit-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          stageNumber: stage.number,
          responses: formData,
          timeSpentSec: timeSpent,
          draftOnly: false,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        // Backend pode retornar 'missingFields' com lista de IDs faltantes
        if (Array.isArray(data.missingFields) && data.missingFields.length > 0) {
          setValidationErrors(new Set(data.missingFields));
          notify('Servidor encontrou campos obrigatórios vazios.', 'error');
        } else {
          notify(data.error || 'Erro ao enviar respostas', 'error');
        }
        setSubmitting(false);
        return;
      }
      notify('Etapa enviada com sucesso', 'success', 3000);
      setSubmitted(true);
      // Scroll pro topo pra mostrar a celebração
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('[StageView] erro no submit', err);
      notify('Erro de conexão. Tente novamente.', 'error');
      setSubmitting(false);
    }
  }

  /* Adiantar dia */
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
      notify(`Etapa ${data.nextStage.number} desbloqueada`, 'success', 3000);
      // Pede pro pai recarregar tudo
      if (typeof onSubmitted === 'function') onSubmitted();
    } catch (err) {
      console.error('[StageView] erro ao adiantar', err);
      notify('Erro de conexão', 'error');
      setAdvancing(false);
    }
  }

  /* Recebe respostas vindas do popup de áudio e aplica com animação */
  function handleAudioAnswers({ answers }) {
    if (!answers || Object.keys(answers).length === 0) return;

    // Aplica todas de uma vez
    setFormData(prev => ({ ...prev, ...answers }));

    // Marca os campos pra animação de "justFilled"
    const filled = new Set(Object.keys(answers));
    setRecentlyFilled(filled);
    setTimeout(() => setRecentlyFilled(new Set()), 1500);

    // Decrementa o contador local
    setAudioRemaining(r => Math.max(0, r - 1));
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════ */

  // Após submeter, mostra a celebração e some o resto
  if (submitted) {
    return (
      <MicroCelebration
        stageNumber={stage.number}
        aiSummary={null}
        nextStage={nextStage}
        onAdvance={handleAdvance}
        advancing={advancing}
      />
    );
  }

  return (
    <>
      {/* ── HEADER DA ETAPA ── */}
      <div className={styles.stageHeader}>
        <div className={styles.stageDayTag}>
          <span className={styles.stageDayDot} />
          DIA {day} · ETAPA {stage.number}
        </div>

        <h1 className={styles.stageTitleBig}>{stage.title}</h1>
        <p className={styles.stageDescription}>{stage.description}</p>

        <div className={styles.stageDivider} />

        <div className={styles.stageMetaGrid}>
          <div className={styles.metaCard}>
            <div className={styles.metaCardIcon}><PaperIcon /></div>
            <div className={styles.metaCardValue}>{stage.questionCount}</div>
            <div className={styles.metaCardLabel}>PERGUNTAS</div>
          </div>
          <div className={styles.metaCard}>
            <div className={styles.metaCardIcon}><ClockIcon /></div>
            <div className={styles.metaCardValue}>{stage.timeEstimate || '-'}</div>
            <div className={styles.metaCardLabel}>ESTIMADO</div>
          </div>
        </div>

        {stage.insight && (
          <div
            className={styles.insightCard}
            onClick={() => setInsightOpen(o => !o)}
            role="button"
            tabIndex={0}
          >
            <span className={styles.insightIcon}>💡</span>
            <span className={styles.insightText}>{stage.insight}</span>
          </div>
        )}
      </div>

      {/* ── SEÇÃO DO VÍDEO ── */}
      <div className={styles.videoSection}>
        <div className={styles.videoLabel}>
          <span className={styles.videoLabelDot} />
          ASSISTA ANTES DE CONTINUAR
        </div>
        <OnboardingVideoPlayer
          videoUrl={stage.video?.url}
          videoDuration={stage.video?.duration}
          alreadyWatched={stage.video?.watched}
          onWatched={handleVideoWatched}
        />
      </div>

      {/* ── BOTÃO INICIAR FORMULÁRIO — 3 estados ──
          Estado A: vídeo não assistido (independente do countdown)
          Estado B: vídeo OK mas countdown de 20s ainda rolando (vídeo curto)
          Estado C: vídeo OK + countdown zero → LIBERADO */}
      {!showForm && (
        <div className={styles.startBlock}>
          {!videoWatched && (
            <button className={`${styles.startBtn} ${styles.locked}`} disabled>
              <LockIcon /> Assista o vídeo para desbloquear
            </button>
          )}
          {videoWatched && countdown > 0 && (
            <button className={`${styles.startBtn} ${styles.countdown}`} disabled>
              <ClockIcon />
              Disponível em <span className={styles.countdownNumber}>{countdown}s</span>...
            </button>
          )}
          {formUnlocked && (
            <button
              className={`${styles.startBtn} ${styles.unlocked}`}
              onClick={handleStartForm}
            >
              <ArrowIcon /> Iniciar Formulário
            </button>
          )}
        </div>
      )}

      {/* ── FORMULÁRIO ── */}
      {showForm && (
        <div className={styles.formCard} id="onboarding-form">
          <div className={styles.formHeader}>
            <span className={styles.formHeaderTitle}>// FORMULÁRIO DA ETAPA {stage.number}</span>
            <SaveStatusBadge status={saveStatus} lastSavedAt={lastSavedAt} />
          </div>

          {/* Avisos: auto-save + skip de perguntas que não fazem sentido */}
          <div style={{
            padding: '10px 12px',
            background: 'rgba(34, 197, 94, 0.04)',
            border: '1px solid rgba(34, 197, 94, 0.15)',
            borderRadius: 8,
            marginBottom: 12,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
            </svg>
            <span>
              Suas respostas são salvas automaticamente. Pode fechar e voltar
              depois que nada se perde.
            </span>
          </div>

          <div style={{
            padding: '10px 12px',
            background: 'rgba(59, 130, 246, 0.04)',
            border: '1px solid rgba(59, 130, 246, 0.15)',
            borderRadius: 8,
            marginBottom: 20,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              Se alguma pergunta não fizer sentido pro seu negócio,
              pode pular — só os campos com <span style={{ color: 'var(--brand-500)', fontWeight: 700 }}>*</span> são obrigatórios.
              Resposta forçada vira estratégia genérica.
            </span>
          </div>

          <OnboardingFormFields
            questions={stage.questions || []}
            values={formData}
            onChange={handleFieldChange}
            recentlyFilled={recentlyFilled}
            errors={validationErrors}
          />

          {/* Botões: Salvar rascunho (secundário) + Enviar (primário) */}
          <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
            <button
              onClick={handleManualSave}
              disabled={saveStatus === 'saving'}
              style={{
                width: '100%',
                padding: '12px 18px',
                borderRadius: 8,
                background: 'rgba(17,17,17,0.8)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {saveStatus === 'saving' ? 'Salvando...' : 'Salvar Rascunho'}
            </button>

            <button
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={submitting}
              style={{ marginTop: 0 }}
            >
              {submitting ? 'Enviando...' : (<><ArrowIcon /> Enviar Respostas</>)}
            </button>
          </div>
        </div>
      )}

      {/* ── BOTÃO MICROFONE FLUTUANTE — só aparece se o form está visível ── */}
      {showForm && (
        <button
          className={styles.micFloatBtn}
          onClick={() => setAudioOpen(true)}
          aria-label="Responder por áudio (BETA)"
          title="Responder por áudio (BETA)"
        >
          <MicIcon />
          <span className={styles.micFloatBetaTag}>BETA</span>
        </button>
      )}

      {/* ── POPUP DE ÁUDIO ── */}
      <AudioRecorderPopup
        open={audioOpen}
        onClose={() => setAudioOpen(false)}
        token={token}
        stageNumber={stage.number}
        questions={stage.questions || []}
        usageRemaining={audioRemaining}
        onAnswersReady={handleAudioAnswers}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   SaveStatusBadge — indicador visual do auto-save
   Aparece no canto do header do form. Mostra "Salvando...",
   "✓ Salvo há X" ou fica escondido quando idle sem histórico.
═══════════════════════════════════════════════════════════ */

function SaveStatusBadge({ status, lastSavedAt }) {
  // Estado 'saving' — spinner
  if (status === 'saving') {
    return (
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.625rem',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          width: 10, height: 10,
          border: '1.5px solid rgba(255,255,255,0.1)',
          borderTopColor: 'var(--brand-500)',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.7s linear infinite',
        }} />
        Salvando...
      </span>
    );
  }

  // Estado 'saved' — check verde
  if (status === 'saved') {
    return (
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.625rem',
        color: '#22c55e',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        textShadow: '0 0 4px rgba(34, 197, 94, 0.3)',
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Salvo
      </span>
    );
  }

  // Tem histórico mas estado 'idle' — mostra "salvo há X"
  if (lastSavedAt) {
    const secsAgo = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
    const label = secsAgo < 60 ? `${secsAgo}s` : `${Math.floor(secsAgo / 60)}min`;
    return (
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.625rem',
        color: 'var(--text-muted)',
      }}>
        Salvo há {label}
      </span>
    );
  }

  return null;
}
