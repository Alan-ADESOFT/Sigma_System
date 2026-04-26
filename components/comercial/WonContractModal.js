/**
 * components/comercial/WonContractModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal "Marcar como fechado" — cria marketing_client + opcional contrato.
 * Padrão SIGMA com SystemModal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useRouter } from 'next/router';
import SystemModal, {
  Field, Input, Textarea, Row2, Row3, SectionTitle, InfoBox,
} from './SystemModal';
import { useNotification } from '../../context/NotificationContext';
import { maskCurrencyBRL, unmaskCurrency } from './inputMasks';

const TROPHY_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

export default function WonContractModal({ lead, onClose, onSuccess }) {
  const router = useRouter();
  const { notify } = useNotification();

  const [withContract, setWithContract] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [client, setClient] = useState({
    mainProduct:        '',
    niche:              lead?.niche || '',
    region:             [lead?.city, lead?.state].filter(Boolean).join('/') || '',
    avgTicket:          '',
    observations:       '',
  });

  const [contract, setContract] = useState({
    contractValueMasked:  '',
    monthlyValueMasked:   '',
    numInstallments:      12,
    dueDay:               5,
    startDate:            new Date().toISOString().slice(0, 10),
  });

  function setField(k, v)  { setClient(s => ({ ...s, [k]: v })); }
  function setCField(k, v) { setContract(s => ({ ...s, [k]: v })); }

  async function submit() {
    setSubmitting(true);
    try {
      const body = { ...client };
      if (withContract && contract.contractValueMasked) {
        body.contract = {
          contractValue:   unmaskCurrency(contract.contractValueMasked),
          monthlyValue:    unmaskCurrency(contract.monthlyValueMasked),
          numInstallments: contract.numInstallments ? Number(contract.numInstallments) : null,
          dueDay:          contract.dueDay ? Number(contract.dueDay) : null,
          startDate:       contract.startDate || null,
          services:        [],
        };
      }

      const res = await fetch(`/api/comercial/pipeline/leads/${lead.id}/won`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha ao fechar');

      notify('Contrato fechado — bem-vindo ao time', 'success', {
        action: { label: 'Ver cliente', onClick: () => router.push(j.redirectTo) },
      });
      onSuccess?.(j);
      onClose?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  /* Lead já fechado anteriormente — mostra atalho pra ver cliente existente */
  if (lead?.client_id) {
    return (
      <SystemModal
        open
        onClose={onClose}
        icon={TROPHY_ICON}
        iconVariant="success"
        title="Lead já fechado"
        description="Este lead foi marcado como ganho anteriormente. Você pode visualizar o cliente existente em vez de criar um novo."
        size="sm"
        primaryLabel="Ver cliente"
        onPrimary={() => router.push(`/dashboard/clients/${lead.client_id}`)}
        secondaryLabel="Voltar"
      >
        <InfoBox variant="info">
          // CLIENT_ID: {lead.client_id}
        </InfoBox>
      </SystemModal>
    );
  }

  return (
    <SystemModal
      open
      onClose={onClose}
      icon={TROPHY_ICON}
      iconVariant="success"
      title="Fechar contrato"
      description={`Migra ${lead?.company_name || 'o lead'} para a base de clientes. O lead vai pra coluna "Fechado" do Kanban e um marketing_client é criado.`}
      size="lg"
      primaryLabel={submitting ? 'Fechando...' : 'Confirmar fechamento'}
      onPrimary={submit}
      primaryLoading={submitting}
      secondaryLabel="Cancelar"
    >
      <SectionTitle>Dados do cliente</SectionTitle>

      <Row2>
        <Field label="Produto principal">
          <Input
            value={client.mainProduct}
            placeholder="Ex: Gestão de tráfego + criação"
            onChange={e => setField('mainProduct', e.target.value)}
          />
        </Field>
        <Field label="Ticket médio">
          <Input
            value={client.avgTicket}
            placeholder="Ex: R$ 5.000/mês"
            onChange={e => setField('avgTicket', e.target.value)}
          />
        </Field>
      </Row2>

      <Row2>
        <Field label="Nicho">
          <Input
            value={client.niche}
            placeholder="Ex: Construção civil"
            onChange={e => setField('niche', e.target.value)}
          />
        </Field>
        <Field label="Região">
          <Input
            value={client.region}
            placeholder="Ex: Joinville/SC"
            onChange={e => setField('region', e.target.value)}
          />
        </Field>
      </Row2>

      <Field label="Observações">
        <Textarea
          rows={3}
          value={client.observations}
          placeholder="Notas internas sobre esse fechamento (acordo verbal, particularidades...)"
          onChange={e => setField('observations', e.target.value)}
        />
      </Field>

      <label
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.86rem',
          color: 'var(--text-primary)',
          marginTop: 6,
        }}
      >
        <input
          type="checkbox"
          checked={withContract}
          onChange={e => setWithContract(e.target.checked)}
          style={{ accentColor: 'var(--brand-500)' }}
        />
        Criar contrato financeiro também
      </label>

      {withContract && (
        <>
          <SectionTitle>Contrato financeiro</SectionTitle>

          <Row2>
            <Field label="Valor total">
              <Input
                value={contract.contractValueMasked}
                placeholder="R$ 60.000,00"
                onChange={e => setCField('contractValueMasked', maskCurrencyBRL(e.target.value))}
              />
            </Field>
            <Field label="Valor mensal">
              <Input
                value={contract.monthlyValueMasked}
                placeholder="R$ 5.000,00"
                onChange={e => setCField('monthlyValueMasked', maskCurrencyBRL(e.target.value))}
              />
            </Field>
          </Row2>

          <Row3>
            <Field label="Parcelas">
              <Input
                type="number"
                min="1"
                max="60"
                value={contract.numInstallments}
                placeholder="12"
                onChange={e => setCField('numInstallments', e.target.value)}
              />
            </Field>
            <Field label="Dia vencimento">
              <Input
                type="number"
                min="1"
                max="28"
                value={contract.dueDay}
                placeholder="5"
                onChange={e => setCField('dueDay', e.target.value)}
              />
            </Field>
            <Field label="Início">
              <Input
                type="date"
                value={contract.startDate}
                onChange={e => setCField('startDate', e.target.value)}
              />
            </Field>
          </Row3>
        </>
      )}
    </SystemModal>
  );
}
