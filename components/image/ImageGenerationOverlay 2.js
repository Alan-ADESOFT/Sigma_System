/**
 * components/image/ImageGenerationOverlay.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Overlay full-screen "hacker" enquanto a imagem é gerada.
 * Faz polling em /api/image/status/:jobId. Etapas aparecem em sequência
 * baseado no tempo desde "running". Botões: Continuar (vira toast) e Cancelar.
 *
 * Quando done → fecha overlay com fade. Quando error → mostra mensagem
 * amigável + botão "Tentar novamente".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageGeneration.module.css';

/* Mensagens em sequência baseadas no tempo (em segundos desde running) */
const STEPS = [
  { atSec: 0,  text: 'Carregando brandbook do cliente' },
  { atSec: 3,  text: 'Otimizando prompt' },
  { atSec: 6,  text: 'Conectando ao provedor' },
  { atSec: 12, text: 'Renderizando pixels' },
  { atSec: 30, text: 'Aplicando refinamentos finais' },
  { atSec: 60, text: 'Quase lá, finalizando' },
];

function fmtElapsed(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function friendlyError(code, message) {
  switch (code) {
    case 'CONTENT_BLOCKED':
      return 'O filtro de segurança do provedor bloqueou a geração. Reformule a descrição.';
    case 'RATE_LIMITED':
      return 'O provedor de imagem atingiu o limite. Tente novamente em alguns minutos.';
    case 'TIMEOUT':
      return 'O provedor demorou demais para responder. Tente novamente.';
    case 'INVALID_INPUT':
      return message || 'Configuração inválida.';
    default:
      return message || 'Não foi possível gerar a imagem.';
  }
}

export default function ImageGenerationOverlay({
  jobId,
  model,
  provider,
  onComplete,
  onError,
  onCancel,
  onMinimize,
  onRetry,
}) {
  const { notify } = useNotification();
  const [job, setJob] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [exiting, setExiting] = useState(false);
  const startRef = useRef(Date.now());
  const runningSinceRef = useRef(null);
  const cancelledRef = useRef(false);

  /* Polling de status */
  useEffect(() => {
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const res = await fetch(`/api/image/status/${jobId}`);
        const json = await res.json();
        if (!json.success || cancelled) return;
        const j = json.data;
        setJob(j);

        if ((j.status === 'running' || j.status === 'queued') && !runningSinceRef.current && j.started_at) {
          runningSinceRef.current = new Date(j.started_at).getTime();
        }

        if (j.status === 'done') {
          setExiting(true);
          setTimeout(() => onComplete?.(j), 300);
          return; // para de pollar
        }
        if (j.status === 'error') {
          onError?.(j);
          return;
        }
        if (j.status === 'cancelled') {
          onCancel?.(j);
          return;
        }
        timer = setTimeout(poll, 2000);
      } catch (err) {
        if (!cancelled) {
          console.error('[ERRO][Frontend:Overlay] polling', err.message);
          timer = setTimeout(poll, 4000);
        }
      }
    }

    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  /* Tick para tempo decorrido */
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  /* UX: Esc minimiza para o sistema (não cancela) */
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onMinimize?.(jobId);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onMinimize, jobId]);

  const isError = job?.status === 'error';

  /* Calcula etapas concluídas e ativa */
  const sec = Math.floor(elapsed / 1000);
  let activeIdx = -1;
  for (let i = 0; i < STEPS.length; i++) {
    if (sec >= STEPS[i].atSec) activeIdx = i;
  }

  async function handleCancel() {
    if (cancelledRef.current) return;
    cancelledRef.current = true;
    try {
      await fetch(`/api/image/jobs/${jobId}`, { method: 'DELETE' });
    } catch {}
    notify('Geração cancelada', 'warning');
    onCancel?.();
  }

  /* Estado de erro */
  if (isError) {
    return (
      <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Erro na geração">
        <div className={styles.card}>
          <div className={styles.orbWrap}>
            <div className={styles.orb} style={{ background: 'radial-gradient(circle, #66001a, #330010)' }} />
          </div>
          <div className={styles.errorTitle}>Falha na geração</div>
          <p className={styles.errorMsg}>
            {friendlyError(job.error_code, job.error_message)}
          </p>
          <div className={styles.footer}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Fechar
            </button>
            <button type="button" className="sigma-btn-primary" onClick={onRetry}>
              <Icon name="refresh" size={12} />
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.overlay} ${exiting ? styles.overlayExit : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Gerando imagem"
    >
      <div className={styles.card}>
        {/* Orb */}
        <div className={styles.orbWrap}>
          <div className={styles.orb}>
            <div className={styles.orbScan} />
          </div>
          <div className={styles.orbRing} />
          <div className={`${styles.orbRing} ${styles.delay}`} />
        </div>

        <div className={styles.title}>Gerando imagem</div>

        <div className={styles.steps}>
          {STEPS.map((s, idx) => {
            const isDone   = idx < activeIdx;
            const isActive = idx === activeIdx;
            const isFuture = idx > activeIdx;
            if (isFuture) return null;

            // Resolve o texto. Pra step "Otimizando prompt" e "Conectando" usa model/provider
            let text = s.text;
            if (idx === 1 && model)    text = `Otimizando prompt para ${model}`;
            if (idx === 2 && provider) text = `Conectando ao ${provider}`;

            return (
              <div
                key={idx}
                className={`${styles.step} ${isDone ? styles.done : ''} ${isActive ? styles.active : ''}`}
                style={{ animationDelay: `${(idx - 0) * 80}ms` }}
              >
                <span className={`${styles.stepIcon} ${isDone ? styles.done : isActive ? styles.active : ''}`}>
                  {isDone ? <Icon name="check" size={12} /> : isActive ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : null}
                </span>
                <span className={styles.stepText}>
                  &gt; {text}
                  {isActive && <span className={styles.cursor} />}
                </span>
              </div>
            );
          })}
        </div>

        <div className={styles.elapsed}>
          Tempo decorrido: {fmtElapsed(elapsed)}
        </div>

        <div className={styles.infoBox}>
          <span className={styles.infoBoxIcon}><Icon name="info" size={13} /></span>
          <div className={styles.infoBoxText}>
            Você pode fechar esta janela ou navegar pelo sistema. A geração continua em
            segundo plano e você será notificado quando finalizar.
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className="btn btn-secondary" onClick={handleCancel}>
            <Icon name="x" size={12} />
            Cancelar
          </button>
          <button type="button" className="sigma-btn-primary" onClick={() => onMinimize?.(jobId)}>
            Continuar usando o sistema
          </button>
        </div>
      </div>
    </div>
  );
}
