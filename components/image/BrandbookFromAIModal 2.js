/**
 * components/image/BrandbookFromAIModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal: usuário descreve a marca em texto livre, IA gera o brandbook
 * estruturado. Loading inline durante chamada (~5-12s).
 *
 * Quando volta: chama onGenerated(structuredData) — o pai abre o
 * BrandbookEditor com seedStructuredData pra revisão.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/brandbook.module.css';

const MAX = 4000;
const MIN = 30;

export default function BrandbookFromAIModal({ clientId, onClose, onGenerated }) {
  const { notify } = useNotification();
  const [text, setText] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    function onEsc(e) { if (e.key === 'Escape' && !generating) onClose?.(); }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, generating]);

  async function generate() {
    if (text.trim().length < MIN) {
      notify(`Descreva com pelo menos ${MIN} caracteres`, 'warning');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/image/brandbook/${clientId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: text.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'falha na geração');
      notify('Brandbook gerado — revise e salve', 'success');
      onGenerated?.(json.data.structured_data, { source: 'ai_generated', extracted_text: text.trim() });
    } catch (err) {
      console.error('[ERRO][Frontend:BrandbookFromAI]', err.message);
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  }

  const charCount = text.length;
  const overWarn = charCount > MAX * 0.9;
  const over = charCount > MAX;

  return (
    <div
      className={styles.modalOverlay}
      onClick={generating ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={`glass-card animate-scale-in ${styles.modalCard}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Gerar brandbook com IA</div>
            <div className={styles.modalSub}>
              Descreva a marca, o público e o tom desejado. Quanto mais detalhe, melhor o resultado.
            </div>
          </div>
          <button type="button" className="btn btn-icon btn-secondary" onClick={onClose} disabled={generating} aria-label="Fechar">
            <Icon name="x" size={12} />
          </button>
        </div>

        <div style={{ position: 'relative' }}>
          <textarea
            className="textarea"
            rows={9}
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={generating}
            placeholder="Marca de cosméticos veganos voltada para mulheres de 25-40 anos. Tom natural, minimalista, sustentável. Cores terrosas e verdes. Tipografia serifada elegante. Evita imagens com excesso de gente, prefere natureza..."
            maxLength={MAX}
          />
          <div style={{
            position: 'absolute', bottom: 8, right: 12,
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
            color: over ? 'var(--error)' : overWarn ? 'var(--warning)' : 'var(--text-muted)',
          }}>
            {charCount}/{MAX}
          </div>
        </div>

        {generating && (
          <div className={styles.loadingInline}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            <span>Gerando brandbook estruturado... (~10s)</span>
          </div>
        )}

        <div className={styles.modalFooter}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={generating}>
            Cancelar
          </button>
          <button
            type="button"
            className="sigma-btn-primary"
            onClick={generate}
            disabled={generating || text.trim().length < MIN}
          >
            <Icon name="sparkles" size={12} />
            {generating ? 'Gerando...' : 'Gerar com IA'}
          </button>
        </div>
      </div>
    </div>
  );
}
