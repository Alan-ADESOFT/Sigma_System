/**
 * components/image/ClientCard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Card de cliente na home do Gerador de Imagem.
 * Layout consistente com o card "Geração livre": top (avatar+nome),
 * descrição/badges no meio (preenche espaço), stats no rodapé.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageHomePage.module.css';

function initials(name) {
  if (!name) return '·';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function ClientCard({ client, brandbookStatus, imageCount, folderCount, onOpen }) {
  const status = brandbookStatus || 'unknown';

  // Descrição usada pra preencher o meio: prioriza produto, depois região, depois fallback
  const description = client.main_product
    || (client.region ? `Atende em ${client.region}` : null)
    || (client.niche ? `Cliente do segmento ${client.niche.toLowerCase()}` : null);

  return (
    <button type="button" className={styles.card} onClick={() => onOpen?.(client)}>
      <span className={styles.cardArrow} aria-hidden="true">
        <Icon name="chevronRight" size={12} />
      </span>

      <div className={styles.cardTop}>
        <div className={styles.avatar}>
          {client.logo_url
            ? <img src={client.logo_url} alt={client.company_name} />
            : initials(client.company_name)}
        </div>
        <div className={styles.cardTitleBlock}>
          <div className={styles.cardName}>{client.company_name}</div>
          {client.niche && <div className={styles.cardNiche}>{client.niche}</div>}
        </div>
      </div>

      <div className={styles.cardBody}>
        {description && (
          <div className={styles.cardDesc}>{description}</div>
        )}
        <div className={styles.cardBadgesRow}>
          <span className={`${styles.brandbookBadge} ${styles[status]}`}>
            <span className={styles.brandbookDot} />
            {status === 'ready'   && 'Brandbook pronto'}
            {status === 'missing' && 'Sem brandbook'}
            {status === 'unknown' && 'Verificando'}
          </span>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statBox}>
          <span className={styles.statValue}>{imageCount ?? 0}</span>
          <span className={styles.statLabel}>Imagens</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statValue}>{folderCount ?? 0}</span>
          <span className={styles.statLabel}>Pastas</span>
        </div>
      </div>
    </button>
  );
}

/**
 * Variante "Geração livre" — card especial sem cliente vinculado.
 * Mantém a mesma altura que os cards de cliente.
 */
export function GenericGenerationCard({ onOpen }) {
  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <span className={styles.cardArrow} aria-hidden="true">
        <Icon name="chevronRight" size={12} />
      </span>

      <div className={styles.cardTop}>
        <div className={styles.cardGenericIcon}>
          <Icon name="sparkles" size={20} />
        </div>
        <div className={styles.cardTitleBlock}>
          <div className={styles.cardName}>Geração livre</div>
          <div className={styles.cardNiche}>Sem cliente vinculado</div>
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardDesc}>
          Crie imagens sem brandbook. Útil para ideação rápida e testes
          de prompt. Comece por aqui.
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statBox}>
          <span className={styles.statValue}>—</span>
          <span className={styles.statLabel}>Sem brand</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statValue}>∞</span>
          <span className={styles.statLabel}>Pastas</span>
        </div>
      </div>
    </button>
  );
}
