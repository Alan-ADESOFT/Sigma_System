import DashboardLayout from '../../../components/DashboardLayout';
import styles from '../../../assets/style/settingsTasks.module.css';
import { useNotification } from '../../../context/NotificationContext';
import { useAuth } from '../../../hooks/useAuth';
import { useState, useEffect, useCallback } from 'react';

const DAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sab' },
  { value: 7, label: 'Dom' },
];

/* ── SVG icons (inline) ── */
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
function IconCheck({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconX({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconPlus({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ── Inline style tokens ── */
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
export default function SettingsTasksPage() {
  const { user, loading: authLoading } = useAuth();
  const { notify } = useNotification();

  const [categories, setCategories] = useState([]);
  const [botConfigs, setBotConfigs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Category form */
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366F1');
  const [editCatId, setEditCatId] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatColor, setEditCatColor] = useState('');

  /* ── Data fetch ── */
  const fetchData = useCallback(async () => {
    try {
      const [catRes, botRes, usersRes] = await Promise.all([
        fetch('/api/task-categories'),
        fetch('/api/task-bot-config'),
        fetch('/api/tasks/users-search'),
      ]);
      const catData = await catRes.json();
      const botData = await botRes.json();
      const usersData = await usersRes.json();
      if (catData.success) setCategories(catData.categories || []);
      if (botData.success) setBotConfigs(botData.configs || []);
      if (usersData.success) setUsers(usersData.users || []);
    } catch (err) {
      notify('Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Categories CRUD ── */
  async function createCategory() {
    if (!newCatName.trim()) {
      notify('Nome obrigatorio', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/task-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim(), color: newCatColor }),
      });
      const data = await res.json();
      if (data.success) {
        notify('Categoria criada', 'success');
        setNewCatName('');
        setNewCatColor('#6366F1');
        fetchData();
      } else {
        notify(data.error || 'Erro', 'error');
      }
    } catch {
      notify('Erro ao criar categoria', 'error');
    }
  }

  async function updateCategory() {
    if (!editCatName.trim()) return;
    try {
      const res = await fetch(`/api/task-categories/${editCatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editCatName.trim(), color: editCatColor }),
      });
      const data = await res.json();
      if (data.success) {
        notify('Categoria atualizada', 'success');
        setEditCatId(null);
        fetchData();
      }
    } catch {
      notify('Erro ao atualizar', 'error');
    }
  }

  async function deleteCategory(id) {
    if (!confirm('Excluir esta categoria?')) return;
    try {
      const res = await fetch(`/api/task-categories/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        notify('Categoria excluida', 'success');
        fetchData();
      }
    } catch {
      notify('Erro ao excluir', 'error');
    }
  }

  /* ── Bot Config ── */
  async function saveBotConfig(cfg) {
    try {
      const res = await fetch('/api/task-bot-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (data.success) {
        notify('Configuracao salva', 'success');
        fetchData();
      } else {
        notify(data.error || 'Erro', 'error');
      }
    } catch {
      notify('Erro ao salvar', 'error');
    }
  }

  function updateBotField(userId, field, value) {
    setBotConfigs(prev => prev.map(c =>
      c.user_id === userId ? { ...c, [field]: value } : c
    ));
  }

  function toggleBotDay(userId, day) {
    setBotConfigs(prev => prev.map(c => {
      if (c.user_id !== userId) return c;
      const days = c.active_days || [];
      const newDays = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort();
      return { ...c, active_days: newDays };
    }));
  }

  /* Users without bot config */
  const configuredUserIds = new Set(botConfigs.map(c => c.user_id));
  const unconfiguredUsers = users.filter(u => !configuredUserIds.has(u.id));

  function addBotForUser(userId) {
    const u = users.find(x => x.id === userId);
    setBotConfigs(prev => [...prev, {
      user_id: userId,
      user_name: u?.name || 'Usuario',
      phone: '',
      dispatch_time: '08:00',
      active_days: [1, 2, 3, 4, 5],
      message_morning: '',
      message_overdue: '',
      is_active: false,
    }]);
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

  return (
    <DashboardLayout activeTab="settings/tasks">
      <div className={styles.pageContainer}>

        {/* ── Header ── */}
        <div className={styles.headerRow}>
          <div>
            <h1 className="page-title">Config. Tarefas</h1>
            <p className="page-subtitle">Categorias, recorrencias e bot de lembrete</p>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            // CATEGORIAS DE TASKS
        ══════════════════════════════════════════════════════ */}
        <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={SECTION_TITLE}>// categorias de tasks</div>

          {categories.length > 0 && (
            <div className={styles.categoryGrid}>
              {categories.map(cat => (
                <div key={cat.id} className={styles.categoryItem}>
                  {editCatId === cat.id ? (
                    <>
                      <input
                        type="color"
                        value={editCatColor}
                        onChange={e => setEditCatColor(e.target.value)}
                        className={styles.colorInput}
                      />
                      <input
                        className="sigma-input"
                        style={{ flex: 1, padding: '8px 12px', fontSize: 13, background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                        value={editCatName}
                        onChange={e => setEditCatName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && updateCategory()}
                        autoFocus
                      />
                      <button className={styles.iconBtn} onClick={updateCategory} title="Salvar">
                        <IconCheck size={14} />
                      </button>
                      <button className={styles.iconBtn} onClick={() => setEditCatId(null)} title="Cancelar">
                        <IconX size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className={styles.categoryDot} style={{ background: cat.color }} />
                      <span className={styles.categoryName}>{cat.name}</span>
                      <div className={styles.categoryActions}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => { setEditCatId(cat.id); setEditCatName(cat.name); setEditCatColor(cat.color); }}
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
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className={styles.addRow}>
            <input
              type="color"
              value={newCatColor}
              onChange={e => setNewCatColor(e.target.value)}
              className={styles.colorInput}
            />
            <input
              className="sigma-input"
              style={{ flex: 1, padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
              placeholder="Nova categoria..."
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createCategory()}
            />
            <button className="sigma-btn-primary" onClick={createCategory}>
              <IconPlus size={12} />
              Criar
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            // TASKS RECORRENTES
        ══════════════════════════════════════════════════════ */}
        <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={SECTION_TITLE}>// tasks recorrentes</div>
          <div className={styles.placeholder}>// em breve</div>
        </div>

        {/* ══════════════════════════════════════════════════════
            // BOT DE LEMBRETE WHATSAPP
        ══════════════════════════════════════════════════════ */}
        <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={SECTION_TITLE}>// bot de lembrete whatsapp</div>

          {botConfigs.length === 0 && unconfiguredUsers.length === 0 ? (
            <div className={styles.placeholder}>nenhum usuario cadastrado</div>
          ) : (
            <div className={styles.botGrid}>
              {botConfigs.map(cfg => (
                <div key={cfg.user_id} className={styles.botCard}>

                  {/* Header: nome + toggle */}
                  <div className={styles.botCardHeader}>
                    <span className={styles.botUserName}>{cfg.user_name || 'Usuario'}</span>
                    <button
                      type="button"
                      className={`${styles.toggleSwitch} ${cfg.is_active ? styles.toggleSwitchActive : ''}`}
                      onClick={() => updateBotField(cfg.user_id, 'is_active', !cfg.is_active)}
                    >
                      <div className={`${styles.toggleKnob} ${cfg.is_active ? styles.toggleKnobActive : ''}`} />
                    </button>
                  </div>

                  {/* Phone + Dispatch time */}
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldGroup}>
                      <label style={LABEL}>Telefone (com DDI)</label>
                      <input
                        className="sigma-input"
                        value={cfg.phone || ''}
                        onChange={e => updateBotField(cfg.user_id, 'phone', e.target.value)}
                        placeholder="5511999999999"
                        style={{ padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label style={LABEL}>Horario de Disparo</label>
                      <input
                        className="sigma-input"
                        type="time"
                        value={cfg.dispatch_time || '08:00'}
                        onChange={e => updateBotField(cfg.user_id, 'dispatch_time', e.target.value)}
                        style={{ padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                      />
                    </div>
                  </div>

                  {/* Days */}
                  <div className={styles.fieldGroup} style={{ marginBottom: 12 }}>
                    <label style={LABEL}>Dias Ativos</label>
                    <div className={styles.daysRow}>
                      {DAYS.map(d => (
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

                  {/* Messages */}
                  <div className={styles.fieldGroup} style={{ marginBottom: 12 }}>
                    <label style={LABEL}>Mensagem Manha</label>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={cfg.message_morning || ''}
                      onChange={e => updateBotField(cfg.user_id, 'message_morning', e.target.value)}
                      placeholder="Mensagem personalizada (opcional)"
                      style={{ padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                    />
                  </div>

                  <div className={styles.fieldGroup} style={{ marginBottom: 16 }}>
                    <label style={LABEL}>Mensagem Overdue</label>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={cfg.message_overdue || ''}
                      onChange={e => updateBotField(cfg.user_id, 'message_overdue', e.target.value)}
                      placeholder="Mensagem para tasks vencidas (opcional)"
                      style={{ padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                    />
                  </div>

                  {/* Save button */}
                  <button
                    className="sigma-btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => saveBotConfig(cfg)}
                  >
                    Salvar Configuracao
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add user */}
          {unconfiguredUsers.length > 0 && (
            <div className={styles.addUserRow}>
              <select
                className="sigma-input"
                style={{ maxWidth: 260, padding: '10px 14px', background: 'rgba(10,10,10,0.8)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                id="addBotUser"
              >
                <option value="">Adicionar usuario...</option>
                {unconfiguredUsers.map(u => (
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
                <IconPlus size={12} />
                Adicionar
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
