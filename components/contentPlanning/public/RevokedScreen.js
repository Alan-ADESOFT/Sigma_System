/**
 * components/contentPlanning/public/RevokedScreen.js
 * Tela quando a agencia revogou o link manualmente OU quando um link novo
 * foi gerado para o mesmo plano (revogacao automatica).
 */

import styles from '../../../assets/style/publicApproval.module.css';

export default function RevokedScreen() {
  return (
    <div className={`${styles.card} ${styles.statusCard}`}>
      <div className={`${styles.statusIcon} ${styles.statusIconNeutral}`} aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      </div>
      <h1 className={styles.statusTitle}>Link revogado pela agência</h1>
      <p className={styles.statusDesc}>
        Este link foi desativado pela equipe da Sigma. Provavelmente um link
        atualizado já foi gerado — verifique sua mensagem mais recente ou
        entre em contato com a agência.
      </p>
      <div className={styles.statusHint}>// status = revoked</div>
    </div>
  );
}
