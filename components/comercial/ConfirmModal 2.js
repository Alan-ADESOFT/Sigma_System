/**
 * components/comercial/ConfirmModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de confirmação no padrão SIGMA (telas de Planejamento).
 *
 * Estrutura:
 *   ┌──────────────────────────────────────────────┐
 *   │ [📦]  Título                            [×] │
 *   │       Descrição em 1-2 linhas                │
 *   ├──────────────────────────────────────────────┤
 *   │ ┌────────────────────────────────────────┐   │
 *   │ │ ⚠  Tem certeza que deseja excluir X?  │   │ ← warningBox (opcional)
 *   │ │    Os Y itens serão excluídos junto.   │   │
 *   │ │    // CASCADE: a · b · c               │   │
 *   │ └────────────────────────────────────────┘   │
 *   ├──────────────────────────────────────────────┤
 *   │                  [CANCELAR]  [CONFIRMAR]    │
 *   └──────────────────────────────────────────────┘
 *
 * Props:
 *   - open, onClose, onConfirm
 *   - variant: 'danger' | 'warning' | 'info' | 'success' | 'create' | 'edit'
 *   - title, description, confirmLabel, cancelLabel
 *   - warningTitle, warningHighlight, warningText, warningCascade
 *     → renderiza warningBox interno (estilo "Excluir planejamento")
 *   - children → conteúdo extra entre header e actions
 *   - loading → estado controlado de loading
 *   - size: 'sm' | 'md' | 'lg'
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import styles from '../../assets/style/systemModal.module.css';

const ICONS = {
  danger: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  warning: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  success: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  create: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  edit: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  link: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  download: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  ai: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15 9 22 9 16 14 18 21 12 17 6 21 8 14 2 9 9 9 12 2" />
    </svg>
  ),
};

const ICON_BOX_CLASS = {
  danger: '', warning: styles.iconBoxWarning, info: styles.iconBoxInfo,
  success: styles.iconBoxSuccess, create: '', edit: '',
  link: styles.iconBoxInfo, download: '', ai: '',
};

const WARNING_TRIANGLE = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const CLOSE_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  variant = 'danger',
  icon,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  warningTitle,
  warningHighlight,
  warningText,
  warningCascade,
  loading: controlledLoading,
  size = 'sm',
  children,
}) {
  const [internalLoading, setInternalLoading] = useState(false);
  const loading = controlledLoading ?? internalLoading;

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape' && !loading) onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const finalIcon = icon || ICONS[variant] || ICONS.info;
  const iconBoxCls = ICON_BOX_CLASS[variant] ?? '';
  const sizeCls = size === 'lg' ? styles.modalLg : size === 'md' ? '' : styles.modalSm;

  async function handleConfirm() {
    if (!onConfirm) { onClose?.(); return; }
    if (controlledLoading != null) { onConfirm(); return; }
    setInternalLoading(true);
    try { await onConfirm(); }
    finally { setInternalLoading(false); }
  }

  const showWarningBox = !!(warningTitle || warningHighlight || warningText);

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose?.(); }}>
      <div className={`${styles.modal} ${sizeCls} ${styles.modalEnter}`}>
        <div className={styles.header}>
          <div className={`${styles.iconBox} ${iconBoxCls}`}>{finalIcon}</div>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.description}>{description}</p>}
          </div>
          <button className={styles.closeBtn} onClick={onClose} disabled={loading} title="Fechar">
            {CLOSE_ICON}
          </button>
        </div>

        {showWarningBox && (
          <div className={styles.warningBox}>
            <div className={styles.warningBoxIcon}>{WARNING_TRIANGLE}</div>
            <div className={styles.warningBoxContent}>
              {(warningTitle || warningHighlight) && (
                <div className={styles.warningBoxTitle}>
                  {warningTitle}
                  {warningHighlight && <> <span className={styles.highlight}>{warningHighlight}</span>?</>}
                </div>
              )}
              {warningText && <p className={styles.warningBoxText}>{warningText}</p>}
              {warningCascade && (
                <div className={styles.warningBoxCascade}>// CASCADE: {warningCascade}</div>
              )}
            </div>
          </div>
        )}

        {children && <div className={styles.body}>{children}</div>}

        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button className={styles.btnPrimary} onClick={handleConfirm} disabled={loading}>
            {loading ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/* PromptModal — substitui prompt() nativo, mesmo padrão visual.             */
/* ───────────────────────────────────────────────────────────────────────── */

export function PromptModal({
  open,
  onClose,
  onConfirm,
  variant = 'create',
  icon,
  title,
  description,
  inputLabel,
  inputPlaceholder,
  initialValue = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  inputType = 'text',
  validate,
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setValue(initialValue); setError(''); } }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape' && !loading) onClose?.();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open, loading, value]);

  if (!open) return null;
  const finalIcon = icon || ICONS[variant] || ICONS.create;
  const iconBoxCls = ICON_BOX_CLASS[variant] ?? '';

  async function submit() {
    if (validate) {
      const err = validate(value);
      if (err) { setError(err); return; }
    }
    if (!value || !String(value).trim()) { setError('Campo obrigatório'); return; }
    setLoading(true);
    try { await onConfirm?.(value); }
    finally { setLoading(false); }
  }

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose?.(); }}>
      <div className={`${styles.modal} ${styles.modalSm} ${styles.modalEnter}`}>
        <div className={styles.header}>
          <div className={`${styles.iconBox} ${iconBoxCls}`}>{finalIcon}</div>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.description}>{description}</p>}
          </div>
          <button className={styles.closeBtn} onClick={onClose} disabled={loading}>{CLOSE_ICON}</button>
        </div>

        <div className={styles.field}>
          {inputLabel && <label className={styles.fieldLabel}>{inputLabel}</label>}
          <input
            autoFocus
            type={inputType}
            className={styles.fieldInput}
            value={value}
            placeholder={inputPlaceholder}
            onChange={e => { setValue(e.target.value); if (error) setError(''); }}
          />
          {error && <span className={styles.fieldError}>{error}</span>}
        </div>

        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={loading}>{cancelLabel}</button>
          <button className={styles.btnPrimary} onClick={submit} disabled={loading}>
            {loading ? 'Salvando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
