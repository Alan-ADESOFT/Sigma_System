/**
 * components/comercial/LostLeadModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal "Marcar como perdido". Padrão SIGMA com SystemModal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import SystemModal, { Field, Textarea, SectionTitle } from './SystemModal';
import { useNotification } from '../../context/NotificationContext';

const SAD_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
    <line x1="9"  y1="9"  x2="9.01"  y2="9" />
    <line x1="15" y1="9"  x2="15.01" y2="9" />
  </svg>
);

const REASONS = [
  { k: 'sem_orcamento', l: 'Sem orçamento' },
  { k: 'sem_fit',       l: 'Sem fit' },
  { k: 'concorrente',   l: 'Concorrente fechou' },
  { k: 'sem_retorno',   l: 'Sem retorno' },
  { k: 'outro',         l: 'Outro' },
];

export default function LostLeadModal({ lead, onClose, onSuccess }) {
  const { notify } = useNotification();
  const [reasonKey, setReasonKey] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!reasonKey) { notify('Escolha um motivo', 'warning'); return; }
    setSubmitting(true);
    try {
      const reason = details.trim()
        ? `${REASONS.find(r => r.k === reasonKey)?.l || reasonKey} — ${details.trim()}`
        : (REASONS.find(r => r.k === reasonKey)?.l || reasonKey);

      const res = await fetch(`/api/comercial/pipeline/leads/${lead.id}/lost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');

      notify('Lead marcado como perdido', 'success');
      onSuccess?.(j);
      onClose?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SystemModal
      open
      onClose={onClose}
      icon={SAD_ICON}
      iconVariant="danger"
      title="Marcar como perdido"
      description="Registrar o motivo ajuda a calibrar a abordagem em leads parecidos no futuro."
      size="sm"
      primaryLabel={submitting ? 'Marcando...' : 'Confirmar'}
      onPrimary={submit}
      primaryLoading={submitting}
      primaryVariant="danger"
      primaryDisabled={!reasonKey}
      secondaryLabel="Cancelar"
    >
      <Field label="Motivo" required>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {REASONS.map(r => (
            <label
              key={r.k}
              style={{
                padding: '10px 14px',
                background: reasonKey === r.k ? 'rgba(255, 0, 51, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                border: reasonKey === r.k ? '1px solid rgba(255, 0, 51, 0.30)' : '1px solid var(--border-default)',
                borderRadius: 5,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.88rem',
                color: reasonKey === r.k ? 'var(--text-primary)' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.12s',
              }}
            >
              <input
                type="radio"
                name="lost-reason"
                value={r.k}
                checked={reasonKey === r.k}
                onChange={() => setReasonKey(r.k)}
                style={{ accentColor: 'var(--brand-500)' }}
              />
              {r.l}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Detalhes (opcional)">
        <Textarea
          rows={3}
          value={details}
          placeholder="Contexto adicional pra você se lembrar depois..."
          onChange={e => setDetails(e.target.value)}
        />
      </Field>
    </SystemModal>
  );
}
