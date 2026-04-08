/**
 * pages/dashboard/settings/financeiro.js
 * Configurações financeiras (admin only):
 *   1. Categorias de gastos (popup modal)
 *   2. Mensagens de cobrança (tabs com preview)
 *   3. Configuração do bot (numeros, dias, horario, cobranças)
 *
 * Padronizado com settings/tasks (sectionCard + modal popup pattern).
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../components/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/settingsFinanceiro.module.css';

/* ── Constantes ── */

const COLOR_PALETTE = [
  '#ff0033', '#f97316', '#facc15', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#a3a3a3', '#737373',
];

const MSG_TABS = [
  { key: 'msgOneDayBefore', label: '1 dia antes' },
  { key: 'msgDueToday',     label: 'No dia' },
  { key: 'msgOverdueOne',   label: '1 dia atraso' },
  { key: 'msgOverdueN',     label: 'Atraso prolongado' },
  { key: 'msgSummary',      label: 'Resumo admin' },
];

const VARIABLES = {
  msgOneDayBefore: ['{nome}', '{numero}', '{data}', '{valor}'],
  msgDueToday:     ['{nome}', '{numero}', '{data}', '{valor}'],
  msgOverdueOne:   ['{nome}', '{numero}', '{data}', '{valor}'],
  msgOverdueN:     ['{nome}', '{numero}', '{data}', '{valor}', '{dias_atraso}'],
  msgSummary:      ['{data_hoje}', '{lista_clientes}', '{total}'],
};

const PREVIEW_VARS = {
  '{nome}': 'João Silva',
  '{numero}': '3/12',
  '{data}': '15/04/2026',
  '{valor}': '1.500,00',
  '{dias_atraso}': '5',
  '{data_hoje}': '08/04/2026',
  '{lista_clientes}': '• *Cliente A* — Parcela 3/12 — R$ 1.500,00 — 5 dias atraso',
  '{total}': '1.500,00',
};

const DAYS = [
  { iso: 1, label: 'Seg' },
  { iso: 2, label: 'Ter' },
  { iso: 3, label: 'Qua' },
  { iso: 4, label: 'Qui' },
  { iso: 5, label: 'Sex' },
  { iso: 6, label: 'Sáb' },
  { iso: 7, label: 'Dom' },
];

function previewMessage(template) {
  let msg = template || '';
  for (const [k, v] of Object.entries(PREVIEW_VARS)) {
    msg = msg.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v);
  }
  return msg;
}

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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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
function IconTag({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function IconBot({ size = 18 }) {
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
function IconCheck({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */

export default function SettingsFinanceiro() {
  const router = useRouter();
  const { user } = useAuth();
  const { notify } = useNotification();

  // Admin guard
  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/dashboard');
  }, [user]);

  /* ── Categories state ── */
  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', type: 'variable', color: COLOR_PALETTE[0] });
  const [savingCat, setSavingCat] = useState(false);

  /* ── Messages state ── */
  const [activeMsg, setActiveMsg] = useState('msgOneDayBefore');
  const textareaRef = useRef(null);

  /* ── Bot config state ── */
  const [botConfig, setBotConfig] = useState(null);
  const [defaults, setDefaults] = useState({});
  const [loadingBot, setLoadingBot] = useState(true);
  const [savingBot, setSavingBot] = useState(false);
  const [newNumber, setNewNumber] = useState('');

  /* ── Load data ── */
  async function loadCategories() {
    try {
      const j = await fetch('/api/finance-categories').then(r => r.json());
      if (j.success) setCategories(j.categories || []);
    } catch (e) { notify('Erro ao carregar categorias', 'error'); }
    finally { setLoadingCats(false); }
  }

  async function loadBotConfig() {
    try {
      const j = await fetch('/api/finance-bot-config').then(r => r.json());
      if (j.success) {
        setBotConfig(j.config);
        setDefaults(j.defaults || {});
      }
    } catch (e) { notify('Erro ao carregar config do bot', 'error'); }
    finally { setLoadingBot(false); }
  }

  useEffect(() => { loadCategories(); loadBotConfig(); }, []);

  /* ── Category CRUD ── */
  function openCatModal(cat = null) {
    if (cat) {
      setEditingCat(cat.id);
      setCatForm({ name: cat.name, type: cat.type, color: cat.color });
    } else {
      setEditingCat(null);
      setCatForm({ name: '', type: 'variable', color: COLOR_PALETTE[0] });
    }
    setShowCatModal(true);
  }

  async function handleSaveCat() {
    if (!catForm.name.trim()) {
      notify('Informe o nome da categoria', 'warning');
      return;
    }
    setSavingCat(true);
    try {
      const payload = { ...catForm, name: catForm.name.trim() };
      if (editingCat) payload.id = editingCat;
      const method = editingCat ? 'PUT' : 'POST';
      const j = await fetch('/api/finance-categories', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      notify(editingCat ? 'Categoria atualizada' : 'Categoria criada', 'success');
      setShowCatModal(false);
      setEditingCat(null);
      loadCategories();
    } catch (err) {
      notify(err.message || 'Erro ao salvar categoria', 'error');
    } finally {
      setSavingCat(false);
    }
  }

  async function handleDeleteCat(id) {
    if (!confirm('Excluir esta categoria?')) return;
    try {
      const j = await fetch('/api/finance-categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      notify('Categoria excluída', 'success');
      loadCategories();
    } catch (err) {
      notify(err.message || 'Erro ao excluir', 'error');
    }
  }

  /* ── Insert variable at cursor in textarea ── */
  function insertVariable(v) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = botConfig[activeMsg] || '';
    const updated = current.slice(0, start) + v + current.slice(end);
    setBotConfig((prev) => ({ ...prev, [activeMsg]: updated }));
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + v.length, start + v.length);
    }, 0);
  }

  /* ── Bot config save ── */
  async function handleSaveBot() {
    setSavingBot(true);
    try {
      const j = await fetch('/api/finance-bot-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botConfig),
      }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      setBotConfig(j.config);
      notify('Configurações salvas', 'success');
    } catch (err) {
      notify(err.message || 'Erro ao salvar', 'error');
    } finally {
      setSavingBot(false);
    }
  }

  function addNumber() {
    const clean = newNumber.replace(/\D/g, '');
    if (clean.length < 10) {
      notify('Número inválido. Use formato com DDD.', 'error');
      return;
    }
    if (botConfig.numbers.includes(clean)) {
      notify('Número já adicionado', 'warning');
      return;
    }
    setBotConfig((prev) => ({ ...prev, numbers: [...prev.numbers, clean] }));
    setNewNumber('');
  }

  function removeNumber(num) {
    setBotConfig((prev) => ({ ...prev, numbers: prev.numbers.filter((n) => n !== num) }));
  }

  function toggleDay(iso) {
    setBotConfig((prev) => {
      const days = prev.activeDays.includes(iso)
        ? prev.activeDays.filter((d) => d !== iso)
        : [...prev.activeDays, iso].sort();
      return { ...prev, activeDays: days };
    });
  }

  function restoreDefault(key) {
    if (defaults[key]) {
      setBotConfig((prev) => ({ ...prev, [key]: defaults[key] }));
      notify('Mensagem restaurada para o padrão', 'info');
    }
  }

  if (!user || user.role !== 'admin') return null;

  return (
    <DashboardLayout activeTab="settings-financeiro">
      <div className={styles.pageContainer}>

        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <h1 className="page-title">Config. Financeiro</h1>
            <p className="page-subtitle">Categorias, mensagens de cobrança e bot WhatsApp</p>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            CATEGORIAS DE GASTOS
        ════════════════════════════════════════════════ */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.sectionDot} />
                <span className={styles.sectionTitleText}>Categorias de gastos</span>
                <span className={styles.sectionLine} />
              </div>
              <div className={styles.sectionDescription}>
                Organize gastos por tipo (fixos ou variáveis). Cada categoria recebe uma cor de identificação.
              </div>
            </div>
            <button className="sigma-btn-primary" onClick={() => openCatModal(null)}>
              <IconPlus size={12} /> Nova Categoria
            </button>
          </div>

          {loadingCats ? (
            <div className={styles.catEmpty}>carregando...</div>
          ) : categories.length === 0 ? (
            <div className={styles.catEmpty}>nenhuma categoria cadastrada</div>
          ) : (
            <div className={styles.catGrid}>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className={styles.catCard}
                  style={{ '--cat-color': cat.color }}
                >
                  <div className={styles.catDot} style={{ background: cat.color, color: cat.color }} />
                  <div className={styles.catInfo}>
                    <div className={styles.catName}>{cat.name}</div>
                    <span
                      className={styles.catBadge}
                      style={{
                        background: cat.type === 'fixed' ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)',
                        border: `1px solid ${cat.type === 'fixed' ? 'rgba(59,130,246,0.3)' : 'rgba(249,115,22,0.3)'}`,
                        color: cat.type === 'fixed' ? '#3b82f6' : '#f97316',
                      }}
                    >
                      {cat.type === 'fixed' ? 'FIXO' : 'VARIÁVEL'}
                    </span>
                  </div>
                  <div className={styles.catActions}>
                    <button
                      className={styles.iconBtn}
                      onClick={() => openCatModal(cat)}
                      title="Editar"
                    >
                      <IconEdit size={12} />
                    </button>
                    <button
                      className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                      onClick={() => handleDeleteCat(cat.id)}
                      title="Excluir"
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════
            MENSAGENS DE COBRANCA
        ════════════════════════════════════════════════ */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.sectionDot} />
                <span className={styles.sectionTitleText}>Mensagens de cobrança</span>
                <span className={styles.sectionLine} />
              </div>
              <div className={styles.sectionDescription}>
                Personalize as mensagens enviadas em cada etapa da cobrança. Use as variáveis para inserir dados dinâmicos do cliente.
              </div>
            </div>
          </div>

          {botConfig && (
            <>
              {/* Tabs */}
              <div className={styles.msgTabs}>
                {MSG_TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveMsg(t.key)}
                    className={`${styles.msgTab} ${activeMsg === t.key ? styles.msgTabActive : ''}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Textarea */}
              <div className={styles.messageBox}>
                <textarea
                  ref={textareaRef}
                  className={styles.messageTextarea}
                  value={botConfig[activeMsg] || ''}
                  onChange={(e) => setBotConfig((prev) => ({ ...prev, [activeMsg]: e.target.value }))}
                  placeholder="Mensagem desta etapa..."
                />
                <div className={styles.messageTagsRow}>
                  {(VARIABLES[activeMsg] || []).map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={styles.messageTag}
                      onClick={() => insertVariable(v)}
                      title={`Inserir ${v}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.messageHint}>
                Clique nas variáveis acima para inserir no cursor. Elas serão substituídas pelos dados reais ao enviar.
              </div>

              {/* Preview */}
              <div className={styles.previewLabel}>Pré-visualização</div>
              <div className={styles.msgPreview}>
                {previewMessage(botConfig[activeMsg] || '') || '(mensagem vazia)'}
              </div>

              {/* Footer */}
              <div className={styles.msgFooter}>
                <button
                  type="button"
                  className={styles.restoreBtn}
                  onClick={() => restoreDefault(activeMsg)}
                >
                  Restaurar padrão
                </button>
                <button
                  className="sigma-btn-primary"
                  onClick={handleSaveBot}
                  disabled={savingBot}
                  style={{ marginLeft: 'auto' }}
                >
                  <IconCheck size={12} /> {savingBot ? 'Salvando...' : 'Salvar Mensagens'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ════════════════════════════════════════════════
            CONFIGURACAO DO BOT
        ════════════════════════════════════════════════ */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.sectionDot} />
                <span className={styles.sectionTitleText}>Configuração do bot</span>
                <span className={styles.sectionLine} />
              </div>
              <div className={styles.sectionDescription}>
                Defina números, dias e horário do bot de cobrança. As mensagens acima são disparadas automaticamente.
              </div>
            </div>
          </div>

          {loadingBot ? (
            <div className={styles.catEmpty}>carregando configurações...</div>
          ) : botConfig && (
            <>
              {/* Status row */}
              <div className={styles.botStatusRow}>
                <div className={styles.botStatusLeft}>
                  <div className={styles.botStatusIcon}>
                    <IconBot size={18} />
                  </div>
                  <div className={styles.botStatusInfo}>
                    <div className={styles.botStatusTitle}>Bot de cobrança</div>
                    <div className={`${styles.botStatusSub} ${botConfig.active ? styles.botStatusActive : ''}`}>
                      {botConfig.active ? '● Ativo' : '○ Inativo'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className={`${styles.toggleSwitch} ${botConfig.active ? styles.toggleSwitchActive : ''}`}
                  onClick={() => setBotConfig((prev) => ({ ...prev, active: !prev.active }))}
                >
                  <div className={`${styles.toggleKnob} ${botConfig.active ? styles.toggleKnobActive : ''}`} />
                </button>
              </div>

              {botConfig.active && (
                <>
                  {/* Numbers + Time + Days */}
                  <div className={styles.botFieldsGrid}>
                    {/* Numeros */}
                    <div className={styles.botField}>
                      <div className={styles.botFieldLabel}>
                        Números do resumo de inadimplentes
                      </div>
                      {botConfig.numbers && botConfig.numbers.length > 0 && (
                        <div className={styles.chipList}>
                          {botConfig.numbers.map((num) => (
                            <div key={num} className={styles.chip}>
                              {num}
                              <button className={styles.chipRemove} onClick={() => removeNumber(num)}>
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className={styles.addNumberRow}>
                        <input
                          className={styles.modalInput}
                          value={newNumber}
                          onChange={(e) => setNewNumber(e.target.value)}
                          placeholder="5511999999999"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addNumber();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={addNumber}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            border: '1px solid rgba(255,0,51,0.4)',
                            background: 'rgba(255,0,51,0.1)',
                            color: '#ff6680',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          <IconPlus size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Horario */}
                    <div className={styles.botField}>
                      <div className={styles.botFieldLabel}>Horário de disparo</div>
                      <input
                        type="time"
                        className={styles.modalInput}
                        value={botConfig.dispatchTime || '09:00'}
                        onChange={(e) => setBotConfig((prev) => ({ ...prev, dispatchTime: e.target.value }))}
                      />
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.55rem',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}>
                        Horário de Brasília (BRT)
                      </div>
                    </div>
                  </div>

                  {/* Dias ativos */}
                  <div className={styles.botField} style={{ marginBottom: 18 }}>
                    <div className={styles.botFieldLabel}>Dias ativos</div>
                    <div className={styles.daysRow}>
                      {DAYS.map((d) => (
                        <button
                          key={d.iso}
                          type="button"
                          className={`${styles.dayChip} ${(botConfig.activeDays || []).includes(d.iso) ? styles.dayChipActive : ''}`}
                          onClick={() => toggleDay(d.iso)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cobrança no cliente */}
                  <div className={styles.botField}>
                    <div className={styles.botFieldLabel}>Canais de cobrança</div>
                    <div className={styles.toggleRow}>
                      <div className={styles.toggleRowLeft}>
                        <div className={styles.toggleRowTitle}>Número pessoal do cliente</div>
                        <div className={styles.toggleRowNote}>
                          Envia mensagem no WhatsApp pessoal cadastrado na ficha do cliente
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`${styles.toggleSwitch} ${botConfig.chargePersonal ? styles.toggleSwitchActive : ''}`}
                        onClick={() => setBotConfig((prev) => ({ ...prev, chargePersonal: !prev.chargePersonal }))}
                      >
                        <div className={`${styles.toggleKnob} ${botConfig.chargePersonal ? styles.toggleKnobActive : ''}`} />
                      </button>
                    </div>
                    <div className={styles.toggleRow}>
                      <div className={styles.toggleRowLeft}>
                        <div className={styles.toggleRowTitle}>Grupo WhatsApp do cliente</div>
                        <div className={styles.toggleRowNote}>
                          Requer grupo vinculado na ficha do cliente
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`${styles.toggleSwitch} ${botConfig.chargeGroup ? styles.toggleSwitchActive : ''}`}
                        onClick={() => setBotConfig((prev) => ({ ...prev, chargeGroup: !prev.chargeGroup }))}
                      >
                        <div className={`${styles.toggleKnob} ${botConfig.chargeGroup ? styles.toggleKnobActive : ''}`} />
                      </button>
                    </div>
                  </div>
                </>
              )}

              <button
                className={`sigma-btn-primary ${styles.botSaveBtn}`}
                onClick={handleSaveBot}
                disabled={savingBot}
              >
                <IconCheck size={12} /> {savingBot ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </>
          )}
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
                    {editingCat ? 'Editar Categoria' : 'Nova Categoria'}
                  </h2>
                  <div className={styles.modalSubtitle}>
                    Defina o nome, tipo e cor da categoria de gasto.
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
                  placeholder="Ex: Aluguel, Software, Marketing..."
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveCat()}
                />
              </div>

              <div>
                <label className={styles.modalLabel}>
                  Tipo <span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.modalSelect}
                  value={catForm.type}
                  onChange={(e) => setCatForm((p) => ({ ...p, type: e.target.value }))}
                >
                  <option value="variable">Variável — valor muda mês a mês</option>
                  <option value="fixed">Fixo — valor recorrente fixo</option>
                </select>
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
                  className={styles.catCard}
                  style={{ '--cat-color': catForm.color, marginTop: 4 }}
                >
                  <div className={styles.catDot} style={{ background: catForm.color, color: catForm.color }} />
                  <div className={styles.catInfo}>
                    <div className={styles.catName}>{catForm.name || 'Nome da categoria'}</div>
                    <span
                      className={styles.catBadge}
                      style={{
                        background: catForm.type === 'fixed' ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)',
                        border: `1px solid ${catForm.type === 'fixed' ? 'rgba(59,130,246,0.3)' : 'rgba(249,115,22,0.3)'}`,
                        color: catForm.type === 'fixed' ? '#3b82f6' : '#f97316',
                      }}
                    >
                      {catForm.type === 'fixed' ? 'FIXO' : 'VARIÁVEL'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className="btn btn-secondary" onClick={() => setShowCatModal(false)}>
                Cancelar
              </button>
              <button
                className="sigma-btn-primary"
                onClick={handleSaveCat}
                disabled={savingCat}
              >
                {savingCat ? 'Salvando...' : editingCat ? 'Salvar' : 'Criar Categoria'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
