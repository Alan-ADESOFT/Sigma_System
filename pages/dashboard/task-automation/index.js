import DashboardLayout from '../../../components/DashboardLayout';
import styles from '../../../assets/style/taskAutomation.module.css';
import { useNotification } from '../../../context/NotificationContext';
import { useAuth } from '../../../hooks/useAuth';
import { useState, useEffect, useCallback } from 'react';

const EMPTY_TASK = { title: '', priority: 'normal', due_days_offset: 1, assigned_to: '' };

const TRIGGER_LABELS = {
  new_client: 'Novo Cliente',
  'service:social_media': 'Social Media',
  'service:trafego': 'Trafego',
  'service:branding': 'Branding',
  'service:site': 'Site',
};

/* ── SVG icons (inline) ── */
function IconPlus({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconEdit({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}
function IconTrash({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function IconX({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconTemplate({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="14" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
    </svg>
  );
}
function IconPlay({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

/* ── Inline label style ── */
const LABEL = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.58rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
};

const SECTION_TITLE = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-primary)',
  marginBottom: 14,
};

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function TaskAutomationPage() {
  const { user, loading: authLoading } = useAuth();
  const { notify } = useNotification();

  const [templates, setTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Modal state */
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '', trigger: 'new_client', tasks_json: [{ ...EMPTY_TASK }], is_active: true,
  });
  const [saving, setSaving] = useState(false);

  /* Apply state */
  const [applyTemplateId, setApplyTemplateId] = useState('');
  const [applyClientId, setApplyClientId] = useState('');
  const [applying, setApplying] = useState(false);

  /* ── Data fetch ── */
  const fetchData = useCallback(async () => {
    try {
      const [tRes, cRes, uRes] = await Promise.all([
        fetch('/api/task-templates'),
        fetch('/api/clients'),
        fetch('/api/tasks/users-search'),
      ]);
      const tData = await tRes.json();
      const cData = await cRes.json();
      const uData = await uRes.json();
      if (tData.success) setTemplates(tData.templates || []);
      if (cData.success) setClients(cData.clients || []);
      if (uData.success) setUsers(uData.users || []);
    } catch (err) {
      notify('Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Modal handlers ── */
  function openCreate() {
    setEditingId(null);
    setForm({ name: '', trigger: 'new_client', tasks_json: [{ ...EMPTY_TASK }], is_active: true });
    setShowModal(true);
  }

  function openEdit(t) {
    setEditingId(t.id);
    const tasks = typeof t.tasks_json === 'string' ? JSON.parse(t.tasks_json) : (t.tasks_json || []);
    setForm({
      name: t.name,
      trigger: t.trigger,
      tasks_json: tasks.length ? tasks : [{ ...EMPTY_TASK }],
      is_active: t.is_active,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.trigger) {
      notify('Preencha nome e trigger', 'warning');
      return;
    }
    const filteredTasks = form.tasks_json.filter(t => t.title.trim());
    if (!filteredTasks.length) {
      notify('Adicione ao menos uma task', 'warning');
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/task-templates/${editingId}` : '/api/task-templates';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tasks_json: filteredTasks }),
      });
      const data = await res.json();
      if (data.success) {
        notify(editingId ? 'Template atualizado' : 'Template criado', 'success');
        setShowModal(false);
        fetchData();
      } else {
        notify(data.error || 'Erro ao salvar', 'error');
      }
    } catch {
      notify('Erro ao salvar template', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este template?')) return;
    try {
      const res = await fetch(`/api/task-templates/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        notify('Template excluido', 'success');
        fetchData();
      } else {
        notify(data.error || 'Erro', 'error');
      }
    } catch {
      notify('Erro ao excluir', 'error');
    }
  }

  async function handleApply() {
    if (!applyTemplateId || !applyClientId) {
      notify('Selecione template e cliente', 'warning');
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/task-templates/${applyTemplateId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: applyClientId }),
      });
      const data = await res.json();
      if (data.success) {
        notify(`${data.count} tasks criadas com sucesso`, 'success');
        setApplyTemplateId('');
        setApplyClientId('');
      } else {
        notify(data.error || 'Erro', 'error');
      }
    } catch {
      notify('Erro ao aplicar template', 'error');
    } finally {
      setApplying(false);
    }
  }

  /* ── Task item helpers ── */
  function updateTaskItem(idx, field, value) {
    setForm(prev => {
      const tasks = [...prev.tasks_json];
      tasks[idx] = { ...tasks[idx], [field]: value };
      return { ...prev, tasks_json: tasks };
    });
  }

  function addTaskItem() {
    setForm(prev => ({
      ...prev,
      tasks_json: [...prev.tasks_json, { ...EMPTY_TASK }],
    }));
  }

  function removeTaskItem(idx) {
    setForm(prev => ({
      ...prev,
      tasks_json: prev.tasks_json.filter((_, i) => i !== idx),
    }));
  }

  /* ── Loading ── */
  if (authLoading || loading) {
    return (
      <DashboardLayout activeTab="task-automation">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="task-automation">
      <div className={styles.pageContainer}>

        {/* ── Header ── */}
        <div className={styles.headerRow}>
          <div>
            <h1 className="page-title">Automacao</h1>
            <p className="page-subtitle">Templates de tasks por servico ou novo cliente</p>
          </div>
          <button className="sigma-btn-primary" onClick={openCreate}>
            <IconPlus size={14} />
            Novo Template
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════
            // TEMPLATES POR SERVICO
        ══════════════════════════════════════════════════════ */}
        <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={SECTION_TITLE}>// templates por servico</div>

          {templates.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}><IconTemplate size={36} /></div>
              <div className={styles.emptyText}>nenhum template criado ainda</div>
            </div>
          ) : (
            <div className={styles.templateGrid}>
              {templates.map(t => {
                const tasks = typeof t.tasks_json === 'string' ? JSON.parse(t.tasks_json) : (t.tasks_json || []);
                return (
                  <div
                    key={t.id}
                    className={`glass-card glass-card-hover ${styles.templateCard}`}
                    onClick={() => openEdit(t)}
                  >
                    <div className={styles.templateCardInner}>
                      <div className={styles.templateName}>{t.name}</div>
                      <span className={`${styles.activeBadge} ${t.is_active ? styles.activeBadgeOn : styles.activeBadgeOff}`}>
                        {t.is_active ? 'ativo' : 'inativo'}
                      </span>
                    </div>

                    <div className={styles.triggerBadge}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                      {TRIGGER_LABELS[t.trigger] || t.trigger}
                    </div>

                    <div className={styles.taskCount}>{tasks.length} task{tasks.length !== 1 ? 's' : ''} no template</div>

                    <div className={styles.templateActions}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={e => { e.stopPropagation(); openEdit(t); }}
                      >
                        <IconEdit size={11} /> Editar
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                      >
                        <IconTrash size={11} /> Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            // APLICAR TEMPLATE
        ══════════════════════════════════════════════════════ */}
        <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={SECTION_TITLE}>// aplicar template</div>

          <div className={styles.applyRow}>
            <div className={styles.applyGroup}>
              <label style={LABEL}>Template</label>
              <select
                className="sigma-input"
                value={applyTemplateId}
                onChange={e => setApplyTemplateId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {templates.filter(t => t.is_active).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.applyGroup}>
              <label style={LABEL}>Cliente</label>
              <select
                className="sigma-input"
                value={applyClientId}
                onChange={e => setApplyClientId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
            </div>
            <button
              className="sigma-btn-primary"
              onClick={handleApply}
              disabled={applying}
              style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
            >
              {applying ? (
                <div className="spinner" style={{ width: 14, height: 14 }} />
              ) : (
                <IconPlay size={12} />
              )}
              Aplicar Agora
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            MODAL — Novo / Editar Template
        ══════════════════════════════════════════════════════ */}
        {showModal && (
          <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>

              <div className={styles.modalTitle}>
                {editingId ? '// editar template' : '// novo template'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Nome + Trigger */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label style={LABEL}>Nome do Template</label>
                    <input
                      className="sigma-input"
                      value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Ex: Onboarding Completo"
                      style={{ padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label style={LABEL}>Trigger</label>
                    <select
                      className="sigma-input"
                      value={form.trigger}
                      onChange={e => setForm(p => ({ ...p, trigger: e.target.value }))}
                      style={{ padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                    >
                      <option value="new_client">Novo Cliente</option>
                      <option value="service:social_media">Servico: Social Media</option>
                      <option value="service:trafego">Servico: Trafego</option>
                      <option value="service:branding">Servico: Branding</option>
                      <option value="service:site">Servico: Site</option>
                    </select>
                  </div>
                </div>

                {/* Toggle Ativo */}
                <div className={styles.toggleRow}>
                  <label style={{ ...LABEL, margin: 0 }}>Ativo</label>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${form.is_active ? styles.toggleSwitchActive : ''}`}
                    onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                  >
                    <div className={`${styles.toggleKnob} ${form.is_active ? styles.toggleKnobActive : ''}`} />
                  </button>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: form.is_active ? 'var(--success)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {form.is_active ? 'ativo' : 'inativo'}
                  </span>
                </div>

                {/* Tasks */}
                <div>
                  <label style={LABEL}>Tasks do Template</label>
                  <div className={styles.taskList}>
                    {form.tasks_json.map((item, idx) => (
                      <div key={idx} className={styles.taskItem}>
                        <input
                          className="sigma-input"
                          placeholder="Titulo da task"
                          value={item.title}
                          onChange={e => updateTaskItem(idx, 'title', e.target.value)}
                          style={{ padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                        />
                        <select
                          className="sigma-input"
                          value={item.priority}
                          onChange={e => updateTaskItem(idx, 'priority', e.target.value)}
                          style={{ padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                        >
                          <option value="baixa">Baixa</option>
                          <option value="normal">Normal</option>
                          <option value="alta">Alta</option>
                          <option value="urgente">Urgente</option>
                        </select>
                        <input
                          className="sigma-input"
                          type="number"
                          placeholder="Dias"
                          value={item.due_days_offset}
                          onChange={e => updateTaskItem(idx, 'due_days_offset', parseInt(e.target.value) || 1)}
                          min={1}
                          title="Prazo em dias apos aplicacao"
                          style={{ padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                        />
                        <button className={styles.removeBtn} onClick={() => removeTaskItem(idx)} title="Remover">
                          <IconX size={12} />
                        </button>
                      </div>
                    ))}
                    <button className={styles.addTaskBtn} onClick={addTaskItem}>
                      + Adicionar Task
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className={styles.modalFooter}>
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button className="sigma-btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
