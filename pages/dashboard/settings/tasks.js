/**
 * pages/dashboard/settings/tasks.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Config. Tarefas — 3 secoes:
 *   1. Categorias (CRUD via modal popup)
 *   2. Tarefas Recorrentes (CRUD via modal com subtarefas + obrigatorias)
 *   3. Bot de Lembrete WhatsApp (mensagens pre-preenchidas, design clean)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import styles from '../../../assets/style/settingsTasks.module.css';
import { useNotification } from '../../../context/NotificationContext';
import { useAuth } from '../../../hooks/useAuth';

const DAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

const COLOR_PALETTE = [
  '#ff0033', '#f97316', '#facc15', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#a3a3a3', '#737373',
];

/* ── Mensagens default do bot (pre-preenchidas) ───────────────────────────── */

const DEFAULT_MORNING_MESSAGE = `🌅 *Bom dia, {nome}!*

Aqui está o seu dia organizado:

📋 *Suas tarefas de hoje:*
{tarefas}

📅 *Reuniões agendadas:*
{reunioes}

Vamos com tudo! 💪`;

const DEFAULT_OVERDUE_MESSAGE = `⚠️ *Atenção, {nome}*

Você tem *{count} tarefa(s) atrasada(s)* aguardando ação:

{tarefas}

Resolva ainda hoje para manter o ritmo. 🎯`;

/* ── SVG icons inline ── */

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
function IconX({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconPlus({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconRepeat({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function IconTag({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function IconCalendar({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconUser({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconCheck({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconMessage({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconBot({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}

/* ── Helpers ── */

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/* ════════════════════════════════════════════════════════════════════════ */

export default function SettingsTasksPage() {
  const { user, loading: authLoading } = useAuth();
  const { notify } = useNotification();

  /* ── State ── */
  const [categories, setCategories] = useState([]);
  const [recurrences, setRecurrences] = useState([]);
  const [botConfigs, setBotConfigs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Categoria modal */
  const [showCatModal, setShowCatModal] = useState(false);
  const [editCatId, setEditCatId] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', color: COLOR_PALETTE[0] });

  /* Templates de mensagens (globais por tenant) */
  const [templates, setTemplates] = useState({ morning: '', overdue: '' });
  const [templateDefaults, setTemplateDefaults] = useState({ morning: DEFAULT_MORNING_MESSAGE, overdue: DEFAULT_OVERDUE_MESSAGE });
  const [savingTemplates, setSavingTemplates] = useState(false);

  /* Recorrencia modal */
  const [showRecForm, setShowRecForm] = useState(false);
  const [editRecId, setEditRecId] = useState(null);
  const [recForm, setRecForm] = useState({
    title: '',
    priority: 'normal',
    category_id: '',
    assigned_to: '',
    frequency: 'weekly',
    weekday: 1,
    day_of_month: 1,
    is_active: true,
    subtasks: [],
    subtasks_required: false,
  });

  /* ── Fetch data ── */
  const fetchData = useCallback(async () => {
    try {
      const [catRes, recRes, botRes, usersRes, tplRes] = await Promise.all([
        fetch('/api/task-categories'),
        fetch('/api/task-recurrences'),
        fetch('/api/task-bot-config'),
        fetch('/api/tasks/users-search'),
        fetch('/api/settings/task-bot-templates'),
      ]);
      const catData = await catRes.json();
      const recData = await recRes.json();
      const botData = await botRes.json();
      const usersData = await usersRes.json();
      const tplData = await tplRes.json();
      if (catData.success) setCategories(catData.categories || []);
      if (recData.success) setRecurrences(recData.recurrences || []);
      if (botData.success) setBotConfigs(botData.configs || []);
      if (usersData.success) setUsers(usersData.users || []);
      if (tplData.success) {
        setTemplates(tplData.templates || { morning: '', overdue: '' });
        if (tplData.defaults) setTemplateDefaults(tplData.defaults);
      }
    } catch (err) {
      notify('Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  async function saveTemplates() {
    setSavingTemplates(true);
    try {
      const res = await fetch('/api/settings/task-bot-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templates),
      });
      const data = await res.json();
      if (data.success) {
        notify('Templates salvos', 'success');
      } else {
        notify(data.error || 'Erro ao salvar', 'error');
      }
    } catch {
      notify('Erro ao salvar templates', 'error');
    } finally {
      setSavingTemplates(false);
    }
  }

  function restoreDefault(field) {
    setTemplates((prev) => ({ ...prev, [field]: templateDefaults[field] }));
    notify('Mensagem restaurada para o padrão', 'info');
  }

  function insertTagInTemplate(field, tag) {
    setTemplates((prev) => ({
      ...prev,
      [field]: (prev[field] || '') + (prev[field] && !prev[field].endsWith(' ') ? ' ' : '') + tag,
    }));
  }

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ───────────────────────────────────────────────────────
     CATEGORIAS — CRUD via modal
  ─────────────────────────────────────────────────────── */
  function openCatModal(cat = null) {
    if (cat) {
      setEditCatId(cat.id);
      setCatForm({ name: cat.name, color: cat.color });
    } else {
      setEditCatId(null);
      setCatForm({ name: '', color: COLOR_PALETTE[0] });
    }
    setShowCatModal(true);
  }

  async function saveCategory() {
    if (!catForm.name.trim()) {
      notify('Informe o nome da categoria', 'warning');
      return;
    }
    try {
      const url = editCatId ? `/api/task-categories/${editCatId}` : '/api/task-categories';
      const method = editCatId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: catForm.name.trim(), color: catForm.color }),
      });
      const data = await res.json();
      if (data.success) {
        notify(editCatId ? 'Categoria atualizada' : 'Categoria criada', 'success');
        setShowCatModal(false);
        fetchData();
      } else {
        notify(data.error || 'Erro', 'error');
      }
    } catch {
      notify('Erro ao salvar categoria', 'error');
    }
  }

  async function deleteCategory(id) {
    if (!confirm('Excluir esta categoria?')) return;
    try {
      const res = await fetch(`/api/task-categories/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        notify('Categoria excluída', 'success');
        fetchData();
      }
    } catch {
      notify('Erro ao excluir', 'error');
    }
  }

  /* ───────────────────────────────────────────────────────
     RECORRENCIAS — CRUD
  ─────────────────────────────────────────────────────── */
  function openRecForm(rec = null) {
    if (rec) {
      setEditRecId(rec.id);
      setRecForm({
        title: rec.title || '',
        priority: rec.priority || 'normal',
        category_id: rec.category_id || '',
        assigned_to: rec.assigned_to || '',
        frequency: rec.frequency || 'weekly',
        weekday: rec.weekday ?? 1,
        day_of_month: rec.day_of_month ?? 1,
        is_active: rec.is_active !== false,
        subtasks: Array.isArray(rec.subtasks)
          ? rec.subtasks
          : (rec.subtasks ? JSON.parse(rec.subtasks) : []),
        subtasks_required: Boolean(rec.subtasks_required),
      });
    } else {
      setEditRecId(null);
      setRecForm({
        title: '',
        priority: 'normal',
        category_id: '',
        assigned_to: '',
        frequency: 'weekly',
        weekday: 1,
        day_of_month: 1,
        is_active: true,
        subtasks: [],
        subtasks_required: false,
      });
    }
    setShowRecForm(true);
  }

  async function saveRecurrence() {
    if (!recForm.title.trim()) {
      notify('Informe o título da tarefa recorrente', 'warning');
      return;
    }
    try {
      const cleanSubs = (recForm.subtasks || [])
        .filter((s) => s.title && s.title.trim())
        .map((s) => ({ id: s.id, title: s.title.trim(), done: !!s.done }));

      const url = editRecId ? `/api/task-recurrences/${editRecId}` : '/api/task-recurrences';
      const method = editRecId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...recForm, subtasks: cleanSubs }),
      });
      const data = await res.json();
      if (data.success) {
        notify(editRecId ? 'Recorrência atualizada' : 'Recorrência criada', 'success');
        setShowRecForm(false);
        fetchData();
      } else {
        notify(data.error || 'Erro', 'error');
      }
    } catch {
      notify('Erro ao salvar recorrência', 'error');
    }
  }

  async function deleteRecurrence(id) {
    if (!confirm('Excluir esta tarefa recorrente?')) return;
    try {
      const res = await fetch(`/api/task-recurrences/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        notify('Recorrência excluída', 'success');
        fetchData();
      }
    } catch {
      notify('Erro ao excluir', 'error');
    }
  }

  async function toggleRecurrence(rec) {
    try {
      const res = await fetch(`/api/task-recurrences/${rec.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !rec.is_active }),
      });
      const data = await res.json();
      if (data.success) fetchData();
    } catch {
      notify('Erro ao atualizar', 'error');
    }
  }

  /* ── Subtasks helpers no modal de recorrencia ── */
  function uidSub() {
    return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
  function addRecSubtask() {
    setRecForm((prev) => ({
      ...prev,
      subtasks: [...(prev.subtasks || []), { id: uidSub(), title: '', done: false }],
    }));
  }
  function updateRecSubtask(id, value) {
    setRecForm((prev) => ({
      ...prev,
      subtasks: (prev.subtasks || []).map((s) => (s.id === id ? { ...s, title: value } : s)),
    }));
  }
  function removeRecSubtask(id) {
    setRecForm((prev) => ({
      ...prev,
      subtasks: (prev.subtasks || []).filter((s) => s.id !== id),
    }));
  }

  /* ───────────────────────────────────────────────────────
     BOT — config CRUD
  ─────────────────────────────────────────────────────── */
  async function saveBotConfig(cfg) {
    try {
      const res = await fetch('/api/task-bot-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (data.success) {
        notify('Configuração salva', 'success');
        fetchData();
      } else {
        notify(data.error || 'Erro', 'error');
      }
    } catch {
      notify('Erro ao salvar', 'error');
    }
  }

  function updateBotField(userId, field, value) {
    setBotConfigs((prev) =>
      prev.map((c) => (c.user_id === userId ? { ...c, [field]: value } : c))
    );
  }

  function toggleBotDay(userId, day) {
    setBotConfigs((prev) =>
      prev.map((c) => {
        if (c.user_id !== userId) return c;
        const days = c.active_days || [];
        const newDays = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
        return { ...c, active_days: newDays };
      })
    );
  }

  function insertTagInMessage(userId, field, tag) {
    setBotConfigs((prev) =>
      prev.map((c) => {
        if (c.user_id !== userId) return c;
        const current = c[field] || '';
        return { ...c, [field]: current + (current.endsWith(' ') || current === '' ? '' : ' ') + tag };
      })
    );
  }

  /* Users without bot config */
  const configuredUserIds = new Set(botConfigs.map((c) => c.user_id));
  const unconfiguredUsers = users.filter((u) => !configuredUserIds.has(u.id));

  function addBotForUser(userId) {
    const u = users.find((x) => x.id === userId);
    setBotConfigs((prev) => [
      ...prev,
      {
        user_id: userId,
        user_name: u?.name || 'Usuário',
        phone: '',
        dispatch_time: '08:00',
        active_days: [1, 2, 3, 4, 5],
        message_morning: templates.morning || DEFAULT_MORNING_MESSAGE,
        message_overdue: templates.overdue || DEFAULT_OVERDUE_MESSAGE,
        is_active: false,
      },
    ]);
  }

  /* ── Loading ── */
  if (authLoading || loading) {
    return (
      <DashboardLayout activeTab="settings/tasks">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      </DashboardLayout>
    );
  }

  /* ── Render ── */
  return (
    <DashboardLayout activeTab="settings/tasks">
      <div className={styles.pageContainer}>

        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <h1 className="page-title">Config. Tarefas</h1>
            <p className="page-subtitle">Categorias, recorrências e bot de lembrete WhatsApp</p>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            CATEGORIAS
        ════════════════════════════════════════════════ */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.sectionDot} />
                <span className={styles.sectionTitleText}>Categorias de tarefas</span>
                <span className={styles.sectionLine} />
              </div>
              <div className={styles.sectionDescription}>
                Organize as tarefas por tipo de trabalho. Cada categoria recebe uma cor.
              </div>
            </div>
            <button className="sigma-btn-primary" onClick={() => openCatModal(null)}>
              <IconPlus size={12} /> Nova Categoria
            </button>
          </div>

          <div className={styles.categoryGrid}>
            {categories.length === 0 ? (
              <div className={styles.categoryEmpty}>nenhuma categoria criada ainda</div>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat.id}
                  className={styles.categoryCard}
                  style={{ '--cat-color': cat.color }}
                >
                  <div className={styles.categoryDot} style={{ background: cat.color, color: cat.color }} />
                  <span className={styles.categoryName}>{cat.name}</span>
                  <div className={styles.categoryActions}>
                    <button
                      className={styles.iconBtn}
                      onClick={() => openCatModal(cat)}
                      title="Editar"
                    >
                      <IconEdit size={12} />
                    </button>
                    <button
                      className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                      onClick={() => deleteCategory(cat.id)}
                      title="Excluir"
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            TAREFAS RECORRENTES
        ════════════════════════════════════════════════ */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.sectionDot} />
                <span className={styles.sectionTitleText}>Tarefas recorrentes</span>
                <span className={styles.sectionLine} />
              </div>
              <div className={styles.sectionDescription}>
                Tarefas que se repetem automaticamente — diárias, semanais ou mensais.
              </div>
            </div>
            <button className="sigma-btn-primary" onClick={() => openRecForm(null)}>
              <IconPlus size={12} /> Nova Recorrência
            </button>
          </div>

          {recurrences.length === 0 ? (
            <div className={styles.emptySection}>
              <div className={styles.emptySectionIcon}>
                <IconRepeat size={36} />
              </div>
              <div className={styles.emptySectionText}>nenhuma recorrência configurada</div>
            </div>
          ) : (
            <div className={styles.recurrenceList}>
              {recurrences.map((rec) => (
                <div
                  key={rec.id}
                  className={styles.recurrenceCard}
                  style={{ '--cat-color': rec.category_color || 'var(--brand-500)' }}
                >
                  <div className={styles.recurrenceIcon}>
                    <IconRepeat size={16} />
                  </div>
                  <div className={styles.recurrenceInfo}>
                    <div className={styles.recurrenceTitle}>{rec.title}</div>
                    <div className={styles.recurrenceMeta}>
                      <span className={styles.recurrenceMetaItem}>
                        <IconCalendar size={11} />
                        {rec.frequency === 'daily' && 'Diária'}
                        {rec.frequency === 'weekly' && `Toda ${DAYS.find((d) => {
                          const pgDow = d.value === 7 ? 0 : d.value;
                          return pgDow === rec.weekday;
                        })?.label || ''}`}
                        {rec.frequency === 'monthly' && `Dia ${rec.day_of_month} do mês`}
                      </span>
                      {rec.assigned_to_name && (
                        <span className={styles.recurrenceMetaItem}>
                          <IconUser size={11} />
                          {rec.assigned_to_name}
                        </span>
                      )}
                      {rec.category_name && (
                        <span
                          className={styles.recurrenceMiniBadge}
                          style={{
                            background: `${rec.category_color || '#525252'}18`,
                            color: rec.category_color || '#525252',
                            border: `1px solid ${rec.category_color || '#525252'}40`,
                          }}
                        >
                          {rec.category_name}
                        </span>
                      )}
                      {rec.subtasks_required && (
                        <span className={styles.recurrenceMetaItem} style={{ color: 'var(--brand-500)' }}>
                          subtarefas obrigatórias
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${rec.is_active ? styles.toggleSwitchActive : ''}`}
                    onClick={() => toggleRecurrence(rec)}
                  >
                    <div className={`${styles.toggleKnob} ${rec.is_active ? styles.toggleKnobActive : ''}`} />
                  </button>

                  <button className={styles.iconBtn} onClick={() => openRecForm(rec)} title="Editar">
                    <IconEdit size={12} />
                  </button>
                  <button
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    onClick={() => deleteRecurrence(rec.id)}
                    title="Excluir"
                  >
                    <IconTrash size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════
            BOT DE LEMBRETE WHATSAPP
        ════════════════════════════════════════════════ */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.sectionDot} />
                <span className={styles.sectionTitleText}>Bot de lembrete WhatsApp</span>
                <span className={styles.sectionLine} />
              </div>
              <div className={styles.sectionDescription}>
                Cada usuário recebe um lembrete diário com suas tarefas. As mensagens já vêm prontas — só edite se quiser personalizar.
              </div>
            </div>
          </div>

          {botConfigs.length === 0 && unconfiguredUsers.length === 0 ? (
            <div className={styles.emptySection}>
              <div className={styles.emptySectionIcon}>
                <IconBot size={36} />
              </div>
              <div className={styles.emptySectionText}>nenhum usuário cadastrado</div>
            </div>
          ) : (
            <div className={styles.botGrid}>
              {botConfigs.map((cfg) => (
                <div key={cfg.user_id} className={styles.botCard}>

                  {/* Header */}
                  <div className={styles.botCardHeader}>
                    <div className={styles.botAvatar}>{getInitials(cfg.user_name)}</div>
                    <div className={styles.botUserInfo}>
                      <div className={styles.botUserName}>{cfg.user_name || 'Usuário'}</div>
                      <div className={`${styles.botUserStatus} ${cfg.is_active ? styles.botUserStatusActive : ''}`}>
                        {cfg.is_active ? '● Ativo' : '○ Inativo'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`${styles.toggleSwitch} ${cfg.is_active ? styles.toggleSwitchActive : ''}`}
                      onClick={() => updateBotField(cfg.user_id, 'is_active', !cfg.is_active)}
                    >
                      <div className={`${styles.toggleKnob} ${cfg.is_active ? styles.toggleKnobActive : ''}`} />
                    </button>
                  </div>

                  {/* Configuracao basica */}
                  <div className={styles.botSection}>
                    <div className={styles.botSectionLabel}>
                      <span className={styles.botSectionLabelDot} />
                      Configuração
                    </div>
                    <div className={styles.fieldRow}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.modalLabel}>
                          Telefone <span className={styles.required}>*</span>
                        </label>
                        <input
                          className={styles.modalInput}
                          value={cfg.phone || ''}
                          onChange={(e) => updateBotField(cfg.user_id, 'phone', e.target.value)}
                          placeholder="5511999999999"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.modalLabel}>
                          Horário <span className={styles.required}>*</span>
                        </label>
                        <input
                          className={styles.modalInput}
                          type="time"
                          value={cfg.dispatch_time || '08:00'}
                          onChange={(e) => updateBotField(cfg.user_id, 'dispatch_time', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.modalLabel}>Dias ativos</label>
                      <div className={styles.daysRow}>
                        {DAYS.map((d) => (
                          <button
                            key={d.value}
                            type="button"
                            className={`${styles.dayChip} ${(cfg.active_days || []).includes(d.value) ? styles.dayChipActive : ''}`}
                            onClick={() => toggleBotDay(cfg.user_id, d.value)}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Mensagem da manha */}
                  <div className={styles.botSection}>
                    <div className={styles.botSectionLabel}>
                      <span className={styles.botSectionLabelDot} />
                      Mensagem da manhã
                    </div>
                    <div className={styles.messageBox}>
                      <textarea
                        className={styles.messageTextarea}
                        value={cfg.message_morning || ''}
                        onChange={(e) => updateBotField(cfg.user_id, 'message_morning', e.target.value)}
                        placeholder="Mensagem que será enviada todas as manhãs..."
                      />
                      <div className={styles.messageTagsRow}>
                        {['{nome}', '{tarefas}', '{reunioes}', '{count}'].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={styles.messageTag}
                            onClick={() => insertTagInMessage(cfg.user_id, 'message_morning', tag)}
                            title={`Inserir ${tag}`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.messageHint}>
                      Use as variáveis acima — elas serão substituídas pelos dados reais ao enviar.
                    </div>
                  </div>

                  {/* Mensagem de tasks atrasadas */}
                  <div className={styles.botSection}>
                    <div className={styles.botSectionLabel}>
                      <span className={styles.botSectionLabelDot} />
                      Mensagem de tarefas atrasadas
                    </div>
                    <div className={styles.messageBox}>
                      <textarea
                        className={styles.messageTextarea}
                        value={cfg.message_overdue || ''}
                        onChange={(e) => updateBotField(cfg.user_id, 'message_overdue', e.target.value)}
                        placeholder="Mensagem para tarefas vencidas..."
                      />
                      <div className={styles.messageTagsRow}>
                        {['{nome}', '{tarefas}', '{count}'].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={styles.messageTag}
                            onClick={() => insertTagInMessage(cfg.user_id, 'message_overdue', tag)}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Save */}
                  <button
                    className={`sigma-btn-primary ${styles.botSaveBtn}`}
                    onClick={() => saveBotConfig(cfg)}
                  >
                    <IconCheck size={12} /> Salvar Configuração
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add user */}
          {unconfiguredUsers.length > 0 && (
            <div className={styles.addUserRow}>
              <select
                className={styles.modalSelect}
                style={{ maxWidth: 280 }}
                id="addBotUser"
                defaultValue=""
              >
                <option value="">Adicionar usuário ao bot...</option>
                {unconfiguredUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const sel = document.getElementById('addBotUser');
                  if (sel.value) {
                    addBotForUser(sel.value);
                    sel.value = '';
                  }
                }}
              >
                <IconPlus size={12} /> Adicionar
              </button>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════
            TEMPLATES DE MENSAGENS (globais)
        ════════════════════════════════════════════════ */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.sectionDot} />
                <span className={styles.sectionTitleText}>Templates de mensagens</span>
                <span className={styles.sectionLine} />
              </div>
              <div className={styles.sectionDescription}>
                Edite os textos padrão usados ao adicionar novos usuários ao bot. As mensagens já vêm prontas — modifique aqui se quiser personalizar para todo o time.
              </div>
            </div>
            <button
              className="sigma-btn-primary"
              onClick={saveTemplates}
              disabled={savingTemplates}
            >
              <IconCheck size={12} /> {savingTemplates ? 'Salvando...' : 'Salvar Templates'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Template manha */}
            <div className={styles.botSection}>
              <div className={styles.botSectionLabel}>
                <span className={styles.botSectionLabelDot} />
                Template — mensagem da manhã
                <button
                  type="button"
                  onClick={() => restoreDefault('morning')}
                  style={{
                    marginLeft: 'auto',
                    padding: '3px 10px',
                    background: 'transparent',
                    border: '1px solid var(--border-default)',
                    borderRadius: 4,
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.5rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,0,51,0.4)'; e.currentTarget.style.color = 'var(--brand-500)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  Restaurar padrão
                </button>
              </div>
              <div className={styles.messageBox}>
                <textarea
                  className={styles.messageTextarea}
                  value={templates.morning}
                  onChange={(e) => setTemplates((p) => ({ ...p, morning: e.target.value }))}
                  placeholder="Mensagem padrão da manhã..."
                />
                <div className={styles.messageTagsRow}>
                  {['{nome}', '{tarefas}', '{reunioes}', '{count}'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={styles.messageTag}
                      onClick={() => insertTagInTemplate('morning', tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Template tarefas atrasadas */}
            <div className={styles.botSection}>
              <div className={styles.botSectionLabel}>
                <span className={styles.botSectionLabelDot} />
                Template — tarefas atrasadas
                <button
                  type="button"
                  onClick={() => restoreDefault('overdue')}
                  style={{
                    marginLeft: 'auto',
                    padding: '3px 10px',
                    background: 'transparent',
                    border: '1px solid var(--border-default)',
                    borderRadius: 4,
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.5rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,0,51,0.4)'; e.currentTarget.style.color = 'var(--brand-500)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  Restaurar padrão
                </button>
              </div>
              <div className={styles.messageBox}>
                <textarea
                  className={styles.messageTextarea}
                  value={templates.overdue}
                  onChange={(e) => setTemplates((p) => ({ ...p, overdue: e.target.value }))}
                  placeholder="Mensagem padrão para tarefas atrasadas..."
                />
                <div className={styles.messageTagsRow}>
                  {['{nome}', '{tarefas}', '{count}'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={styles.messageTag}
                      onClick={() => insertTagInTemplate('overdue', tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.messageHint}>
                Estes templates serão usados como ponto de partida ao adicionar um novo usuário ao bot. Cada usuário ainda pode personalizar individualmente.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          MODAL — CATEGORIA
      ════════════════════════════════════════════════ */}
      {showCatModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCatModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderTitleBox}>
                <div className={styles.modalHeaderBadge}>
                  <IconTag />
                </div>
                <div>
                  <h2 className={styles.modalTitle}>
                    {editCatId ? 'Editar Categoria' : 'Nova Categoria'}
                  </h2>
                  <div className={styles.modalSubtitle}>
                    Escolha um nome e uma cor para identificar visualmente.
                  </div>
                </div>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setShowCatModal(false)}>
                <IconX />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div>
                <label className={styles.modalLabel}>
                  Nome <span className={styles.required}>*</span>
                </label>
                <input
                  className={styles.modalInput}
                  value={catForm.name}
                  onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Social Media"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && saveCategory()}
                />
              </div>

              <div>
                <label className={styles.modalLabel}>
                  Cor <span className={styles.required}>*</span>
                </label>
                <div className={styles.colorPickerRow}>
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`${styles.colorSwatch} ${catForm.color === color ? styles.colorSwatchActive : ''}`}
                      style={{ background: color, color }}
                      onClick={() => setCatForm((p) => ({ ...p, color }))}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className={styles.modalLabel}>Pré-visualização</label>
                <div
                  className={styles.categoryCard}
                  style={{ '--cat-color': catForm.color, marginTop: 4 }}
                >
                  <div className={styles.categoryDot} style={{ background: catForm.color, color: catForm.color }} />
                  <span className={styles.categoryName}>{catForm.name || 'Nome da categoria'}</span>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className="btn btn-secondary" onClick={() => setShowCatModal(false)}>
                Cancelar
              </button>
              <button className="sigma-btn-primary" onClick={saveCategory}>
                {editCatId ? 'Salvar' : 'Criar Categoria'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          MODAL — RECORRENCIA
      ════════════════════════════════════════════════ */}
      {showRecForm && (
        <div className={styles.modalOverlay} onClick={() => setShowRecForm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderTitleBox}>
                <div className={styles.modalHeaderBadge}>
                  <IconRepeat />
                </div>
                <div>
                  <h2 className={styles.modalTitle}>
                    {editRecId ? 'Editar Recorrência' : 'Nova Recorrência'}
                  </h2>
                  <div className={styles.modalSubtitle}>
                    Configure uma tarefa que se repete automaticamente.
                  </div>
                </div>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setShowRecForm(false)}>
                <IconX />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div>
                <label className={styles.modalLabel}>
                  Título <span className={styles.required}>*</span>
                </label>
                <input
                  className={styles.modalInput}
                  value={recForm.title}
                  onChange={(e) => setRecForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Ex: Reunião semanal de status"
                  autoFocus
                />
              </div>

              <div className={styles.modalRow2}>
                <div>
                  <label className={styles.modalLabel}>
                    Prioridade <span className={styles.required}>*</span>
                  </label>
                  <select
                    className={styles.modalSelect}
                    value={recForm.priority}
                    onChange={(e) => setRecForm((p) => ({ ...p, priority: e.target.value }))}
                  >
                    <option value="baixa">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className={styles.modalLabel}>Categoria</label>
                  <select
                    className={styles.modalSelect}
                    value={recForm.category_id}
                    onChange={(e) => setRecForm((p) => ({ ...p, category_id: e.target.value }))}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={styles.modalLabel}>Responsável</label>
                <select
                  className={styles.modalSelect}
                  value={recForm.assigned_to}
                  onChange={(e) => setRecForm((p) => ({ ...p, assigned_to: e.target.value }))}
                >
                  <option value="">Sem responsável</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={styles.modalLabel}>
                  Frequência <span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.modalSelect}
                  value={recForm.frequency}
                  onChange={(e) => setRecForm((p) => ({ ...p, frequency: e.target.value }))}
                >
                  <option value="daily">Diária</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </div>

              {recForm.frequency === 'weekly' && (
                <div>
                  <label className={styles.modalLabel}>
                    Dia da semana <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.daysRow}>
                    {DAYS.map((d) => {
                      const pgDow = d.value === 7 ? 0 : d.value;
                      return (
                        <button
                          key={d.value}
                          type="button"
                          className={`${styles.dayChip} ${recForm.weekday === pgDow ? styles.dayChipActive : ''}`}
                          onClick={() => setRecForm((p) => ({ ...p, weekday: pgDow }))}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {recForm.frequency === 'monthly' && (
                <div>
                  <label className={styles.modalLabel}>
                    Dia do mês <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className={styles.modalInput}
                    value={recForm.day_of_month}
                    onChange={(e) => setRecForm((p) => ({ ...p, day_of_month: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              )}

              {/* Subtarefas */}
              <div className={styles.subSection}>
                <div className={styles.subSectionHeader}>
                  <label className={styles.modalLabel} style={{ marginBottom: 0 }}>
                    Subtarefas
                  </label>
                  <div className={styles.subSectionRequiredRow}>
                    <span className={styles.subSectionRequiredLabel}>Obrigatórias</span>
                    <button
                      type="button"
                      className={`${styles.toggleSwitch} ${recForm.subtasks_required ? styles.toggleSwitchActive : ''}`}
                      onClick={() => setRecForm((p) => ({ ...p, subtasks_required: !p.subtasks_required }))}
                      title="Se ativo, todas as subtarefas precisam estar concluídas para finalizar a tarefa"
                    >
                      <div className={`${styles.toggleKnob} ${recForm.subtasks_required ? styles.toggleKnobActive : ''}`} />
                    </button>
                  </div>
                </div>

                {(recForm.subtasks || []).length > 0 && (
                  <div className={styles.subList}>
                    {recForm.subtasks.map((s) => (
                      <div key={s.id} className={styles.subRow}>
                        <span className={styles.subDot} />
                        <input
                          className={styles.subInput}
                          value={s.title}
                          onChange={(e) => updateRecSubtask(s.id, e.target.value)}
                          placeholder="Descreva a subtarefa..."
                        />
                        <button
                          type="button"
                          className={styles.subRemove}
                          onClick={() => removeRecSubtask(s.id)}
                        >
                          <IconX size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button type="button" className={styles.subAddBtn} onClick={addRecSubtask}>
                  <IconPlus size={9} /> Subtarefa
                </button>
              </div>

              <div className={styles.modalRow2}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={styles.modalLabel} style={{ marginBottom: 0 }}>Status</span>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${recForm.is_active ? styles.toggleSwitchActive : ''}`}
                    onClick={() => setRecForm((p) => ({ ...p, is_active: !p.is_active }))}
                  >
                    <div className={`${styles.toggleKnob} ${recForm.is_active ? styles.toggleKnobActive : ''}`} />
                  </button>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6rem',
                    color: recForm.is_active ? 'var(--success)' : 'var(--text-muted)',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}>
                    {recForm.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className="btn btn-secondary" onClick={() => setShowRecForm(false)}>
                Cancelar
              </button>
              <button className="sigma-btn-primary" onClick={saveRecurrence}>
                {editRecId ? 'Salvar' : 'Criar Recorrência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
