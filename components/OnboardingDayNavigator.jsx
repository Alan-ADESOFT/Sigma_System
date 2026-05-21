/**
 * components/OnboardingDayNavigator.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Grade de 15 cápsulas no canto superior direito da página /onboarding/[token].
 *
 * Cada cápsula é um <DayCapsule /> clicável (regra: componentizar tudo que se
 * repete — não inlinar JSX 15 vezes). O pai controla o `selectedDay` e o que
 * renderizar quando muda.
 *
 * Layout: grid 5×3 em desktop, carrossel horizontal (scroll-snap) em mobile
 * < 720px (CSS responsivo no dayNavigator.module.css).
 *
 * Não faz fetch — recebe `days` já pronto via prop (vem do
 * /api/onboarding/day-snapshot na página pai).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import styles from '../assets/style/dayNavigator.module.css';

/* ─── Mapas de status → classe e símbolo visual ───────────────────────────── */

const STATUS_TO_CLS = {
  answered:         'statusAnswered',
  today:            'statusToday',
  released_pending: 'statusReleasedPending',
  released:         'statusRest',
  locked:           'statusLocked',
};

const STATUS_TO_ICON = {
  answered:         '✓',
  today:            '●',
  released_pending: '',     // só número, cor amarela
  released:         '💤',
  locked:           '🔒',
};

function statusTooltip(dayInfo) {
  if (dayInfo.kind === 'rest') {
    return `Dia ${dayInfo.day} — Descanso`;
  }
  const t = dayInfo.title || `Etapa ${dayInfo.stage || '?'}`;
  if (dayInfo.status === 'answered')         return `Dia ${dayInfo.day} — ${t} (respondida)`;
  if (dayInfo.status === 'today')            return `Dia ${dayInfo.day} — ${t} (hoje)`;
  if (dayInfo.status === 'released_pending') return `Dia ${dayInfo.day} — ${t} (pendente)`;
  if (dayInfo.status === 'locked')           return `Dia ${dayInfo.day} — ${t} (libera no dia ${dayInfo.day})`;
  return `Dia ${dayInfo.day} — ${t}`;
}

/* ─── DayCapsule — uma cápsula clicável ───────────────────────────────────── */

function DayCapsule({ info, isSelected, onClick }) {
  const cls = [
    styles.capsule,
    styles[STATUS_TO_CLS[info.status]] || '',
    isSelected ? styles.statusSelected : '',
  ].join(' ');

  const icon = info.kind === 'rest'
    ? STATUS_TO_ICON.released
    : STATUS_TO_ICON[info.status];

  return (
    <button
      type="button"
      className={cls}
      title={statusTooltip(info)}
      aria-label={statusTooltip(info)}
      onClick={() => onClick(info.day)}
    >
      <span className={styles.capsuleNumber}>{info.day}</span>
      {icon && <span className={styles.capsuleIcon}>{icon}</span>}
    </button>
  );
}

/* ─── OnboardingDayNavigator (default export) ─────────────────────────────── */

export default function OnboardingDayNavigator({ days, selectedDay, onSelect }) {
  if (!Array.isArray(days) || days.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>// SUA JORNADA</span>
      <div className={styles.grid}>
        {days.map((d) => (
          <DayCapsule
            key={d.day}
            info={d}
            isSelected={d.day === selectedDay}
            onClick={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── LockedDayView — placeholder de dia futuro ───────────────────────────── */

export function LockedDayView({ day, stage, releaseDate }) {
  const releaseLabel = (() => {
    if (!releaseDate) return null;
    try {
      const d = new Date(releaseDate);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return null;
    }
  })();

  return (
    <div className={styles.lockedView}>
      <div className={styles.lockedIcon}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 className={styles.lockedTitle}>
        Etapa {stage?.number || '?'} libera no dia {releaseLabel ? `${day} (${releaseLabel})` : day}
      </h2>
      <p className={styles.lockedText}>
        Aguarde a notificação no WhatsApp. Cada etapa libera no seu dia certo —
        sem pressão, no seu ritmo.
      </p>
    </div>
  );
}
