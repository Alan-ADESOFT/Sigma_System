/**
 * components/ads/AdsHealthBadge.js
 * Pílula colorida que mostra o estado de saúde do token de Ads.
 */

import styles from '../../assets/style/adsClient.module.css';

const STATES = {
  healthy:        { label: 'SAUDÁVEL',  icon: '✓', cls: 'badgeOk' },
  expiring_soon:  { label: 'EXPIRANDO', icon: '⚠', cls: 'badgeWarn' },
  expired:        { label: 'EXPIRADO',  icon: '✗', cls: 'badgeErr' },
  invalid:        { label: 'INVÁLIDO',  icon: '✗', cls: 'badgeErr' },
  unknown:        { label: 'DESCONHEC.',icon: '?', cls: 'badgeMuted' },
};

function daysLeft(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt) - Date.now();
  return Math.floor(ms / 86400000);
}

export default function AdsHealthBadge({ status, expiresAt }) {
  const cfg = STATES[status] || STATES.unknown;
  const days = daysLeft(expiresAt);
  let detail = null;
  if (status === 'healthy' && days != null && days < 60) detail = `expira em ${days}d`;
  if (status === 'expiring_soon' && days != null) detail = `${days}d restante${days === 1 ? '' : 's'}`;
  if (status === 'expired') detail = 'reconecte';
  return (
    <span className={`${styles.healthBadge} ${styles[cfg.cls]}`}>
      <span aria-hidden="true">{cfg.icon}</span>
      <span>{cfg.label}</span>
      {detail && <span className={styles.healthDetail}>· {detail}</span>}
    </span>
  );
}
