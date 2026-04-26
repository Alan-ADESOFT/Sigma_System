/**
 * components/contentPlanning/public/ExpiredScreen.js
 * Tela quando o link ja passou de expires_at.
 */

import styles from '../../../assets/style/publicApproval.module.css';

export default function ExpiredScreen() {
  return (
    <div className={`${styles.card} ${styles.statusCard}`}>
      <div className={`${styles.statusIcon} ${styles.statusIconWarning}`} aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h1 className={styles.statusTitle}>Este link expirou</h1>
      <p className={styles.statusDesc}>
        O prazo para revisar este planejamento terminou. Entre em contato com a
        Sigma para receber um novo link de aprovação atualizado.
      </p>
      <div className={styles.statusHint}>// expires_at &lt; now()</div>
    </div>
  );
}
