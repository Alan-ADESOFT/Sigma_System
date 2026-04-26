/**
 * components/comercial/NewProposalModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal "Nova Proposta" — escolhe prospect (existente | criar manual |
 * importar de pipeline_lead) e opcionalmente dispara IA de imediato.
 * Padrão SIGMA com SystemModal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import SystemModal, {
  Field, Input, Select, Row2, Row3, SectionTitle, InfoBox,
} from './SystemModal';
import listStyles from '../../assets/style/proposalsList.module.css';
import { useNotification } from '../../context/NotificationContext';
import {
  maskPhoneBR, unmaskPhone, validatePhoneBR, validateEmail,
  normalizeUrl, validateUrl, UFS,
} from './inputMasks';

const PROPOSAL_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="15" y2="17" />
  </svg>
);

export default function NewProposalModal({ onClose }) {
  const router = useRouter();
  const { notify } = useNotification();

  const [tab, setTab] = useState('existing');
  const [prospects, setProspects] = useState([]);
  const [search, setSearch] = useState('');
  const [pipelineLeads, setPipelineLeads] = useState([]);
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [manualForm, setManualForm] = useState({
    companyName: '', contactName: '', phone: '', email: '',
    website: '', niche: '', city: '', state: '',
  });
  const [errors, setErrors] = useState({});
  const [generateAI, setGenerateAI] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tab === 'existing') {
      fetch(`/api/comercial/prospects${search ? `?search=${encodeURIComponent(search)}` : ''}`)
        .then(r => r.json())
        .then(j => { if (j.success) setProspects(j.prospects); })
        .catch(() => {});
    }
    if (tab === 'pipeline') {
      fetch(`/api/comercial/pipeline/leads${pipelineSearch ? `?search=${encodeURIComponent(pipelineSearch)}` : ''}`)
        .then(r => r.json())
        .then(j => { if (j.success) setPipelineLeads(j.leads); })
        .catch(() => {});
    }
  }, [tab, search, pipelineSearch]);

  function setManualField(k, v) {
    setManualForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: null }));
  }

  function validateManual() {
    const errs = {};
    if (!manualForm.companyName.trim()) errs.companyName = 'Nome da empresa obrigatório';
    const phoneErr = validatePhoneBR(manualForm.phone);
    if (phoneErr) errs.phone = phoneErr;
    const emailErr = validateEmail(manualForm.email);
    if (emailErr) errs.email = emailErr;
    if (manualForm.website) {
      const urlErr = validateUrl(manualForm.website);
      if (urlErr) errs.website = urlErr;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function ensureProspect() {
    if (tab === 'existing') {
      if (!selectedProspect) throw new Error('Selecione um prospect');
      return selectedProspect.id;
    }
    if (tab === 'manual') {
      if (!validateManual()) throw new Error('Corrija os campos destacados');

      const payload = {
        ...manualForm,
        companyName: manualForm.companyName.trim(),
        phone:       manualForm.phone   ? unmaskPhone(manualForm.phone) : null,
        email:       manualForm.email   ? manualForm.email.trim().toLowerCase() : null,
        website:     manualForm.website ? normalizeUrl(manualForm.website) : null,
      };

      const res = await fetch('/api/comercial/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha ao criar prospect');
      return j.prospect.id;
    }
    if (tab === 'pipeline') {
      if (!selectedLead) throw new Error('Selecione um lead');
      const res = await fetch(`/api/comercial/prospects/from-lead/${selectedLead.id}`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      return j.prospect.id;
    }
    throw new Error('Aba inválida');
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const prospectId = await ensureProspect();
      const res = await fetch('/api/comercial/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha ao criar proposta');

      notify('Proposta criada — abrindo editor...', 'success');
      const url = `/dashboard/comercial/propostas/${j.proposal.id}/edit${generateAI ? '?ai=1' : ''}`;
      onClose?.();
      router.push(url);
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
      icon={PROPOSAL_ICON}
      iconVariant="create"
      title="Nova proposta"
      description="Escolha um prospect existente, crie um novo manualmente, ou importe direto do pipeline. Você pode disparar a geração de conteúdo IA imediatamente."
      size="md"
      primaryLabel={submitting ? 'Criando...' : 'Criar proposta'}
      onPrimary={handleSubmit}
      primaryLoading={submitting}
      secondaryLabel="Cancelar"
    >
      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: 3,
        marginBottom: 18,
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
      }}>
        {[
          { k: 'existing', l: 'Prospect existente' },
          { k: 'manual',   l: 'Criar manual' },
          { k: 'pipeline', l: 'Do pipeline' },
        ].map(t => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: tab === t.k ? 'rgba(255, 0, 51, 0.08)' : 'transparent',
              color: tab === t.k ? 'var(--brand-400)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: tab === t.k ? 700 : 500,
              transition: 'all 0.15s',
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba ativa */}
      {tab === 'existing' && (
        <>
          <Field label="Buscar prospect">
            <Input
              placeholder="Digite o nome da empresa..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </Field>
          <div className={listStyles.prospectList}>
            {prospects.length === 0
              ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>Nenhum prospect encontrado</div>
              : prospects.map(p => (
                <div key={p.id}
                     className={`${listStyles.prospectItem} ${selectedProspect?.id === p.id ? listStyles.active : ''}`}
                     onClick={() => setSelectedProspect(p)}>
                  <div>
                    <div className={listStyles.prospectName}>{p.company_name}</div>
                    <div className={listStyles.prospectMeta}>
                      {[p.city, p.state].filter(Boolean).join('/') || p.niche || '—'}
                      {' · '}{p.proposal_count || 0} proposta{(p.proposal_count || 0) !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {tab === 'manual' && (
        <>
          <SectionTitle>Dados do prospect</SectionTitle>

          <Field label="Empresa" required error={errors.companyName}>
            <Input
              autoFocus
              value={manualForm.companyName}
              placeholder="Ex: Construtora Sampaio"
              onChange={e => setManualField('companyName', e.target.value)}
            />
          </Field>

          <Row2>
            <Field label="Contato">
              <Input
                value={manualForm.contactName}
                placeholder="Ex: Jonatas"
                onChange={e => setManualField('contactName', e.target.value)}
              />
            </Field>
            <Field label="Telefone" error={errors.phone}>
              <Input
                value={manualForm.phone}
                placeholder="(47) 99999-8888"
                maxLength={20}
                onChange={e => setManualField('phone', maskPhoneBR(e.target.value))}
              />
            </Field>
          </Row2>

          <Row2>
            <Field label="E-mail" error={errors.email}>
              <Input
                type="email"
                value={manualForm.email}
                placeholder="contato@empresa.com.br"
                onChange={e => setManualField('email', e.target.value)}
              />
            </Field>
            <Field label="Website" error={errors.website}>
              <Input
                value={manualForm.website}
                placeholder="exemplo.com.br"
                onChange={e => setManualField('website', e.target.value)}
              />
            </Field>
          </Row2>

          <Row3>
            <Field label="Nicho">
              <Input
                value={manualForm.niche}
                placeholder="Ex: Construção civil"
                onChange={e => setManualField('niche', e.target.value)}
              />
            </Field>
            <Field label="Cidade">
              <Input
                value={manualForm.city}
                placeholder="Ex: Joinville"
                onChange={e => setManualField('city', e.target.value)}
              />
            </Field>
            <Field label="UF">
              <Select
                value={manualForm.state}
                onChange={e => setManualField('state', e.target.value)}
              >
                <option value="">—</option>
                {UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
          </Row3>
        </>
      )}

      {tab === 'pipeline' && (
        <>
          <Field label="Buscar lead no pipeline">
            <Input
              placeholder="Digite o nome..."
              value={pipelineSearch}
              onChange={e => setPipelineSearch(e.target.value)}
            />
          </Field>
          <div className={listStyles.prospectList}>
            {pipelineLeads.length === 0
              ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>Nenhum lead no pipeline</div>
              : pipelineLeads.map(l => (
                <div key={l.id}
                     className={`${listStyles.prospectItem} ${selectedLead?.id === l.id ? listStyles.active : ''}`}
                     onClick={() => setSelectedLead(l)}>
                  <div>
                    <div className={listStyles.prospectName}>{l.company_name}</div>
                    <div className={listStyles.prospectMeta}>
                      {l.column_name} · score {l.sigma_score || 0}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      <label
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', marginTop: 14,
          background: 'rgba(255, 0, 51, 0.04)',
          border: '1px solid rgba(255, 0, 51, 0.15)',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.86rem',
          color: 'var(--text-primary)',
        }}
      >
        <input
          type="checkbox"
          checked={generateAI}
          onChange={e => setGenerateAI(e.target.checked)}
          style={{ accentColor: 'var(--brand-500)' }}
        />
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-500)', flexShrink: 0 }}>
          <polygon points="12 2 15 9 22 9 16 14 18 21 12 17 6 21 8 14 2 9 9 9 12 2" />
        </svg>
        Gerar conteúdo com IA imediatamente após criar
      </label>
    </SystemModal>
  );
}
