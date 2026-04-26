/**
 * components/contentPlanning/public/LoadingScreen.js
 * Tela exibida enquanto o token e validado.
 */

import styles from '../../../assets/style/publicApproval.module.css';

export default function LoadingScreen() {
  return (
    <div className={styles.statusCard}>
      <div className={styles.spinner} aria-hidden="true" />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
        // validando acesso...
      </div>
    </div>
  );
}
