/**
 * components/comercial/LeadWhatsAppModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de envio de WhatsApp para um lead (padrão SIGMA).
 * Carrega templates, renderiza variáveis via API, permite edição e envia.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import SystemModal, {
  Field, Select, Textarea, InfoBox,
} from './SystemModal';
import { useNotification } from '../../context/NotificationContext';

const WHATSAPP_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

function fmtPhone(raw) {
  if (!raw) return '—';
  const d = String(raw).replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  }
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return raw;
}

export default function LeadWhatsAppModal({ leadId, lead, onClose, onSent }) {
  const { notify } = useNotification();
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [resolvedVars, setResolvedVars] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/comercial/templates?channel=whatsapp')
      .then(r => r.json())
      .then(j => { if (j.success) setTemplates(j.templates); })
      .catch(() => notify('Erro ao carregar templates', 'error'))
      .finally(() => setLoading(false));
  }, [notify]);

  async function pickTemplate(id) {
    setSelectedId(id);
    if (!id) { setMessage(''); setResolvedVars({}); return; }
    try {
      const res = await fetch(`/api/comercial/templates/${id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineLeadId: leadId }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      setMessage(j.rendered);
      setResolvedVars(j.variables || {});
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  async function send() {
    if (!message.trim()) { notify('Mensagem obrigatória', 'warning'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/comercial/pipeline/leads/${leadId}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, templateId: selectedId || null }),
      });
      const j = await res.json();
      if (res.status === 502) { notify(j.error || 'Z-API não conectada', 'error'); return; }
      if (res.status === 429) { notify(j.error || 'Limite atingido', 'warning'); return; }
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      notify('Mensagem enviada', 'success');
      onSent?.(j);
      onClose?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const phone = lead?.phone;

  return (
    <SystemModal
      open
      onClose={onClose}
      icon={WHATSAPP_ICON}
      iconVariant="whatsapp"
      title={`Enviar WhatsApp — ${lead?.company_name || 'lead'}`}
      description={phone
        ? `Envia via Z-API para ${fmtPhone(phone)} e registra na timeline do lead.`
        : 'Envia via Z-API e registra na timeline do lead.'}
      size="md"
      primaryLabel={submitting ? 'Enviando...' : 'Enviar mensagem'}
      onPrimary={send}
      primaryLoading={submitting}
      primaryDisabled={!phone || !message.trim()}
      secondaryLabel="Cancelar"
    >
      {!phone && (
        <InfoBox variant="warning">
          ⚠ Lead sem telefone cadastrado. Adicione um telefone antes de enviar.
        </InfoBox>
      )}

      <Field label="Template">
        <Select
          value={selectedId}
          onChange={e => pickTemplate(e.target.value)}
          disabled={loading}
        >
          <option value="">— escolha um template ou escreva do zero —</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' · padrão' : ''}</option>
          ))}
        </Select>
      </Field>

      <Field label="Mensagem" required hint={`${message.length} / 4096 caracteres`}>
        <Textarea
          rows={6}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Digite a mensagem ou selecione um template acima."
          maxLength={4096}
        />
      </Field>

      {Object.keys(resolvedVars).length > 0 && (
        <div style={{
          marginTop: 4,
          padding: '10px 12px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 6,
          }}>Variáveis resolvidas</div>
          {Object.entries(resolvedVars).map(([k, v]) => (
            <div key={k} style={{
              display: 'flex',
              gap: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              padding: '3px 0',
            }}>
              <span style={{ color: 'var(--brand-400)' }}>{`{${k}}`}</span>
              <span style={{ color: 'var(--text-muted)' }}>=</span>
              <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{v || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </SystemModal>
  );
}
