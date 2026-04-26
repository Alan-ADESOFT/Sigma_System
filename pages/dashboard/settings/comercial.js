/**
 * pages/dashboard/settings/comercial.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Configurações do Módulo Comercial:
 *   · Settings numéricos (TTLs, rate limits)
 *   · Toggles de notificações
 *   · CRUD de templates de mensagem
 *   · Status das integrações (APIFY_TOKEN, Z-API)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import SystemModal, { Field, Input, Select, Row2, Textarea } from '../../../components/comercial/SystemModal';
import ConfirmModal from '../../../components/comercial/ConfirmModal';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/comercialCaptacao.module.css';
import templateStyles from '../../../assets/style/messageTemplateModal.module.css';

const VAR_LIST = ['nome_empresa', 'nome_contato', 'cidade', 'nicho', 'link_proposta', 'nome_responsavel'];

export default function ComercialSettingsPage() {
  const { notify } = useNotification();

  // Settings
  const [settings, setSettings] = useState({
    comercial_list_ttl_days: 5,
    comercial_proposal_ttl_days: 7,
    comercial_max_jobs_per_day: 10,
    comercial_notify_proposal_viewed: true,
    comercial_notify_lead_won: true,
    comercial_notify_analysis_done: true,
    comercial_notify_proposal_expiring: true,
  });
  const [apifyOk, setApifyOk] = useState(false);
  const [zapiOk, setZapiOk]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [showTplModal, setShowTplModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState(null);

  async function loadSettings() {
    try {
      const res = await fetch('/api/comercial/settings');
      const j = await res.json();
      if (j.success) {
        setSettings(prev => ({ ...prev, ...j.settings }));
        setApifyOk(!!j.settings.apify_token_configured);
        setZapiOk(!!j.settings.zapi_configured);
      }
    } catch (err) {
      notify('Erro ao carregar settings', 'error');
    }
  }

  async function loadTemplates() {
    try {
      const res = await fetch('/api/comercial/templates');
      const j = await res.json();
      if (j.success) setTemplates(j.templates);
    } catch (err) {
      notify('Erro ao carregar templates', 'error');
    }
  }

  useEffect(() => {
    Promise.all([loadSettings(), loadTemplates()]).finally(() => setLoading(false));
    /* eslint-disable-next-line */
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/comercial/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      notify('Configurações salvas', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function setField(k, v) { setSettings(s => ({ ...s, [k]: v })); }

  const [pendingDeleteTpl, setPendingDeleteTpl] = useState(null);
  function deleteTpl(t) { setPendingDeleteTpl(t); }
  async function confirmDeleteTpl() {
    if (!pendingDeleteTpl) return;
    try {
      const res = await fetch(`/api/comercial/templates/${pendingDeleteTpl.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      notify('Template removido', 'success');
      setPendingDeleteTpl(null);
      loadTemplates();
    } catch (err) { notify(err.message, 'error'); }
  }

  if (loading) {
    return (
      <DashboardLayout activeTab="settings/comercial">
        <div style={{ padding: 48, color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} /> Carregando...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="settings/comercial">
      <div className={styles.page} style={{ maxWidth: 880 }}>
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <h1 className="page-title">Config. Comercial</h1>
            <p className="page-subtitle">Ajustes do módulo Comercial — TTLs, notificações, templates de mensagem.</p>
          </div>
        </div>

        {/* ── Limites & TTL ── */}
        <div className="glass-card" style={{ padding: 22, marginBottom: 18 }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 14 }}>
            Limites & validade
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Validade listas (dias)</label>
              <input className="sigma-input" type="number" min="1" max="60"
                     value={settings.comercial_list_ttl_days}
                     onChange={e => setField('comercial_list_ttl_days', Number(e.target.value))} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Validade propostas (dias)</label>
              <input className="sigma-input" type="number" min="1" max="60"
                     value={settings.comercial_proposal_ttl_days}
                     onChange={e => setField('comercial_proposal_ttl_days', Number(e.target.value))} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Captações Apify/dia</label>
              <input className="sigma-input" type="number" min="1" max="100"
                     value={settings.comercial_max_jobs_per_day}
                     onChange={e => setField('comercial_max_jobs_per_day', Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* ── Notificações ── */}
        <div className="glass-card" style={{ padding: 22, marginBottom: 18 }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 14 }}>
            Notificações
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ToggleRow
              label="Quando proposta é aberta pela primeira vez"
              checked={settings.comercial_notify_proposal_viewed}
              onChange={v => setField('comercial_notify_proposal_viewed', v)}
            />
            <ToggleRow
              label="Quando lead é fechado (ganho)"
              checked={settings.comercial_notify_lead_won}
              onChange={v => setField('comercial_notify_lead_won', v)}
            />
            <ToggleRow
              label="Quando análise IA é concluída"
              checked={settings.comercial_notify_analysis_done}
              onChange={v => setField('comercial_notify_analysis_done', v)}
            />
            <ToggleRow
              label="Proposta expira em 24h (cron diário)"
              checked={settings.comercial_notify_proposal_expiring}
              onChange={v => setField('comercial_notify_proposal_expiring', v)}
            />
          </div>
        </div>

        {/* ── Integrações ── */}
        <div className="glass-card" style={{ padding: 22, marginBottom: 18 }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 14 }}>
            Integrações
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <StatusBox
              label="Apify (Google Maps)"
              ok={apifyOk}
              onMsg="✓ APIFY_TOKEN configurado"
              offMsg="✕ APIFY_TOKEN não configurado — captação Apify não funcionará"
            />
            <StatusBox
              label="Z-API (WhatsApp)"
              ok={zapiOk}
              onMsg="✓ Z-API conectada"
              offMsg="✕ Z-API não configurada — envio de WhatsApp falhará"
            />
          </div>
        </div>

        {/* ── Templates de mensagem ── */}
        <div className="glass-card" style={{ padding: 22, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Templates de mensagem
            </h3>
            <button className="sigma-btn-primary" style={{ padding: '6px 12px', fontSize: '0.7rem' }} onClick={() => { setEditingTpl(null); setShowTplModal(true); }}>
              + Novo template
            </button>
          </div>

          <div className={templateStyles.crudList}>
            {templates.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                Nenhum template ainda — recarregue a página pra criar os defaults.
              </div>
            )}
            {templates.map(t => (
              <div key={t.id} className={templateStyles.crudItem}>
                <div className={templateStyles.crudInfo}>
                  <div className="name">{t.name}{t.is_default && <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--text-muted)' }}>· padrão</span>}</div>
                  <div className="meta">
                    <span className={templateStyles.categoryBadge}>{t.category}</span>
                    <span>· {t.channel}</span>
                  </div>
                </div>
                <div className={templateStyles.crudActions}>
                  <button className={templateStyles.iconBtn} onClick={() => { setEditingTpl(t); setShowTplModal(true); }}>Editar</button>
                  <button className={`${templateStyles.iconBtn} ${templateStyles.iconBtnDanger}`} onClick={() => deleteTpl(t)}>Deletar</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="sigma-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>

        {showTplModal && (
          <TemplateModal
            template={editingTpl}
            onClose={() => setShowTplModal(false)}
            onSaved={() => { setShowTplModal(false); loadTemplates(); }}
          />
        )}

        <ConfirmModal
          open={!!pendingDeleteTpl}
          onClose={() => setPendingDeleteTpl(null)}
          onConfirm={confirmDeleteTpl}
          variant="danger"
          title="Deletar template?"
          warningTitle="Tem certeza que deseja excluir"
          warningHighlight={pendingDeleteTpl?.name || ''}
          warningText="Mensagens já enviadas com este template permanecem no histórico, mas o template não estará disponível pra novos envios."
          confirmLabel="Excluir definitivamente"
          cancelLabel="Cancelar"
        />
      </div>
    </DashboardLayout>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.86rem',
        color: 'var(--text-primary)',
      }}
    >
      <input
        type="checkbox"
        checked={!!checked}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: 'var(--brand-500)' }}
      />
      {label}
    </label>
  );
}

function StatusBox({ label, ok, onMsg, offMsg }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        padding: '10px 14px',
        borderRadius: 6,
        background: ok ? 'rgba(34,197,94,0.06)' : 'rgba(255,0,51,0.06)',
        border: `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(255,0,51,0.25)'}`,
        color: ok ? 'var(--success)' : 'var(--brand-400)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.76rem',
      }}>
        {ok ? onMsg : offMsg}
      </div>
    </div>
  );
}

function TemplateModal({ template, onClose, onSaved }) {
  const { notify } = useNotification();
  const [form, setForm] = useState({
    name:     template?.name     || '',
    category: template?.category || 'custom',
    channel:  template?.channel  || 'whatsapp',
    content:  template?.content  || '',
    sort_order: template?.sort_order || 999,
    active:   template?.active !== false,
  });
  const [submitting, setSubmitting] = useState(false);

  function setField(k, v) { setForm(s => ({ ...s, [k]: v })); }
  function insertVar(key) { setField('content', (form.content || '') + `{${key}}`); }

  async function submit() {
    if (!form.name.trim() || !form.content.trim()) {
      notify('Nome e conteúdo obrigatórios', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const url = template ? `/api/comercial/templates/${template.id}` : '/api/comercial/templates';
      const method = template ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      notify(template ? 'Template atualizado' : 'Template criado', 'success');
      onSaved?.();
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
      iconVariant={template ? 'edit' : 'create'}
      title={template ? 'Editar template' : 'Novo template'}
      description="Use {variável} no texto — clique nos chips abaixo pra inserir no cursor. As variáveis são resolvidas no momento do envio."
      size="md"
      primaryLabel={submitting ? 'Salvando...' : (template ? 'Salvar alterações' : 'Criar template')}
      onPrimary={submit}
      primaryLoading={submitting}
      secondaryLabel="Cancelar"
    >
      <Field label="Nome do template" required>
        <Input
          autoFocus
          value={form.name}
          placeholder="Ex: Cold — Primeiro contato"
          onChange={e => setField('name', e.target.value)}
        />
      </Field>

      <Row2>
        <Field label="Categoria">
          <Select value={form.category} onChange={e => setField('category', e.target.value)}>
            <option value="cold">Cold (primeiro contato)</option>
            <option value="followup1">Follow-up 1</option>
            <option value="followup2">Follow-up 2</option>
            <option value="reactivation">Reativação</option>
            <option value="custom">Custom</option>
          </Select>
        </Field>
        <Field label="Canal">
          <Select value={form.channel} onChange={e => setField('channel', e.target.value)}>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">E-mail (Sprint futuro)</option>
            <option value="call_script">Call script</option>
          </Select>
        </Field>
      </Row2>

      <Field label="Conteúdo" required hint="Variáveis disponíveis abaixo — clique pra inserir">
        <Textarea
          rows={8}
          value={form.content}
          placeholder="Olá {nome_contato}, aqui é {nome_responsavel} da SIGMA..."
          onChange={e => setField('content', e.target.value)}
          style={{ minHeight: 140 }}
        />
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {VAR_LIST.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => insertVar(v)}
              className={templateStyles.varChip}
              style={{ cursor: 'pointer', border: '1px solid rgba(255, 0, 51, 0.18)' }}
            >
              {`{${v}}`}
            </button>
          ))}
        </div>
      </Field>
    </SystemModal>
  );
}
