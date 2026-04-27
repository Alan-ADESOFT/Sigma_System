/**
 * components/comercial/PublishProposalModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de publicação (padrão SIGMA). Mostra resumo, escolhe TTL, publica,
 * exibe link + mensagem WhatsApp pré-pronta com botão "Copiar com mensagem".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import SystemModal, { Field, Input, Textarea, InfoBox } from './SystemModal';
import { useNotification } from '../../context/NotificationContext';

const ROCKET_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

export default function PublishProposalModal({ proposal, onClose, onPublished }) {
  const { notify } = useNotification();
  const data = proposal.data || {};

  const [ttlDays, setTtlDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const sectionsFilled = [
    !!(data.diagnostic_text  && data.diagnostic_text.trim()),
    !!(data.opportunity_text && data.opportunity_text.trim()),
    Array.isArray(data.pillars)        && data.pillars.length > 0,
    Array.isArray(data.scope_items)    && data.scope_items.length > 0,
    Array.isArray(data.timeline)       && data.timeline.length > 0,
    Array.isArray(data.projection_stats) && data.projection_stats.length > 0,
    !!(data.investment && data.investment.full_price != null),
    Array.isArray(data.next_steps) && data.next_steps.length > 0,
  ].filter(Boolean).length;

  async function publish() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/comercial/proposals/${proposal.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlDays }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        if (j.details?.length) notify(`Falha: ${j.details.join(', ')}`, 'error');
        else notify(j.error || 'Falha ao publicar', 'error');
        return;
      }
      setResult({ publicUrl: j.publicUrl, copyMessage: j.copyMessage, expiresAt: j.expiresAt });
      notify('Proposta publicada', 'success');
      onPublished?.({ slug: j.slug });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function copy(text, label = 'Copiado') {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => notify(label, 'success', { duration: 1800 }));
  }

  /* Estado pós-publicação — mostra link + mensagem */
  if (result) {
    return (
      <SystemModal
        open
        onClose={onClose}
        iconVariant="success"
        title="Proposta publicada"
        description={`Link público gerado. Expira em ${new Date(result.expiresAt).toLocaleDateString('pt-BR')}.`}
        size="md"
        primaryLabel="Copiar mensagem WhatsApp"
        onPrimary={() => copy(result.copyMessage, 'Mensagem copiada')}
        secondaryLabel="Fechar"
      >
        <Field label="Link público">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={result.publicUrl}
              readOnly
              onFocus={e => e.target.select()}
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
            />
            <button
              type="button"
              onClick={() => copy(result.publicUrl, 'Link copiado')}
              style={{
                padding: '11px 18px',
                background: 'transparent',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >Copiar</button>
            <a
              href={result.publicUrl}
              target="_blank" rel="noreferrer"
              style={{
                padding: '11px 18px',
                background: 'transparent',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              Ver
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6, verticalAlign: '-1px' }}>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </Field>

        <Field label="Mensagem pré-pronta" hint="Editável no template padrão de propostas em Config. Comercial">
          <Textarea
            value={result.copyMessage}
            readOnly
            rows={6}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.86rem' }}
          />
        </Field>
      </SystemModal>
    );
  }

  /* Estado inicial — formulário de publicação */
  return (
    <SystemModal
      open
      onClose={onClose}
      icon={ROCKET_ICON}
      iconVariant="create"
      title="Publicar proposta"
      description={`Gera um link público trackeado. Cada visualização registra tempo de leitura, scroll máximo e visitor único na timeline do lead.`}
      size="md"
      primaryLabel={submitting ? 'Publicando...' : 'Publicar'}
      onPrimary={publish}
      primaryLoading={submitting}
      secondaryLabel="Cancelar"
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        marginBottom: 16,
      }}>
        <div style={{
          padding: '10px 14px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            Cliente
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', color: 'var(--text-primary)', fontWeight: 600 }}>
            {data.client_name || '—'}
          </div>
        </div>
        <div style={{
          padding: '10px 14px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            Seções preenchidas
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92rem', color: 'var(--text-primary)', fontWeight: 600 }}>
            {sectionsFilled} / 8
          </div>
        </div>
      </div>

      <Field label="Validade do link" hint="Após esse prazo, o link público retorna 'expirada' automaticamente">
        <Input
          type="number"
          min="1"
          max="60"
          value={ttlDays}
          placeholder="7"
          onChange={e => setTtlDays(Number(e.target.value) || 7)}
        />
      </Field>

      {sectionsFilled < 4 && (
        <InfoBox variant="warning">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9"  x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Apenas {sectionsFilled} de 8 seções preenchidas. Considere completar diagnóstico, oportunidade, pilares e investimento antes de publicar.
          </span>
        </InfoBox>
      )}
    </SystemModal>
  );
}
