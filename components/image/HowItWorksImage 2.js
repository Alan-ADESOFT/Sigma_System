/**
 * components/image/HowItWorksImage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Caixa instrutiva no topo de páginas do módulo de imagem.
 * Aceita variant pra reusar o mesmo container com texto diferente.
 *
 * Variantes:
 *   · workspace — fluxo de geração (default)
 *   · settings  — configuração de modelos e chaves
 *   · brandbook — identidade visual por cliente
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageWorkspace.module.css';

const VARIANTS = {
  workspace: {
    title: 'Como funciona',
    text:
      'Selecione um cliente para começar. O brandbook ativo é injetado automaticamente em ' +
      'cada geração para manter consistência visual. As imagens são geradas em segundo plano ' +
      '(10-60s) — você pode continuar usando o sistema enquanto isso.',
  },
  settings: {
    title: 'Configuração',
    text:
      'Configure os modelos de IA, suas chaves de API e os limites de uso. Todas as chaves ' +
      'são criptografadas (AES-256-GCM) antes de irem ao banco. Ajustes em limites e modelos ' +
      'são auditados automaticamente.',
  },
  brandbook: {
    title: 'Brandbook',
    text:
      'O brandbook é a identidade visual do cliente: paleta, tipografia, tom e regras do que ' +
      'fazer/evitar. É injetado automaticamente em toda geração de imagem desse cliente — sem ' +
      'precisar lembrar do estilo a cada prompt.',
  },
};

export default function HowItWorksImage({ variant = 'workspace' }) {
  const v = VARIANTS[variant] || VARIANTS.workspace;
  return (
    <div className={`glass-card ${styles.howItWorks}`}>
      <div className={styles.howItWorksIcon}>
        <Icon name="info" size={14} />
      </div>
      <div>
        <div className={styles.howItWorksTitle}>{v.title}</div>
        <div className={styles.howItWorksText}>{v.text}</div>
      </div>
    </div>
  );
}
