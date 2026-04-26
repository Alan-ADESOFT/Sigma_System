/**
 * pages/dashboard/comercial/pipeline/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pipeline Comercial — Kanban com colunas customizáveis.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '../../../../components/DashboardLayout';
import KanbanBoard from '../../../../components/comercial/KanbanBoard';
import LeadDetailModal from '../../../../components/comercial/LeadDetailModal';
import BulkActionBar from '../../../../components/comercial/BulkActionBar';
import LeadWhatsAppModal from '../../../../components/comercial/LeadWhatsAppModal';
import ConfirmModal from '../../../../components/comercial/ConfirmModal';
import SystemModal, { Field, Input, Select, Row2, Row21, Textarea } from '../../../../components/comercial/SystemModal';
import {
  maskPhoneBR, unmaskPhone, validatePhoneBR,
  validateEmail, normalizeUrl, validateUrl,
  validateUF, UFS,
} from '../../../../components/comercial/inputMasks';
import { useNotification } from '../../../../context/NotificationContext';
import styles from '../../../../assets/style/comercialKanban.module.css';
import captacaoStyles from '../../../../assets/style/comercialCaptacao.module.css';

const COLOR_PALETTE = ['#94A3B8','#3B82F6','#6366F1','#F59E0B','#EF4444','#10B981','#6B7280','#EC4899','#14B8A6','#F97316'];

export default function PipelinePage() {
  const { notify } = useNotification();

  const [columns, setColumns] = useState([]);
  const [leads, setLeads]     = useState([]);
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [showColModal, setShowColModal] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [openLeadId, setOpenLeadId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkWhatsAppIds, setBulkWhatsAppIds] = useState(null);

  async function fetchAll() {
    setLoading(true);
    try {
      const [colRes, leadRes] = await Promise.all([
        fetch('/api/comercial/pipeline/columns').then(r => r.json()),
        fetch('/api/comercial/pipeline/leads').then(r => r.json()),
      ]);
      if (colRes.success)  setColumns(colRes.columns);
      if (leadRes.success) setLeads(leadRes.leads);
    } catch (err) {
      notify('Erro ao carregar pipeline', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  // Re-fetch leads quando search mudar
  useEffect(() => {
    if (loading) return;
    const id = setTimeout(async () => {
      try {
        const url = `/api/comercial/pipeline/leads${search ? `?search=${encodeURIComponent(search)}` : ''}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.success) setLeads(json.leads);
      } catch {}
    }, 250);
    return () => clearTimeout(id);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [search]);

  function openLead(lead) {
    setOpenLeadId(lead.id);
    setShowLeadModal(true);
  }

  const toggleSelect = useCallback((leadId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }, []);

  // Carrega lista de usuários (autenticados) para dropdown de bulk-assign
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(j => { if (Array.isArray(j?.users)) setUsers(j.users); })
      .catch(() => {});
  }, []);

  return (
    <DashboardLayout activeTab="comercial/pipeline">
      <div className={styles.page}>
        <div className={captacaoStyles.headerRow}>
          <div className={captacaoStyles.headerLeft}>
            <h1 className="page-title">Pipeline Comercial</h1>
            <p className="page-subtitle">
              {leads.length} leads em {columns.length} colunas
            </p>
          </div>
          <div className={captacaoStyles.headerActions}>
            <button className="btn btn-secondary" onClick={() => setShowColModal(true)}>+ Nova coluna</button>
            <button className="sigma-btn-primary" onClick={() => setShowCreateModal(true)}>+ Novo lead</button>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
              <svg
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className={styles.searchInput}
                placeholder="Buscar por empresa, telefone, contato..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36, width: '100%' }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Limpar busca"
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 22, height: 22,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        <BulkActionBar
          selectedIds={selectedIds}
          columns={columns}
          users={users}
          onClear={() => setSelectedIds(new Set())}
          onChange={() => { setSelectedIds(new Set()); fetchAll(); }}
          onSendWhatsApp={(ids) => setBulkWhatsAppIds(ids)}
        />

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Carregando pipeline...
          </div>
        ) : (
          <KanbanBoard
            columns={columns}
            leads={leads}
            onLeadsChange={setLeads}
            onColumnsChange={fetchAll}
            onOpenLead={openLead}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}

        {showColModal && (
          <ColumnModal onClose={() => setShowColModal(false)} onCreated={fetchAll} />
        )}
        {showCreateModal && (
          <CreateLeadModal columns={columns} onClose={() => setShowCreateModal(false)} onCreated={fetchAll} />
        )}
        {showLeadModal && openLeadId && (
          <LeadDetailModal
            leadId={openLeadId}
            columns={columns}
            onClose={() => { setShowLeadModal(false); setOpenLeadId(null); }}
            onSaved={fetchAll}
          />
        )}

        {bulkWhatsAppIds && (
          <BulkWhatsAppModal
            leadIds={bulkWhatsAppIds}
            onClose={() => setBulkWhatsAppIds(null)}
            onSent={() => { setBulkWhatsAppIds(null); setSelectedIds(new Set()); fetchAll(); }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

/* ─── Bulk WhatsApp Modal ────────────────────────────────────────── */
function BulkWhatsAppModal({ leadIds, onClose, onSent }) {
  const { notify } = useNotification();
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetch('/api/comercial/templates?channel=whatsapp')
      .then(r => r.json())
      .then(j => { if (j.success) setTemplates(j.templates); });
  }, []);

  function tryStart() {
    if (!templateId) return notify('Escolha um template', 'warning');
    setConfirmOpen(true);
  }

  async function send() {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const res = await fetch('/api/comercial/pipeline/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_whatsapp', leadIds, payload: { templateId } }),
      });
      const j = await res.json();
      if (res.status === 429 || res.status === 413) { notify(j.error, 'warning'); return; }
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      notify(`${j.processed} enviados${j.failed ? ` · ${j.failed} falhas` : ''}`, 'success');
      onSent?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <SystemModal
        open
        onClose={onClose}
        iconVariant="whatsapp"
        title={`Disparo em massa — ${leadIds.length} leads`}
        description="Envia o mesmo template pra cada lead com 3s de delay (anti-ban da Meta). Roda em segundo plano — você pode fechar essa aba."
        size="md"
        primaryLabel={submitting ? `Enviando ${leadIds.length}...` : `Enviar para ${leadIds.length}`}
        onPrimary={tryStart}
        primaryLoading={submitting}
        primaryDisabled={!templateId}
        secondaryLabel="Cancelar"
      >
        <Field label="Template" required>
          <Select value={templateId} onChange={e => setTemplateId(e.target.value)}>
            <option value="">— escolha um template —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </SystemModal>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={send}
        variant="warning"
        title={`Confirmar disparo para ${leadIds.length} leads?`}
        description={`O envio será sequencial com 3s entre cada mensagem (~${Math.ceil(leadIds.length * 3 / 60)} min estimados). Roda em segundo plano.`}
        confirmLabel="Disparar"
        cancelLabel="Voltar"
      />
    </>
  );
}

/* ─── Nova coluna do Kanban ──────────────────────────────────────── */
function ColumnModal({ onClose, onCreated }) {
  const { notify } = useNotification();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366F1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Nome obrigatório'); return; }
    if (trimmed.length < 2) { setError('Mínimo 2 caracteres'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/comercial/pipeline/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, color }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha');
      notify('Coluna criada', 'success');
      onCreated?.();
      onClose();
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
      iconVariant="create"
      title="Nova coluna"
      description="Cria uma nova etapa customizada no Kanban. Você pode renomear ou deletar depois."
      size="sm"
      primaryLabel={submitting ? 'Criando...' : 'Criar coluna'}
      onPrimary={submit}
      primaryLoading={submitting}
      primaryDisabled={!name.trim()}
      secondaryLabel="Cancelar"
    >
      <Field label="Nome da etapa" required error={error}>
        <Input
          autoFocus
          value={name}
          placeholder="Ex: Qualificação técnica"
          onChange={e => { setName(e.target.value); if (error) setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
      </Field>

      <Field label="Cor de identificação">
        <div className={styles.colorPicker}>
          {COLOR_PALETTE.map(c => (
            <div
              key={c}
              className={`${styles.colorDot} ${color === c ? styles.colorDotActive : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>
      </Field>
    </SystemModal>
  );
}

/* ─── Novo lead manual ───────────────────────────────────────────── */
function CreateLeadModal({ columns, onClose, onCreated }) {
  const { notify } = useNotification();
  const [data, setData] = useState({
    company_name: '', phone: '', email: '', website: '', niche: '', city: '', state: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function setField(k, v) {
    setData(d => ({ ...d, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: null }));
  }

  function validateAll() {
    const errs = {};
    if (!data.company_name.trim()) errs.company_name = 'Nome da empresa obrigatório';
    else if (data.company_name.trim().length < 2) errs.company_name = 'Mínimo 2 caracteres';

    const phoneErr = validatePhoneBR(data.phone);
    if (phoneErr) errs.phone = phoneErr;

    const emailErr = validateEmail(data.email);
    if (emailErr) errs.email = emailErr;

    if (data.website) {
      const urlErr = validateUrl(data.website);
      if (urlErr) errs.website = urlErr;
    }

    if (data.state) {
      const ufErr = validateUF(data.state);
      if (ufErr) errs.state = ufErr;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    if (!validateAll()) return;
    setSubmitting(true);
    try {
      const payload = {
        ...data,
        company_name: data.company_name.trim(),
        phone:        data.phone ? unmaskPhone(data.phone) : null,
        email:        data.email ? data.email.trim().toLowerCase() : null,
        website:      data.website ? normalizeUrl(data.website) : null,
        niche:        data.niche.trim() || null,
        city:         data.city.trim() || null,
        state:        data.state ? data.state.toUpperCase() : null,
      };
      const res = await fetch('/api/comercial/pipeline/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha');
      notify('Lead criado', 'success');
      onCreated?.();
      onClose();
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
      iconVariant="create"
      title="Novo lead"
      description="Adiciona um lead manualmente no pipeline (vai pra coluna inicial). Pra importar em massa do Google Maps, use a aba Captação."
      size="md"
      primaryLabel={submitting ? 'Criando...' : 'Criar lead'}
      onPrimary={submit}
      primaryLoading={submitting}
      secondaryLabel="Cancelar"
    >
      <Field label="Empresa" required error={errors.company_name}>
        <Input
          autoFocus
          value={data.company_name}
          placeholder="Ex: Construtora Sampaio"
          onChange={e => setField('company_name', e.target.value)}
        />
      </Field>

      <Row2>
        <Field label="Telefone" error={errors.phone}>
          <Input
            value={data.phone}
            placeholder="(47) 99999-8888"
            maxLength={20}
            onChange={e => setField('phone', maskPhoneBR(e.target.value))}
          />
        </Field>
        <Field label="E-mail" error={errors.email}>
          <Input
            type="email"
            value={data.email}
            placeholder="contato@empresa.com.br"
            onChange={e => setField('email', e.target.value)}
          />
        </Field>
      </Row2>

      <Row2>
        <Field label="Website" error={errors.website}>
          <Input
            value={data.website}
            placeholder="exemplo.com.br"
            onChange={e => setField('website', e.target.value)}
          />
        </Field>
        <Field label="Nicho">
          <Input
            value={data.niche}
            placeholder="Ex: Construção civil"
            onChange={e => setField('niche', e.target.value)}
          />
        </Field>
      </Row2>

      <Row21>
        <Field label="Cidade">
          <Input
            value={data.city}
            placeholder="Ex: Joinville"
            onChange={e => setField('city', e.target.value)}
          />
        </Field>
        <Field label="UF" error={errors.state}>
          <Select value={data.state} onChange={e => setField('state', e.target.value)}>
            <option value="">—</option>
            {UFS.map(u => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
      </Row21>
    </SystemModal>
  );
}
