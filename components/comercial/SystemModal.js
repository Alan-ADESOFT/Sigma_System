/**
 * components/comercial/SystemModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shell de modal no padrão SIGMA — IconBox + título + descrição + close.
 * Pra modais de formulário (criar/editar). Pra confirmação destrutiva,
 * use ConfirmModal (que tem warningBox interno).
 *
 * Uso:
 *   <SystemModal
 *     open={x}
 *     onClose={...}
 *     iconVariant="create"        // 'create' | 'edit' | 'danger' | 'warning' | 'info' | 'success'
 *     icon={<svg.../>}            // sobrescreve o default
 *     title="Novo lead"
 *     description="Adiciona um lead manualmente no pipeline."
 *     size="md"                    // 'sm' | 'md' | 'lg'
 *     primaryLabel="CRIAR LEAD"
 *     onPrimary={handleSubmit}
 *     primaryDisabled={!valid}
 *     primaryLoading={submitting}
 *     secondaryLabel="CANCELAR"
 *   >
 *     <Field label="Empresa *">
 *       <Input value={...} onChange={...} placeholder="..." />
 *     </Field>
 *     ...
 *   </SystemModal>
 *
 * Se quiser controle total dos botões, omita primaryLabel/onPrimary e
 * passe um <SystemModalActions>...</SystemModalActions> custom no children.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import styles from '../../assets/style/systemModal.module.css';

const ICONS = {
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
  danger: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
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
  view: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  whatsapp: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  upload: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  rocket: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7l-4-4z" />
      <path d="M9 17l-3 3-2-2 3-3" />
    </svg>
  ),
  download: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
};

const ICON_BOX_CLASS = {
  create: '', edit: '', danger: '',
  warning: styles.iconBoxWarning,
  info:    styles.iconBoxInfo,
  success: styles.iconBoxSuccess,
  view:    '',
  whatsapp: styles.iconBoxSuccess,
  upload:  '',
  rocket:  '',
  download: '',
};

const CLOSE_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function SystemModal({
  open,
  onClose,
  iconVariant = 'create',
  icon,
  title,
  description,
  size = 'md',
  // Botões controlados (use ou estes ou o children com SystemModalActions)
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  primaryVariant = 'primary',  // 'primary' | 'danger'
  secondaryLabel = 'Cancelar',
  onSecondary,                  // se omitido, usa onClose
  hideActions = false,
  children,
  // a11y
  closeOnBackdrop = true,
  closeOnEsc = true,
}) {
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    function onKey(e) { if (e.key === 'Escape' && !primaryLoading) onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeOnEsc, primaryLoading, onClose]);

  if (!open) return null;

  const finalIcon = icon || ICONS[iconVariant] || ICONS.create;
  const iconBoxCls = ICON_BOX_CLASS[iconVariant] ?? '';
  const sizeCls =
    size === 'sm' ? styles.modalSm
    : size === 'lg' ? styles.modalLg
    : size === 'xl' ? styles.modalXl
    : '';

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget && !primaryLoading) onClose?.();
      }}
    >
      <div className={`${styles.modal} ${sizeCls} ${styles.modalEnter}`}>
        <div className={styles.header}>
          <div className={`${styles.iconBox} ${iconBoxCls}`}>{finalIcon}</div>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.description}>{description}</p>}
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            disabled={primaryLoading}
            type="button"
            title="Fechar"
          >
            {CLOSE_ICON}
          </button>
        </div>

        {children}

        {!hideActions && primaryLabel && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onSecondary || onClose}
              disabled={primaryLoading}
            >
              {secondaryLabel}
            </button>
            <button
              type="button"
              className={primaryVariant === 'danger' ? styles.btnDanger : styles.btnPrimary}
              onClick={onPrimary}
              disabled={primaryDisabled || primaryLoading}
            >
              {primaryLoading ? 'Processando...' : primaryLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers de formulário ──────────────────────────────────────── */

export function Field({ label, required, children, error, hint }) {
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.fieldLabel}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      {children}
      {error && <span className={styles.fieldError}>{error}</span>}
      {hint && !error && <span className={styles.fieldHint}>{hint}</span>}
    </div>
  );
}

export function Input(props) {
  return <input {...props} className={`${styles.fieldInput} ${props.className || ''}`} />;
}

export function Textarea(props) {
  return <textarea {...props} className={`${styles.fieldTextarea} ${props.className || ''}`} />;
}

export function Select({ children, ...props }) {
  return <select {...props} className={`${styles.fieldSelect} ${props.className || ''}`}>{children}</select>;
}

export function Row2({ children }) { return <div className={styles.row2}>{children}</div>; }
export function Row3({ children }) { return <div className={styles.row3}>{children}</div>; }
export function Row21({ children }) { return <div className={styles.row21}>{children}</div>; }
export function Row12({ children }) { return <div className={styles.row12}>{children}</div>; }

export function SectionTitle({ children }) {
  return <div className={styles.sectionTitle}>{children}</div>;
}

export function InfoBox({ children, variant = 'info' }) {
  const cls = variant === 'warning' ? styles.warnInlineBox : styles.infoBox;
  return <div className={cls}>{children}</div>;
}

export function Actions({ children }) {
  return <div className={styles.actions}>{children}</div>;
}

// Re-exporta classes de botão pra uso quando precisar de actions custom
export const buttonClasses = {
  primary:   styles.btnPrimary,
  secondary: styles.btnSecondary,
  danger:    styles.btnDanger,
};
