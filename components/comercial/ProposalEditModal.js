/**
 * components/comercial/ProposalEditModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal full-screen (90vw × 90vh) que abre o editor de proposta.
 * Internamente usa iframe apontando para a rota do editor com `?embed=1`,
 * que por sua vez renderiza sem `DashboardLayout`.
 *
 * Comunicação iframe → parent via postMessage:
 *   - 'sigma:close-proposal-modal'  → fecha o modal
 *   - 'sigma:proposal-saved'        → trigger refetch na listagem (opcional)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';

export default function ProposalEditModal({ proposalId, onClose, onSaved }) {
  useEffect(() => {
    function onMsg(e) {
      if (e.data === 'sigma:close-proposal-modal') onClose?.();
      if (e.data === 'sigma:proposal-saved')      onSaved?.();
    }
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('message', onMsg);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('message', onMsg);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, onSaved]);

  if (!proposalId) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0, 0, 0, 0.86)',
        backdropFilter: 'blur(8px)',
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '5vh 5vw',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        style={{
          width: '90vw', height: '90vh',
          maxWidth: '1600px', maxHeight: '95vh',
          background: 'var(--surface-base)',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
        }}
      >
        <button
          onClick={onClose}
          title="Fechar (Esc)"
          aria-label="Fechar"
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 10,
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(15, 15, 15, 0.95)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--brand-400)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6"  y2="18" />
            <line x1="6"  y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <iframe
          src={`/dashboard/comercial/propostas/${proposalId}/edit?embed=1`}
          title="Editar proposta"
          style={{
            width: '100%', height: '100%',
            border: 'none', display: 'block',
            background: 'var(--surface-base)',
          }}
        />
      </div>
    </div>
  );
}
