/**
 * components/image/PromptViewer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Accordion fechado por padrão. Quando aberto, mostra o último prompt
 * otimizado usado (educa o usuário). Inclui botão de copiar e flag de cache.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageWorkspace.module.css';

export default function PromptViewer({ prompt, model, hash, fromCache, onEdit }) {
  const { notify } = useNotification();
  const [open, setOpen] = useState(false);

  if (!prompt) {
    return (
      <div className={styles.promptViewer}>
        <div className={styles.promptViewerHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="terminal" size={11} />
            Prompt técnico — sem geração ainda
          </span>
        </div>
      </div>
    );
  }

  function copy() {
    try {
      navigator.clipboard.writeText(prompt);
      notify('Prompt copiado', 'success');
    } catch {
      notify('Não foi possível copiar', 'error');
    }
  }

  return (
    <div className={styles.promptViewer}>
      <div
        className={styles.promptViewerHeader}
        onClick={() => setOpen(v => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(v => !v); }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={11} />
          Prompt técnico usado
        </span>
        {fromCache && (
          <span className={styles.promptCacheBadge}>
            <Icon name="check" size={10} />
            cache
          </span>
        )}
      </div>

      {open && (
        <>
          <div className={styles.promptViewerBody}>{prompt}</div>
          <div className={styles.promptViewerMeta}>
            {model && <span>Modelo: {model}</span>}
            {hash && <span>Hash: {hash.slice(0, 6)}...{hash.slice(-3)}</span>}
            {fromCache && <span style={{ color: 'var(--success)' }}>Reuso de cache</span>}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={copy}
            >
              <Icon name="copy" size={11} />
              copiar
            </button>
            {onEdit && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onEdit}
              >
                <Icon name="edit" size={11} />
                editar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
