/**
 * components/contentPlanning/public/InvalidScreen.js
 * Tela quando o token nao existe (URL adulterada ou link incorreto).
 */

import styles from '../../../assets/style/publicApproval.module.css';

export default function InvalidScreen() {
  return (
    <div className={`${styles.card} ${styles.statusCard}`}>
      <div className={`${styles.statusIcon} ${styles.statusIconDanger}`} aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
      <h1 className={styles.statusTitle}>Link inválido</h1>
      <p className={styles.statusDesc}>
        O endereço que você acessou não corresponde a nenhum planejamento.
        Verifique o link recebido pela Sigma ou solicite um novo.
      </p>
      <div className={styles.statusHint}>// token não encontrado</div>
    </div>
  );
}
