/**
 * components/image/ContextMenu.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Menu de contexto custom (botão direito) para thumbnails do histórico.
 * Sem dependência externa — pure React + CSS Modules.
 *
 * Uso:
 *   const [ctx, setCtx] = useState(null);  // { x, y, job } | null
 *   <HistoryStrip onContextMenu={(j, pos) => setCtx({ ...pos, job: j })} />
 *   {ctx && (
 *     <ContextMenu {...ctx} onClose={() => setCtx(null)} actions={...} />
 *   )}
 *
 * Itens default (override via prop `actions`):
 *   · Editar com IA
 *   · Variação fresca
 *   · Download
 *   · Salvar como template
 *   · Mover para pasta...
 *   · Apagar
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageModal.module.css';

export default function ContextMenu({ x, y, job, actions, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose?.();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Reposiciona se sair da viewport (canto inferior direito)
  useEffect(() => {
    const node = menuRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width > vw - 8) left = Math.max(8, vw - rect.width - 8);
    if (top + rect.height > vh - 8) top = Math.max(8, vh - rect.height - 8);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }, [x, y]);

  const items = Array.isArray(actions) && actions.length > 0
    ? actions
    : []; // sem fallback hardcoded — caller decide

  if (items.length === 0) {
    onClose?.();
    return null;
  }

  return (
    <div ref={menuRef} className={styles.contextMenu} role="menu">
      {items.map((item, i) => {
        if (item.divider) {
          return <div key={`div-${i}`} className={styles.contextMenuDivider} />;
        }
        return (
          <button
            key={item.id || i}
            type="button"
            role="menuitem"
            className={`${styles.contextMenuItem} ${item.danger ? styles.danger : ''}`}
            onClick={() => {
              try { item.onClick?.(job); } finally { onClose?.(); }
            }}
            disabled={item.disabled}
          >
            {item.icon && <Icon name={item.icon} size={11} />}
            <span>{item.label}</span>
            {item.shortcut && <span className={styles.contextMenuShortcut}>{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
