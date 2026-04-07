/**
 * components/AudioRecorderPopup.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de gravação de áudio + transcrição + parsing por IA.
 *
 * Fluxo:
 *   1. Usuário clica no botão flutuante de microfone (no OnboardingStageView).
 *   2. Abre o popup com instruções, lista de perguntas e contador de uso.
 *   3. Clica "Iniciar Gravação" → MediaRecorder começa a capturar áudio.
 *   4. Timer regressivo de 2 minutos. Pode parar a qualquer momento.
 *   5. Ao parar, envia o blob pra /api/onboarding/transcribe-audio.
 *   6. Mostra os steps de processamento (transcrevendo, parseando, preenchendo).
 *   7. Recebe os parsedAnswers e chama onAnswersReady() pro pai aplicar
 *      no formulário com a animação de "preenchimento por IA".
 *
 * Props:
 *   - open:            boolean
 *   - onClose:         () => void
 *   - token:           string (token público do onboarding)
 *   - stageNumber:     number
 *   - questions:       Array (perguntas da etapa atual)
 *   - usageRemaining:  number (passado pelo pai, atualizado a cada uso)
 *   - onAnswersReady:  ({ answers, transcription }) => void
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import styles from '../assets/style/onboarding.module.css';
import { useNotification } from '../context/NotificationContext';

const MAX_DURATION_SEC = 120; // 2 minutos
const DAILY_LIMIT      = 6;

/* ─── Ícones ─── */
function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ─── Helpers ─── */
function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AudioRecorderPopup({
  open, onClose, token, stageNumber, questions, usageRemaining, onAnswersReady,
}) {
  const { notify } = useNotification();

  // 'idle' | 'recording' | 'processing' | 'done'
  const [status, setStatus]       = useState('idle');
  const [elapsed, setElapsed]     = useState(0);
  const [step, setStep]           = useState(0); // 0=idle, 1=transcrevendo, 2=parseando, 3=preenchendo

  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const streamRef   = useRef(null);
  const timerRef    = useRef(null);

  // Reset quando fechar
  useEffect(() => {
    if (!open) {
      cleanup();
      setStatus('idle');
      setElapsed(0);
      setStep(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function cleanup() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
  }

  /* ─── Inicia a gravação ─── */
  async function startRecording() {
    if (usageRemaining <= 0) {
      notify('Limite diário atingido. Tenta amanhã.', 'warning');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Tenta usar opus em webm (mais compatível com browsers modernos)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await sendAudio(blob);
      };

      recorder.start();
      setStatus('recording');
      setElapsed(0);

      // Timer regressivo
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          const next = prev + 1;
          if (next >= MAX_DURATION_SEC) {
            stopRecording();
            return MAX_DURATION_SEC;
          }
          return next;
        });
      }, 1000);

    } catch (err) {
      console.error('[AudioRecorder] erro ao iniciar', err);
      notify('Não foi possível acessar o microfone. Verifica a permissão.', 'error');
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch (err) {
      console.error('[AudioRecorder] erro ao parar', err);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStatus('processing');
  }

  /* ─── Envia o blob pro endpoint ─── */
  async function sendAudio(blob) {
    setStep(1);
    try {
      const form = new FormData();
      form.append('audio', blob, 'audio.webm');
      form.append('token', token);
      form.append('stageNumber', String(stageNumber));
      form.append('duration', String(elapsed));

      // Pequeno delay pra UI respirar entre os steps
      await new Promise(r => setTimeout(r, 600));
      setStep(2);

      const res = await fetch('/api/onboarding/transcribe-audio', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();

      if (!data.success) {
        notify(data.error || 'Erro ao processar áudio', 'error');
        setStatus('idle');
        setStep(0);
        return;
      }

      setStep(3);
      await new Promise(r => setTimeout(r, 500));

      // Avisa o pai pra começar a animação de preenchimento
      onAnswersReady({
        answers: data.parsedAnswers || {},
        transcription: data.transcription || '',
      });

      setStatus('done');
      notify('Respostas identificadas. Confira no formulário.', 'success', 4000);

      // Fecha o popup automaticamente após 1.2s pra a UI mostrar o "done"
      setTimeout(() => onClose(), 1200);

    } catch (err) {
      console.error('[AudioRecorder] erro no envio', err);
      notify('Erro de conexão ao enviar o áudio', 'error');
      setStatus('idle');
      setStep(0);
    }
  }

  if (!open) return null;

  /* ═══════════════════════════════════════════════════════════
     ESTADO 'recording' → renderiza APENAS o widget flutuante
     (não bloqueia a tela, cliente continua vendo as perguntas)
  ═══════════════════════════════════════════════════════════ */
  if (status === 'recording') {
    return (
      <div className={styles.recordingWidget}>
        <span className={styles.recordingWidgetDot} />

        <div className={styles.recordingWidgetInfo}>
          <span className={styles.recordingWidgetLabel}>Gravando</span>
          <span className={styles.recordingWidgetTimer}>
            {fmtTime(MAX_DURATION_SEC - elapsed)}
          </span>
        </div>

        <div className={styles.recordingWidgetWave}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className={styles.waveBar} />
          ))}
        </div>

        <button
          className={styles.recordingWidgetStopBtn}
          onClick={stopRecording}
          aria-label="Parar e enviar"
          title="Parar e enviar"
        >
          <StopIcon />
        </button>
      </div>
    );
  }

  // Lista das perguntas (sem _extra_)
  const visibleQs = (questions || []).filter(q => !q.id?.startsWith?.('_extra_'));
  const usageClass = usageRemaining === 0 ? styles.empty
    : usageRemaining <= 2 ? styles.warning : '';

  /* ═══════════════════════════════════════════════════════════
     ESTADOS 'idle' e 'processing'/'done' → modal completo
  ═══════════════════════════════════════════════════════════ */
  return (
    <div className={styles.modalOverlay} onClick={(e) => {
      if (e.target === e.currentTarget && status !== 'processing') onClose();
    }}>
      <div className={styles.modalCard}>

        <button className={styles.modalClose} onClick={onClose} aria-label="Fechar">
          <CloseIcon />
        </button>

        <h2 className={styles.modalTitle}>
          Responder por áudio
          <span className={styles.betaTag}>BETA</span>
        </h2>

        {status === 'idle' && (
          <>
            <p className={styles.modalSubtitle}>
              Fale suas respostas em sequência. Ex: <em>"A pergunta 1.1 é... a 1.2 é..."</em>.
              A IA tenta entender e preencher pra você. <strong>Sempre revise antes de enviar.</strong>
            </p>

            <div className={styles.betaWarning}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>
                <strong>Função em beta.</strong> A transcrição e o entendimento das respostas
                ainda erram com frequência. Sempre confira os campos preenchidos —
                vai ser mais rápido editar do que digitar do zero, mas não confia 100%.
              </span>
            </div>

            <div className={`${styles.usageCounter} ${usageClass}`}>
              {usageRemaining > 0
                ? `${usageRemaining} de ${DAILY_LIMIT} usos restantes hoje`
                : 'Limite diário atingido. Tenta amanhã.'}
            </div>

            <div className={styles.modalSection}>
              <div className={styles.modalSectionLabel}>Perguntas dessa etapa</div>
              <div className={styles.questionsList}>
                {visibleQs.map((q) => (
                  <div key={q.id} className={styles.questionsListItem}>
                    <span className={styles.questionsListNumber}>{q.id}</span>
                    <span>{q.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              className={styles.recordBtn}
              onClick={startRecording}
              disabled={usageRemaining <= 0}
            >
              <MicIcon /> Iniciar Gravação
            </button>

            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.625rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              marginTop: 12,
              lineHeight: 1.5,
            }}>
              Ao gravar, o popup some e aparece um controle pequeno no rodapé<br />
              pra você continuar vendo as perguntas.
            </p>
          </>
        )}

        {(status === 'processing' || status === 'done') && (
          <>
            <p className={styles.modalSubtitle}>
              Processando seu áudio. Isso leva poucos segundos.
            </p>
            <div className={styles.processingSteps}>
              <ProcessingStep label="Transcrevendo áudio" active={step >= 1} done={step > 1} />
              <ProcessingStep label="Identificando respostas" active={step >= 2} done={step > 2} />
              <ProcessingStep label="Preenchendo formulário" active={step >= 3} done={status === 'done'} />
            </div>
          </>
        )}

      </div>
    </div>
  );
}

function ProcessingStep({ label, active, done }) {
  const cls = done ? styles.done : (active ? styles.active : '');
  return (
    <div className={`${styles.processingStep} ${cls}`}>
      {done ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : active ? (
        <span className={styles.processingSpinner} />
      ) : (
        <span style={{ width: 14, height: 14, display: 'inline-block' }} />
      )}
      <span>{label}</span>
    </div>
  );
}
