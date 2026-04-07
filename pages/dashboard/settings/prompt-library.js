import { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/promptLibrary.module.css';

const CATEGORY_ICONS = {
  cpu: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  edit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  layout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
  terminal: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
};

const FILTER_OPTIONS = [
  { id: 'all',        label: 'Todos' },
  { id: 'pipeline',   label: 'Pipeline' },
  { id: 'copy',       label: 'Gerador de Copy' },
  { id: 'structures', label: 'Estruturas' },
  { id: 'utils',      label: 'Utilitarios' },
];

export default function PromptLibraryPage() {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('all');

  // ── Modal state ──
  const [modal, setModal] = useState(null); // { id, category, title, description, isCustom, activePrompt, defaultPrompt }
  const [editText, setEditText] = useState('');
  const [showDefault, setShowDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [unsavedWarning, setUnsavedWarning] = useState(false);
  const pendingCloseRef = useRef(false);

  const loadAll = useCallback(async () => {
    try {
      const r = await fetch('/api/settings/prompt-library');
      const d = await r.json();
      if (d.success) setCategories(d.categories);
    } catch (err) {
      console.error('[ERRO][PromptLibrary] Falha ao carregar', err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Computed ──
  const customCount = categories.reduce((sum, c) => sum + c.prompts.filter(p => p.isCustom).length, 0);
  const totalCount = categories.reduce((sum, c) => sum + c.prompts.length, 0);
  const defaultCount = totalCount - customCount;

  const filteredCategories = filter === 'all'
    ? categories
    : categories.filter(c => c.id === filter);

  // ── Modal handlers ──
  function openModal(prompt, categoryId) {
    setModal({ ...prompt, category: categoryId });
    setEditText(prompt.activePrompt);
    setShowDefault(false);
    setConfirmRestore(false);
    setUnsavedWarning(false);
  }

  function hasUnsavedChanges() {
    if (!modal) return false;
    return editText !== modal.activePrompt;
  }

  function tryClose() {
    if (hasUnsavedChanges()) {
      setUnsavedWarning(true);
      pendingCloseRef.current = true;
      return;
    }
    closeModal();
  }

  function closeModal() {
    setModal(null);
    setEditText('');
    setShowDefault(false);
    setConfirmRestore(false);
    setUnsavedWarning(false);
    pendingCloseRef.current = false;
  }

  function discardAndClose() {
    closeModal();
  }

  async function handleSave() {
    if (!modal) return;
    setSaving(true);
    try {
      const r = await fetch('/api/settings/prompt-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: modal.id, category: modal.category, prompt: editText }),
      });
      const d = await r.json();
      if (d.success) {
        // Update local state without full reload
        setCategories(prev => prev.map(c => ({
          ...c,
          prompts: c.prompts.map(p =>
            p.id === modal.id ? { ...p, isCustom: true, activePrompt: editText } : p
          ),
        })));
        setModal(prev => ({ ...prev, isCustom: true, activePrompt: editText }));
        notify('Prompt salvo com sucesso', 'success');
        closeModal();
      }
    } catch { notify('Erro ao salvar prompt', 'error'); }
    setSaving(false);
  }

  async function handleRestore() {
    if (!modal) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/settings/prompt-library?id=${modal.id}&category=${modal.category}`, {
        method: 'DELETE',
      });
      const d = await r.json();
      if (d.success) {
        setCategories(prev => prev.map(c => ({
          ...c,
          prompts: c.prompts.map(p =>
            p.id === modal.id ? { ...p, isCustom: false, activePrompt: p.defaultPrompt } : p
          ),
        })));
        notify('Prompt restaurado ao padrao', 'success');
        closeModal();
      }
    } catch { notify('Erro ao restaurar prompt', 'error'); }
    setSaving(false);
  }

  // Keyboard
  useEffect(() => {
    if (!modal) return;
    function onKey(e) {
      if (e.key === 'Escape') tryClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, editText]);

  if (loading) {
    return (
      <DashboardLayout activeTab="settings/prompt-library">
        <div className={styles.loadingText}>Carregando biblioteca de prompts...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="settings/prompt-library">
      <div className={styles.pageContainer}>
        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <h1 className="page-title">Biblioteca de Prompts</h1>
            <span className={styles.headerBadge}>
              {customCount} customizado{customCount !== 1 ? 's' : ''} · {defaultCount} no padrao
            </span>
          </div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Todos os prompts do sistema em um so lugar. Personalize, restaure e controle o que cada IA faz.
          </p>
        </div>

        {/* ── Filtro ── */}
        <div className={styles.filterRow}>
          {FILTER_OPTIONS.map(f => (
            <button
              key={f.id}
              className={`${styles.filterPill} ${filter === f.id ? styles.filterPillActive : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Categories + Cards ── */}
        {filteredCategories.map(cat => (
          <div key={cat.id} className={styles.categorySection}>
            <div className={styles.categoryHeader}>
              <span className={styles.categoryIcon}>{CATEGORY_ICONS[cat.icon]}</span>
              <span className={styles.categoryLabel}>{cat.label}</span>
              <span className={styles.categoryCount}>{cat.prompts.length} prompt{cat.prompts.length !== 1 ? 's' : ''}</span>
            </div>

            <div className={styles.cardGrid}>
              {cat.prompts.map(prompt => (
                <div key={prompt.id} className={styles.promptCard}>
                  <div className={styles.cardTop}>
                    <div className={styles.cardTitle}>{prompt.title}</div>
                    <span className={prompt.isCustom ? styles.badgeCustom : styles.badgeDefault}>
                      {prompt.isCustom ? 'CUSTOMIZADO' : 'PADRAO'}
                    </span>
                  </div>
                  <div className={styles.cardDesc}>{prompt.description}</div>
                  <div className={styles.cardDivider} />
                  <button className={styles.cardAction} onClick={() => openModal(prompt, cat.id)}>
                    Acessar / Modificar
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ── Modal ── */}
        {modal && (
          <div className={styles.modalOverlay} onClick={tryClose}>
            <div className={styles.modalContainer} onClick={e => e.stopPropagation()}>
              {/* Unsaved warning */}
              {unsavedWarning && (
                <div className={styles.unsavedBanner}>
                  <span>Voce tem alteracoes nao salvas.</span>
                  <button
                    className={styles.unsavedBtn}
                    style={{ background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.25)', color: 'var(--brand-300)' }}
                    onClick={discardAndClose}
                  >
                    Descartar
                  </button>
                  <button
                    className={styles.unsavedBtn}
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}
                    onClick={() => setUnsavedWarning(false)}
                  >
                    Continuar editando
                  </button>
                </div>
              )}

              {/* Header */}
              <div className={styles.modalHeader}>
                <button className={styles.modalBack} onClick={tryClose}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                  </svg>
                  Voltar
                </button>
                <span className={styles.modalTitle}>{modal.title}</span>
                <span className={modal.isCustom ? styles.badgeCustom : styles.badgeDefault}>
                  {modal.isCustom ? 'CUSTOMIZADO' : 'PADRAO'}
                </span>
              </div>

              {/* Body */}
              <div className={styles.modalBody}>
                <div className={styles.modalDesc}>{modal.description}</div>

                {modal.isCustom && (
                  <div className={styles.modalCustomWarning}>
                    Este prompt foi personalizado. O padrao do sistema esta preservado abaixo.
                  </div>
                )}

                {/* Active prompt */}
                <div className={styles.sectionLabel}>Prompt Ativo</div>
                <textarea
                  className={styles.promptTextarea}
                  value={editText}
                  onChange={e => { setEditText(e.target.value); setUnsavedWarning(false); }}
                />
                <div className={styles.charCount}>{editText.length} caracteres</div>

                {/* Default prompt (collapsible) */}
                <button
                  className={styles.collapseToggle}
                  onClick={() => setShowDefault(v => !v)}
                >
                  {showDefault ? 'Ocultar prompt padrao' : 'Ver prompt padrao do sistema'}
                  <svg
                    width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ transform: showDefault ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {showDefault && (
                  <>
                    <textarea
                      className={styles.promptTextareaReadonly}
                      value={modal.defaultPrompt}
                      readOnly
                    />
                    <div className={styles.collapseNote}>
                      Este texto e imutavel. Clicar em "Voltar ao Padrao" restaura exatamente este conteudo.
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className={styles.modalFooter}>
                <div>
                  {!confirmRestore ? (
                    <button
                      className={styles.btnRestore}
                      onClick={() => setConfirmRestore(true)}
                      disabled={saving || !modal.isCustom}
                    >
                      Voltar ao Padrao
                    </button>
                  ) : (
                    <div className={styles.confirmBar}>
                      <span className={styles.confirmText}>Tem certeza? O prompt customizado sera removido.</span>
                      <button className={styles.confirmBtn} onClick={handleRestore} disabled={saving}>
                        {saving ? 'Restaurando...' : 'Confirmar'}
                      </button>
                      <button className={styles.confirmCancel} onClick={() => setConfirmRestore(false)}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className={styles.btnSave}
                  onClick={handleSave}
                  disabled={saving || !hasUnsavedChanges()}
                >
                  {saving ? 'Salvando...' : 'Salvar Alteracoes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
