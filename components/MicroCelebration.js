/**
 * components/MicroCelebration.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tela de celebração pós-envio de etapa.
 *
 * Componentes visuais:
 *   1. Confete CSS (canvas-free, sem dep externa)
 *   2. Ícone grande de check
 *   3. Título "Etapa X concluída"
 *   4. Resumo de 3 linhas (gerado por IA, opcional)
 *   5. Teaser da próxima etapa
 *   6. Botão "Adiantar Dia" (se não for a última)
 *
 * Props:
 *   - stageNumber:    number (etapa que acabou de concluir)
 *   - aiSummary:      string (opcional)
 *   - nextStage:      { number, title, questionCount, timeEstimate } | null
 *   - onAdvance:      () => void (clique no botão adiantar)
 *   - advancing:      boolean (durante a chamada de API)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import styles from '../assets/style/onboarding.module.css';

/* ─── Ícones ─── */
function CheckBig() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

/* ─── Confete CSS ─── */
function Confetti({ count = 50 }) {
  const colors = ['#ff0033', '#ff6680', '#ffffff', '#22c55e'];
  const pieces = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    color: colors[i % colors.length],
    duration: 3 + Math.random() * 2,
    rotate: Math.random() * 360,
  }));

  return (
    <div className={styles.confettiWrap}>
      {pieces.map(p => (
        <div
          key={p.id}
          className={styles.confettiPiece}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export default function MicroCelebration({
  stageNumber, aiSummary, nextStage, onAdvance, advancing,
}) {
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    // Para o confete depois de 5 segundos pra economizar paint
    const t = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={styles.celebrationOverlay}>
      {showConfetti && <Confetti count={60} />}

      <div className={styles.celebrationIcon}>
        <CheckBig />
      </div>

      <h2 className={styles.celebrationTitle}>
        Etapa {stageNumber} concluída
      </h2>

      <p className={styles.celebrationSubtitle}>
        Suas respostas foram registradas no servidor.
      </p>

      {aiSummary && (
        <div className={styles.celebrationSummary}>
          <div className={styles.celebrationSummaryLabel}>RESUMO DA ETAPA</div>
          {aiSummary}
        </div>
      )}

      {nextStage && (
        <>
          <div className={styles.celebrationTeaser}>
            Próxima etapa: <strong>{nextStage.title}</strong>
          </div>

          <div className={styles.advanceBlock}>
            <div className={styles.advanceTitle}>Quer continuar agora?</div>
            <div className={styles.advanceSubtitle}>
              A próxima etapa será liberada amanhã, mas você pode adiantar se preferir.
            </div>

            <button
              className={styles.advanceBtn}
              onClick={onAdvance}
              disabled={advancing}
            >
              {advancing ? (
                <>// adiantando...</>
              ) : (
                <>
                  <ZapIcon /> Adiantar para Etapa {nextStage.number} →
                </>
              )}
            </button>

            <div className={styles.advanceMeta}>
              Etapa {nextStage.number} · {nextStage.questionCount || 0} perguntas · {nextStage.timeEstimate || ''}
            </div>
          </div>
        </>
      )}

      {!nextStage && (
        <div className={styles.celebrationTeaser}>
          <strong>Onboarding completo.</strong> Obrigado pelas respostas. Em breve a equipe da Sigma entra em contato.
        </div>
      )}
    </div>
  );
}
