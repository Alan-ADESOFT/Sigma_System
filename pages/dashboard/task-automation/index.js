import DashboardLayout from '../../../components/DashboardLayout';
import styles from '../../../assets/style/taskAutomation.module.css';
import { useNotification } from '../../../context/NotificationContext';
import { useAuth } from '../../../hooks/useAuth';
import { useState, useEffect, useCallback } from 'react';

const EMPTY_TASK = { title: '', priority: 'normal', assigned_to: '', subtasks: [] };

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

function IconLayers({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function IconList({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
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

  /* ── Subtask helpers (within template task) ── */
  function addSubtaskToTemplate(taskIdx) {
    setForm(prev => {
      const tasks = [...prev.tasks_json];
      const subs = Array.isArray(tasks[taskIdx].subtasks) ? [...tasks[taskIdx].subtasks] : [];
      subs.push({ id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: '', done: false });
      tasks[taskIdx] = { ...tasks[taskIdx], subtasks: subs };
      return { ...prev, tasks_json: tasks };
    });
  }

  function updateSubtaskInTemplate(taskIdx, subIdx, value) {
    setForm(prev => {
      const tasks = [...prev.tasks_json];
      const subs = [...(tasks[taskIdx].subtasks || [])];
      subs[subIdx] = { ...subs[subIdx], title: value };
      tasks[taskIdx] = { ...tasks[taskIdx], subtasks: subs };
      return { ...prev, tasks_json: tasks };
    });
  }

  function removeSubtaskFromTemplate(taskIdx, subIdx) {
    setForm(prev => {
      const tasks = [...prev.tasks_json];
      const subs = (tasks[taskIdx].subtasks || []).filter((_, i) => i !== subIdx);
      tasks[taskIdx] = { ...tasks[taskIdx], subtasks: subs };
      return { ...prev, tasks_json: tasks };
    });
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
            <h1 className="page-title">Automação</h1>
            <p className="page-subtitle">Templates de tarefas por serviço ou novo cliente</p>
          </div>
          <button className="sigma-btn-primary" onClick={openCreate}>
            <IconPlus size={14} />
            Novo Template
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════
            TEMPLATES POR SERVIÇO
        ══════════════════════════════════════════════════════ */}
        <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 24 }}>
          <div className={styles.sectionTitleRow}>
            <span className={styles.sectionDot} />
            <span className={styles.sectionTitleText}>Templates por serviço</span>
            <span className={styles.sectionLine} />
          </div>

          {templates.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}><IconTemplate size={36} /></div>
              <div className={styles.emptyText}>Nenhum template criado ainda</div>
            </div>
          ) : (
            <div className={styles.templateGrid}>
              {templates.map(t => {
                const tasks = typeof t.tasks_json === 'string' ? JSON.parse(t.tasks_json) : (t.tasks_json || []);
                return (
                  <div
                    key={t.id}
                    className={styles.templateCard}
                    onClick={() => openEdit(t)}
                  >
                    <div className={styles.templateCardInner}>
                      <div className={styles.templateNameBox}>
                        <div className={styles.templateIcon}>
                          <IconLayers size={16} />
                        </div>
                        <div className={styles.templateName}>{t.name}</div>
                      </div>
                      <span className={`${styles.activeBadge} ${t.is_active ? styles.activeBadgeOn : styles.activeBadgeOff}`}>
                        {t.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    <div className={styles.triggerBadge}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                      {TRIGGER_LABELS[t.trigger] || t.trigger}
                    </div>

                    <div className={styles.taskCount}>
                      <span className={styles.taskCountIcon}><IconList size={12} /></span>
                      {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''} configurada{tasks.length !== 1 ? 's' : ''}
                    </div>

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
            APLICAR TEMPLATE
        ══════════════════════════════════════════════════════ */}
        <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 24 }}>
          <div className={styles.sectionTitleRow}>
            <span className={styles.sectionDot} />
            <span className={styles.sectionTitleText}>Aplicar template</span>
            <span className={styles.sectionLine} />
          </div>

          <div className={styles.applyHint}>
            Selecione um template e o cliente — todas as tarefas serão criadas instantaneamente.
          </div>

          <div className={styles.applyRow}>
            <div className={styles.applyGroup}>
              <label className={styles.applyLabel}>
                Template <span className={styles.required}>*</span>
              </label>
              <select
                className={styles.modalSelect}
                value={applyTemplateId}
                onChange={e => setApplyTemplateId(e.target.value)}
              >
                <option value="">Selecione um template...</option>
                {templates.filter(t => t.is_active).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.applyGroup}>
              <label className={styles.applyLabel}>
                Cliente <span className={styles.required}>*</span>
              </label>
              <select
                className={styles.modalSelect}
                value={applyClientId}
                onChange={e => setApplyClientId(e.target.value)}
              >
                <option value="">Selecione um cliente...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
            </div>
            <button
              className="sigma-btn-primary"
              onClick={handleApply}
              disabled={applying || !applyTemplateId || !applyClientId}
              style={{ whiteSpace: 'nowrap', minHeight: 41 }}
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

              <div className={styles.modalHeader}>
                <div className={styles.headerTitleBox}>
                  <div className={styles.headerBadge}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="9" y1="13" x2="15" y2="13" />
                      <line x1="9" y1="17" x2="13" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <h2 className={styles.modalTitle}>
                      {editingId ? 'Editar Template' : 'Novo Template'}
                    </h2>
                    <div className={styles.modalSubtitle}>
                      {editingId
                        ? 'Atualize as tarefas e configurações deste template.'
                        : 'Crie um conjunto de tarefas reutilizável para clientes.'}
                    </div>
                  </div>
                </div>
                <button className={styles.modalCloseBtn} onClick={() => setShowModal(false)}>
                  <IconX size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* Nome + Trigger */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label style={LABEL}>
                      Nome do template <span className={styles.required}>*</span>
                    </label>
                    <input
                      className={styles.modalInput}
                      value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Ex: Onboarding Completo"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label style={LABEL}>
                      Trigger <span className={styles.required}>*</span>
                    </label>
                    <select
                      className={styles.modalSelect}
                      value={form.trigger}
                      onChange={e => setForm(p => ({ ...p, trigger: e.target.value }))}
                    >
                      <option value="new_client">Novo Cliente</option>
                      <option value="service:social_media">Serviço: Social Media</option>
                      <option value="service:trafego">Serviço: Tráfego</option>
                      <option value="service:branding">Serviço: Branding</option>
                      <option value="service:site">Serviço: Site</option>
                    </select>
                  </div>
                </div>

                {/* Toggle Ativo */}
                <div className={styles.toggleRow}>
                  <label style={{ ...LABEL, margin: 0 }}>Status</label>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${form.is_active ? styles.toggleSwitchActive : ''}`}
                    onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                  >
                    <div className={`${styles.toggleKnob} ${form.is_active ? styles.toggleKnobActive : ''}`} />
                  </button>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: form.is_active ? 'var(--success)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                    {form.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                {/* Tasks do template */}
                <div>
                  <label style={LABEL}>
                    Tarefas do template <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.taskList}>
                    {form.tasks_json.map((item, idx) => (
                      <div key={idx} className={styles.taskBlock}>
                        <div className={styles.taskBlockHeader}>
                          <span className={styles.taskNumber}>{String(idx + 1).padStart(2, '0')}</span>
                          <input
                            className={styles.taskInputTitle}
                            placeholder="Título da tarefa"
                            value={item.title}
                            onChange={e => updateTaskItem(idx, 'title', e.target.value)}
                          />
                          <select
                            className={styles.priorityChip}
                            value={item.priority}
                            onChange={e => updateTaskItem(idx, 'priority', e.target.value)}
                            title="Prioridade"
                          >
                            <option value="baixa">Baixa</option>
                            <option value="normal">Normal</option>
                            <option value="alta">Alta</option>
                            <option value="urgente">Urgente</option>
                          </select>
                          <button
                            type="button"
                            className={styles.removeBtn}
                            onClick={() => removeTaskItem(idx)}
                            title="Remover tarefa"
                          >
                            <IconX size={13} />
                          </button>
                        </div>

                        {/* Subtarefas */}
                        <div className={styles.subSection}>
                          <div className={styles.subSectionLabel}>
                            <span className={styles.subSectionLabelDot} />
                            Subtarefas
                          </div>

                          {(item.subtasks || []).map((sub, sIdx) => (
                            <div key={sIdx} className={styles.subRow}>
                              <span className={styles.subDot} />
                              <input
                                className={styles.subInput}
                                value={sub.title}
                                onChange={e => updateSubtaskInTemplate(idx, sIdx, e.target.value)}
                                placeholder="Descreva a subtarefa..."
                              />
                              <button
                                type="button"
                                className={styles.subRemoveBtn}
                                onClick={() => removeSubtaskFromTemplate(idx, sIdx)}
                                title="Remover"
                              >
                                <IconX size={10} />
                              </button>
                            </div>
                          ))}

                          <button
                            type="button"
                            className={styles.subAddBtn}
                            onClick={() => addSubtaskToTemplate(idx)}
                          >
                            <IconPlus size={9} /> Subtarefa
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="button" className={styles.addTaskBtn} onClick={addTaskItem}>
                      <IconPlus size={11} /> Adicionar Tarefa
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
