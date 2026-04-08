/**
 * pages/dashboard/settings/financeiro.js
 * Configurações financeiras (admin only):
 *   1. Categorias de gastos
 *   2. Mensagens de cobrança
 *   3. Configuração do bot
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../components/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/settingsFinanceiro.module.css';

/* ── Helpers ── */
const SEL = {
  padding: '7px 10px', background: 'rgba(10,10,10,0.8)',
  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7,
  color: 'var(--text-primary)', fontSize: '0.72rem',
  fontFamily: 'var(--font-mono)', outline: 'none', cursor: 'pointer',
};

const INP = {
  width: '100%', padding: '8px 11px', boxSizing: 'border-box',
  background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)', outline: 'none',
};

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
  { iso: 6, label: 'Sab' },
  { iso: 7, label: 'Dom' },
];

function previewMessage(template) {
  let msg = template;
  for (const [k, v] of Object.entries(PREVIEW_VARS)) {
    msg = msg.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v);
  }
  return msg;
}

/* ═══════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════ */
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
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', type: 'variable', color: '#6366F1' });
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
  function openNewCat() {
    setCatForm({ name: '', type: 'variable', color: '#6366F1' });
    setEditingCat(null);
    setShowCatForm(true);
  }

  function openEditCat(cat) {
    setCatForm({ name: cat.name, type: cat.type, color: cat.color });
    setEditingCat(cat.id);
    setShowCatForm(true);
  }

  async function handleSaveCat(e) {
    e.preventDefault();
    if (!catForm.name.trim()) { notify('Nome da categoria e obrigatorio', 'error'); return; }
    setSavingCat(true);
    try {
      const payload = { ...catForm };
      if (editingCat) payload.id = editingCat;
      const method = editingCat ? 'PUT' : 'POST';
      const j = await fetch('/api/finance-categories', {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      notify(editingCat ? 'Categoria atualizada' : 'Categoria criada', 'success');
      setShowCatForm(false);
      setEditingCat(null);
      loadCategories();
    } catch (err) {
      notify(err.message || 'Erro ao salvar categoria', 'error');
    } finally { setSavingCat(false); }
  }

  async function handleDeleteCat(id) {
    if (!confirm('Excluir esta categoria?')) return;
    try {
      const j = await fetch('/api/finance-categories', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      notify('Categoria excluida', 'success');
      loadCategories();
    } catch (err) { notify(err.message || 'Erro ao excluir', 'error'); }
  }

  /* ── Insert variable at cursor ── */
  function insertVariable(v) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = botConfig[activeMsg] || '';
    const updated = current.slice(0, start) + v + current.slice(end);
    setBotConfig(prev => ({ ...prev, [activeMsg]: updated }));
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botConfig),
      }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      setBotConfig(j.config);
      notify('Configuracoes salvas', 'success');
    } catch (err) { notify(err.message || 'Erro ao salvar', 'error'); }
    finally { setSavingBot(false); }
  }

  function addNumber() {
    const clean = newNumber.replace(/\D/g, '');
    if (clean.length < 10) { notify('Numero invalido. Use formato com DDD.', 'error'); return; }
    if (botConfig.numbers.includes(clean)) { notify('Numero ja adicionado', 'error'); return; }
    setBotConfig(prev => ({ ...prev, numbers: [...prev.numbers, clean] }));
    setNewNumber('');
  }

  function removeNumber(num) {
    setBotConfig(prev => ({ ...prev, numbers: prev.numbers.filter(n => n !== num) }));
  }

  function toggleDay(iso) {
    setBotConfig(prev => {
      const days = prev.activeDays.includes(iso)
        ? prev.activeDays.filter(d => d !== iso)
        : [...prev.activeDays, iso].sort();
      return { ...prev, activeDays: days };
    });
  }

  function restoreDefault(key) {
    if (defaults[key]) {
      setBotConfig(prev => ({ ...prev, [key]: defaults[key] }));
      notify('Mensagem restaurada para o padrao', 'success');
    }
  }

  if (!user || user.role !== 'admin') return null;

  return (
    <DashboardLayout activeTab="settings-financeiro">
      <div className={styles.page}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: 4 }}>
            Config. Financeiro
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>
            Categorias, mensagens de cobranca e configuracao do bot.
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════
            SECAO 1: CATEGORIAS
        ═══════════════════════════════════════════════════ */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Categorias de Gastos</div>
            <button onClick={openNewCat} style={{
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.09)',
              color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 600,
            }}>
              + Nova Categoria
            </button>
          </div>

          {/* Category form */}
          {showCatForm && (
            <div className={`glass-card ${styles.catForm}`}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
                {editingCat ? 'Editar Categoria' : 'Nova Categoria'}
              </div>
              <form onSubmit={handleSaveCat}>
                <div className={styles.catFormGrid}>
                  <div>
                    <div className="label">Nome</div>
                    <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="ex: Aluguel, Software..." style={INP} />
                  </div>
                  <div>
                    <div className="label">Tipo</div>
                    <select value={catForm.type} onChange={e => setCatForm(f => ({ ...f, type: e.target.value }))} style={SEL}>
                      <option value="fixed">Fixo</option>
                      <option value="variable">Variavel</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div className="label">Cor</div>
                  <div className={styles.colorPickerWrap}>
                    <div className={styles.colorSwatch} style={{ background: catForm.color }}>
                      <input type="color" value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))} />
                    </div>
                    <span className={styles.colorHex}>{catForm.color}</span>
                  </div>
                </div>
                {/* Preview */}
                <div className={styles.catFormPreview}>
                  <span className={styles.catDot} style={{ background: catForm.color }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {catForm.name || 'Nome da categoria'}
                  </span>
                  <span className={styles.catBadge} style={{
                    background: catForm.type === 'fixed' ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)',
                    border: `1px solid ${catForm.type === 'fixed' ? 'rgba(59,130,246,0.3)' : 'rgba(249,115,22,0.3)'}`,
                    color: catForm.type === 'fixed' ? '#3b82f6' : '#f97316',
                  }}>
                    {catForm.type === 'fixed' ? 'FIXO' : 'VARIAVEL'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" disabled={savingCat} className="sigma-btn-primary" style={{ fontSize: '0.68rem' }}>
                    {savingCat ? 'Salvando...' : editingCat ? 'Atualizar' : 'Salvar'}
                  </button>
                  <button type="button" onClick={() => { setShowCatForm(false); setEditingCat(null); }}
                    className="btn-secondary" style={{ padding: '8px 14px', borderRadius: 6, fontSize: '0.68rem', fontFamily: 'var(--font-mono)', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: 'var(--text-muted)' }}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Category grid */}
          {loadingCats ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', padding: 20 }}>Carregando...</div>
          ) : categories.length === 0 ? (
            <div className="glass-card" style={{ padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Nenhuma categoria cadastrada. Clique em "+ Nova Categoria" para comecar.
              </div>
            </div>
          ) : (
            <div className={styles.catGrid}>
              {categories.map(cat => (
                <div key={cat.id} className={`glass-card ${styles.catCard}`}>
                  <span className={styles.catDot} style={{ background: cat.color }} />
                  <div className={styles.catInfo}>
                    <div className={styles.catName}>{cat.name}</div>
                    <span className={styles.catBadge} style={{
                      background: cat.type === 'fixed' ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)',
                      border: `1px solid ${cat.type === 'fixed' ? 'rgba(59,130,246,0.3)' : 'rgba(249,115,22,0.3)'}`,
                      color: cat.type === 'fixed' ? '#3b82f6' : '#f97316',
                    }}>
                      {cat.type === 'fixed' ? 'FIXO' : 'VARIAVEL'}
                    </span>
                  </div>
                  <div className={styles.catActions}>
                    <button className={styles.iconBtn} onClick={() => openEditCat(cat)} title="Editar">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
                    <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => handleDeleteCat(cat.id)} title="Excluir">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" /><path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="divider-sweep" style={{ marginBottom: 32 }} />

        {/* ═══════════════════════════════════════════════════
            SECAO 2: MENSAGENS DE COBRANCA
        ═══════════════════════════════════════════════════ */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} style={{ marginBottom: 16 }}>Mensagens de Cobranca</div>

          {botConfig && (
            <div className="glass-card" style={{ padding: '20px' }}>
              {/* Tabs */}
              <div className={styles.msgTabs}>
                {MSG_TABS.map(t => (
                  <button key={t.key} onClick={() => setActiveMsg(t.key)}
                    className={`${styles.msgTab} ${activeMsg === t.key ? styles.msgTabActive : ''}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Variables */}
              <div className="label" style={{ marginBottom: 6 }}>Variaveis disponiveis:</div>
              <div className={styles.varBadges}>
                {(VARIABLES[activeMsg] || []).map(v => (
                  <button key={v} type="button" className={styles.varBadge} onClick={() => insertVariable(v)}>
                    {v}
                  </button>
                ))}
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={botConfig[activeMsg] || ''}
                onChange={e => setBotConfig(prev => ({ ...prev, [activeMsg]: e.target.value }))}
                style={{
                  ...INP, minHeight: 120, resize: 'vertical', lineHeight: 1.6, width: '100%',
                  fontFamily: 'var(--font-sans)', fontSize: '0.78rem',
                }}
              />

              {/* Preview */}
              <div className="label" style={{ marginTop: 14, marginBottom: 4 }}>Preview:</div>
              <div className={styles.msgPreview}>
                {previewMessage(botConfig[activeMsg] || '')}
              </div>

              {/* Restore default */}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => restoreDefault(activeMsg)} style={{
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.06)', background: 'transparent',
                  color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                }}>
                  Restaurar padrao
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="divider-sweep" style={{ marginBottom: 32 }} />

        {/* ═══════════════════════════════════════════════════
            SECAO 3: CONFIGURACAO DO BOT
        ═══════════════════════════════════════════════════ */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} style={{ marginBottom: 16 }}>Configuracao do Bot</div>

          {loadingBot ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', padding: 20 }}>Carregando...</div>
          ) : botConfig && (
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              {/* Header with toggle */}
              <div className={styles.botHeader}>
                <div className={styles.botStatus}>
                  <span className={styles.botStatusDot} style={{
                    background: botConfig.active ? 'var(--success)' : 'var(--text-muted)',
                    boxShadow: botConfig.active ? '0 0 8px rgba(34,197,94,0.4)' : 'none',
                  }} />
                  <span style={{ color: botConfig.active ? 'var(--success)' : 'var(--text-muted)' }}>
                    {botConfig.active ? 'ATIVO' : 'INATIVO'}
                  </span>
                </div>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={botConfig.active}
                    onChange={e => setBotConfig(prev => ({ ...prev, active: e.target.checked }))} />
                  <span className={styles.toggleTrack} />
                </label>
              </div>

              {botConfig.active && (
                <div className={styles.botBody}>
                  {/* Numbers */}
                  <div className={styles.botFieldGroup}>
                    <div className={styles.botFieldLabel}>Numeros que receberao o resumo de inadimplentes</div>
                    {botConfig.numbers.length > 0 && (
                      <div className={styles.chipList}>
                        {botConfig.numbers.map(num => (
                          <div key={num} className={styles.chip}>
                            {num}
                            <button className={styles.chipRemove} onClick={() => removeNumber(num)}>x</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={styles.addNumberRow}>
                      <input value={newNumber} onChange={e => setNewNumber(e.target.value)}
                        placeholder="5511999999999" style={{ ...INP, flex: 1 }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNumber(); } }} />
                      <button type="button" onClick={addNumber} style={{
                        padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
                        border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.09)',
                        color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        +
                      </button>
                    </div>
                  </div>

                  {/* Active days */}
                  <div className={styles.botFieldGroup}>
                    <div className={styles.botFieldLabel}>Dias de disparo</div>
                    <div className={styles.daysGrid}>
                      {DAYS.map(d => (
                        <label key={d.iso} className={styles.dayCheck}>
                          <input type="checkbox" checked={botConfig.activeDays.includes(d.iso)}
                            onChange={() => toggleDay(d.iso)} />
                          {d.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Dispatch time */}
                  <div className={styles.botFieldGroup}>
                    <div className={styles.botFieldLabel}>Horario de disparo</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="time" value={botConfig.dispatchTime}
                        onChange={e => setBotConfig(prev => ({ ...prev, dispatchTime: e.target.value }))}
                        style={{ ...INP, width: 130 }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                        Horario de Brasilia (BRT)
                      </span>
                    </div>
                  </div>

                  {/* Charge toggles */}
                  <div className={styles.botFieldGroup}>
                    <div className={styles.botFieldLabel}>Cobranca no cliente</div>
                    <div className={styles.toggleRow}>
                      <div>
                        <div className={styles.toggleLabel}>Numero pessoal do cliente</div>
                      </div>
                      <label className={styles.toggle}>
                        <input type="checkbox" checked={botConfig.chargePersonal}
                          onChange={e => setBotConfig(prev => ({ ...prev, chargePersonal: e.target.checked }))} />
                        <span className={styles.toggleTrack} />
                      </label>
                    </div>
                    <div className={styles.toggleRow}>
                      <div>
                        <div className={styles.toggleLabel}>Grupo WhatsApp do cliente</div>
                        <div className={styles.toggleNote}>Requer grupo vinculado na ficha do cliente</div>
                      </div>
                      <label className={styles.toggle}>
                        <input type="checkbox" checked={botConfig.chargeGroup}
                          onChange={e => setBotConfig(prev => ({ ...prev, chargeGroup: e.target.checked }))} />
                        <span className={styles.toggleTrack} />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Save button */}
          {botConfig && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button onClick={handleSaveBot} disabled={savingBot} className="sigma-btn-primary" style={{ fontSize: '0.7rem' }}>
                {savingBot ? 'Salvando...' : 'Salvar configuracoes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
