/**
 * pages/dashboard/social.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Página de Planejamento de Conteúdo — Módulo Social Media
 *
 * Fluxo:
 *   1. Usuário seleciona conta Instagram (SearchableSelect)
 *   2. Visualiza pastas/semanas criadas para aquela conta
 *   3. Cria nova pasta (modal simples) ou clica em uma existente
 *   4. Ao entrar na pasta → ContentEditorModal (split-pane: escrita + AI)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import styles from '../../style/social.module.css';

/* ─── Paleta de cores para as pastas ─────────────────────────────────────── */
const FOLDER_COLORS = [
  { hex: '#ff0033', label: 'Vermelho' },
  { hex: '#ff6680', label: 'Rosa' },
  { hex: '#f97316', label: 'Laranja' },
  { hex: '#f59e0b', label: 'Âmbar' },
  { hex: '#22c55e', label: 'Verde' },
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#8b5cf6', label: 'Roxo' },
  { hex: '#ec4899', label: 'Pink' },
];

const CONTENT_TYPES = [
  { value: 'post',     label: 'Post' },
  { value: 'carousel', label: 'Carrossel' },
  { value: 'reel',     label: 'Reel' },
  { value: 'story',    label: 'Story' },
];

const CONTENT_STATUSES = [
  { value: 'idea',      label: 'Ideia' },
  { value: 'draft',     label: 'Rascunho' },
  { value: 'approved',  label: 'Aprovado' },
  { value: 'scheduled', label: 'Agendado' },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function hexToBg(hex)     { return `${hex}14`; }
function hexToBorder(hex) { return `${hex}25`; }
function hexToGlow(hex)   { return `${hex}10`; }

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/* ════════════════════════════════════════════════════════════════════════════
   SearchableSelect — select de conta Instagram com barra de pesquisa
═══════════════════════════════════════════════════════════════════════════ */
function SearchableSelect({ accounts, value, onChange, loading }) {
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState('');
  const ref                 = useRef(null);
  const inputRef            = useRef(null);

  const selected = accounts.find(a => a.id === value);

  const filtered = accounts.filter(a =>
    !query ||
    a.name.toLowerCase().includes(query.toLowerCase()) ||
    a.handle.toLowerCase().includes(query.toLowerCase())
  );

  /* Fecha ao clicar fora */
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* Foca o input ao abrir */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQuery('');
  }, [open]);

  return (
    <div className={styles.searchSelect} ref={ref}>
      {/* Trigger */}
      <button
        className={`${styles.searchSelectTrigger} ${open ? styles.open : ''}`}
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        type="button"
      >
        {selected ? (
          <>
            {selected.avatarUrl ? (
              <img src={selected.avatarUrl} alt="" className={styles.selectAvatar} />
            ) : (
              <div className={styles.selectAvatarPlaceholder}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="2">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-8 8-8s8 4 8 8"/>
                </svg>
              </div>
            )}
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.name}
              <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 6, fontFamily: 'var(--font-mono)' }}>
                {selected.handle}
              </span>
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)', flex: 1, textAlign: 'left' }}>
            {loading ? 'Carregando contas...' : accounts.length === 0 ? 'Nenhuma conta conectada' : 'Selecione um Instagram...'}
          </span>
        )}

        <svg
          className={`${styles.selectChevron} ${open ? styles.open : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className={styles.searchSelectDropdown}>
          {/* Barra de pesquisa */}
          <div className={styles.searchInputWrapper}>
            <svg
              className={styles.searchIcon}
              style={{ top: 14 }}
              width="13" height="13" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={inputRef}
              className={styles.searchInput}
              placeholder="Pesquisar empresa ou Instagram..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {/* Lista */}
          <div className={styles.selectOptionList}>
            {filtered.length === 0 ? (
              <div className={styles.selectEmpty}>
                {accounts.length === 0
                  ? '// nenhuma conta conectada'
                  : '// nenhum resultado encontrado'}
              </div>
            ) : (
              filtered.map(acc => (
                <div
                  key={acc.id}
                  className={`${styles.selectOption} ${acc.id === value ? styles.selected : ''}`}
                  onClick={() => { onChange(acc.id); setOpen(false); }}
                >
                  {acc.avatarUrl ? (
                    <img src={acc.avatarUrl} alt="" className={styles.selectAvatar} />
                  ) : (
                    <div className={styles.selectAvatarPlaceholder}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="2">
                        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-8 8-8s8 4 8 8"/>
                      </svg>
                    </div>
                  )}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acc.name}
                    </div>
                    <div className={styles.selectOptionHandle}>{acc.handle}</div>
                  </div>
                  {acc.id === value && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   FolderCard — card clicável de pasta/semana
═══════════════════════════════════════════════════════════════════════════ */
function FolderCard({ folder, onClick }) {
  const color = folder.color || '#ff0033';

  return (
    <div
      className={styles.folderCard}
      style={{
        '--folder-color':     color,
        '--folder-color-raw': color,
        '--folder-border':    hexToBorder(color),
        '--folder-bg':        hexToBg(color),
        '--folder-glow':      hexToGlow(color),
      }}
      onClick={onClick}
    >
      <div className={styles.folderCardTop}>
        <div className={styles.folderIcon}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <span className={styles.folderBadge}>
          {folder.content_count ?? 0} conteúdo{folder.content_count !== 1 ? 's' : ''}
        </span>
      </div>

      <div className={styles.folderName}>{folder.name}</div>
      {folder.description && (
        <div className={styles.folderDescription}>{folder.description}</div>
      )}

      <div className={styles.folderMeta}>
        <div className={styles.folderMetaLeft}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {formatDate(folder.created_at)}
        </div>
        <svg className={styles.folderArrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   NewFolderModal — modal de criação de pasta
═══════════════════════════════════════════════════════════════════════════ */
function NewFolderModal({ onClose, onCreated, accountId }) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [color,       setColor]       = useState('#ff0033');
  const [saving,      setSaving]      = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/social/folders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ accountId, name: name.trim(), description, color }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated(data.folder);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.folderModal} onClick={e => e.stopPropagation()}>
        {/* Linha de cor no topo */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${color}60, transparent)`,
        }} />

        <div className={styles.modalTitle}>Nova Pasta</div>
        <div className={styles.modalSubtitle}>Organize seu conteúdo por semanas ou campanhas</div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Nome da pasta *</label>
          <input
            className={styles.formInput}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ex: Semana 1 — Março"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Descrição (opcional)</label>
          <input
            className={styles.formInput}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Tema ou objetivo desta pasta..."
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Cor</label>
          <div className={styles.colorPicker}>
            {FOLDER_COLORS.map(c => (
              <div
                key={c.hex}
                className={`${styles.colorSwatch} ${color === c.hex ? styles.active : ''}`}
                style={{ background: c.hex }}
                title={c.label}
                onClick={() => setColor(c.hex)}
              />
            ))}
          </div>
        </div>

        <div className={styles.modalActions}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button
            className={styles.btnConfirm}
            onClick={handleCreate}
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <><span className={styles.spinnerSm} /> Criando...</>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Criar Pasta
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   ContentEditorModal — editor split-pane (texto | AI)
═══════════════════════════════════════════════════════════════════════════ */
function ContentEditorModal({ folder, account, onClose }) {
  const [contents,   setContents]   = useState([]);
  const [loadingC,   setLoadingC]   = useState(true);
  const [activeId,   setActiveId]   = useState(null);
  const [title,      setTitle]      = useState('');
  const [body,       setBody]       = useState('');
  const [hashtags,   setHashtags]   = useState('');
  const [type,       setType]       = useState('post');
  const [status,     setStatus]     = useState('draft');
  const [saving,     setSaving]     = useState(false);

  const activeContent = contents.find(c => c.id === activeId);

  /* Carrega conteúdos da pasta */
  useEffect(() => {
    if (!folder?.id) return;
    setLoadingC(true);
    fetch(`/api/social/contents?folderId=${folder.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setContents(data.contents || []);
          if (data.contents?.length > 0) selectContent(data.contents[0]);
        }
      })
      .finally(() => setLoadingC(false));
  }, [folder?.id]);

  function selectContent(c) {
    setActiveId(c.id);
    setTitle(c.title === 'Conteúdo sem título' ? '' : c.title);
    setBody(c.body || '');
    setHashtags((c.hashtags || []).join(' '));
    setType(c.type || 'post');
    setStatus(c.status || 'draft');
  }

  function newContent() {
    setActiveId(null);
    setTitle('');
    setBody('');
    setHashtags('');
    setType('post');
    setStatus('draft');
  }

  async function handleSave() {
    setSaving(true);
    try {
      const hashArr = hashtags
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(h => h.startsWith('#') ? h : `#${h}`);

      if (activeId) {
        /* Atualizar */
        const res = await fetch(`/api/social/contents?id=${activeId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title: title || 'Conteúdo sem título', body, hashtags: hashArr, type, status }),
        });
        const data = await res.json();
        if (data.success) {
          setContents(prev => prev.map(c => c.id === activeId ? data.content : c));
        }
      } else {
        /* Criar */
        const res = await fetch('/api/social/contents', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            folderId: folder.id, accountId: account?.id,
            title: title || 'Conteúdo sem título', body, hashtags: hashArr, type, status,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setContents(prev => [data.content, ...prev]);
          setActiveId(data.content.id);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remover este conteúdo?')) return;
    await fetch(`/api/social/contents?id=${id}`, { method: 'DELETE' });
    setContents(prev => prev.filter(c => c.id !== id));
    if (activeId === id) newContent();
  }

  const AI_AGENTS = [
    { name: 'Pesquisa Profunda',   icon: '🔍', desc: 'Pesquisa tendências e concorrentes para sugerir conteúdo relevante.' },
    { name: 'Copywriter',          icon: '✍️', desc: 'Gera legendas otimizadas para engajamento e conversão.' },
    { name: 'Hashtag Scout',       icon: '#',  desc: 'Analisa e sugere hashtags estratégicas por nicho.' },
    { name: 'Análise de Horário',  icon: '📊', desc: 'Sugere os melhores horários de publicação baseado no perfil.' },
  ];

  return (
    <div className={styles.editorOverlay} onClick={onClose}>
      <div className={styles.editorModal} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className={styles.editorHeader}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: folder.color || '#ff0033',
            boxShadow: `0 0 8px ${folder.color || '#ff0033'}60`,
            flexShrink: 0,
          }} />
          <div className={styles.editorHeaderBreadcrumb}>
            <span style={{ color: 'var(--text-muted)' }}>{account?.name || 'Conta'}</span>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>/</span>
            <span className="accent" style={{ color: 'var(--text-secondary)' }}>{folder.name}</span>
          </div>
          <div style={{ flex: 1 }} />

          {/* Salvar */}
          <button
            className={styles.btnConfirm}
            onClick={handleSave}
            disabled={saving}
            style={{ marginRight: 8 }}
          >
            {saving ? <><span className={styles.spinnerSm} /> Salvando</> : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                </svg>
                Salvar
              </>
            )}
          </button>

          {/* Fechar */}
          <button className={styles.editorCloseBtn} onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className={styles.editorBody}>

          {/* ─── Painel esquerdo: lista + editor ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Barra de conteúdos */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              flexShrink: 0,
              overflowX: 'auto',
            }}>
              <button
                onClick={newContent}
                style={{
                  padding: '5px 12px',
                  background: activeId === null ? 'rgba(255,0,51,0.08)' : 'transparent',
                  border: `1px solid ${activeId === null ? 'rgba(255,0,51,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 4,
                  color: activeId === null ? '#ff0033' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.15s',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Novo
              </button>

              {loadingC ? (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>carregando...</span>
              ) : (
                contents.map(c => (
                  <button
                    key={c.id}
                    onClick={() => selectContent(c)}
                    style={{
                      padding: '5px 12px',
                      background: c.id === activeId ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: `1px solid ${c.id === activeId ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                      borderRadius: 4,
                      color: c.id === activeId ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      cursor: 'pointer',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                      maxWidth: 140,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      transition: 'all 0.15s',
                    }}
                    title={c.title}
                  >
                    {c.title}
                  </button>
                ))
              )}
            </div>

            {/* Editor */}
            <div className={styles.editorLeft}>
              {/* Título */}
              <input
                className={styles.formInput}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Título do conteúdo..."
                style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)' }}
              />

              {/* Meta row: tipo + status */}
              <div className={styles.editorMetaRow}>
                <select
                  className={styles.editorSelectSmall}
                  value={type}
                  onChange={e => setType(e.target.value)}
                >
                  {CONTENT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>

                <select
                  className={styles.editorSelectSmall}
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                >
                  {CONTENT_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>

                {activeId && (
                  <button
                    onClick={() => handleDelete(activeId)}
                    style={{
                      marginLeft: 'auto',
                      padding: '6px 10px',
                      background: 'rgba(255,0,51,0.06)',
                      border: '1px solid rgba(255,0,51,0.15)',
                      borderRadius: 4,
                      color: 'rgba(255,0,51,0.6)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.06em',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,0,51,0.12)'; e.currentTarget.style.color = '#ff1a4d'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,0,51,0.06)'; e.currentTarget.style.color = 'rgba(255,0,51,0.6)'; }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                    </svg>
                    Remover
                  </button>
                )}
              </div>

              {/* Corpo do conteúdo */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 6 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                  <span>▸ Legenda / Body</span>
                  <span>{body.length} / 2200</span>
                </div>
                <textarea
                  className={styles.editorTextarea}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Escreva a legenda, roteiro ou briefing do conteúdo aqui..."
                  style={{ flex: 1, minHeight: 180 }}
                />
              </div>

              {/* Hashtags */}
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
                  letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6,
                }}>▸ Hashtags</div>
                <input
                  className={styles.editorHashtagInput}
                  value={hashtags}
                  onChange={e => setHashtags(e.target.value)}
                  placeholder="#marketing #instagram #conteudo"
                />
              </div>
            </div>
          </div>

          {/* ─── Painel direito: AI ─── */}
          <div className={styles.editorRight}>
            <div className={styles.aiPanelHeader}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
              </svg>
              <span className={styles.aiPanelTitle}>Agentes de IA</span>
              <span className={styles.aiBadge}>BETA</span>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8 }}>
              Agentes especializados para potencializar seu conteúdo. Em desenvolvimento.
            </p>

            {AI_AGENTS.map((agent, i) => (
              <div key={i} className={styles.aiAgentCard}>
                <div className={styles.aiAgentIcon}>
                  <span style={{ fontSize: 16 }}>{agent.icon}</span>
                </div>
                <div className={styles.aiAgentName}>{agent.name}</div>
                <div className={styles.aiAgentDesc}>{agent.desc}</div>
              </div>
            ))}

            {/* Nota de integração futura */}
            <div style={{
              marginTop: 8,
              padding: '12px 14px',
              background: 'rgba(255,0,51,0.04)',
              border: '1px dashed rgba(255,0,51,0.15)',
              borderRadius: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'rgba(255,0,51,0.5)',
              lineHeight: 1.6,
              letterSpacing: '0.04em',
            }}>
              // Integração com GPT-4o + pesquisa web em desenvolvimento.
              Os agentes serão ativados na próxima versão do módulo.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SocialPage — página principal
═══════════════════════════════════════════════════════════════════════════ */
export default function SocialPage() {
  const [accounts,       setAccounts]       = useState([]);
  const [selectedAccId,  setSelectedAccId]  = useState('');
  const [folders,        setFolders]        = useState([]);
  const [loadingAcc,     setLoadingAcc]     = useState(true);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [showNewFolder,  setShowNewFolder]  = useState(false);
  const [openFolder,     setOpenFolder]     = useState(null);

  const selectedAccount = accounts.find(a => a.id === selectedAccId);

  /* Carrega contas */
  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const accs = data.accounts || [];
          setAccounts(accs);
          if (accs.length > 0) setSelectedAccId(accs[0].id);
        }
      })
      .finally(() => setLoadingAcc(false));
  }, []);

  /* Carrega pastas ao trocar de conta */
  useEffect(() => {
    if (!selectedAccId) { setFolders([]); return; }
    setLoadingFolders(true);
    fetch(`/api/social/folders?accountId=${selectedAccId}`)
      .then(r => r.json())
      .then(data => { if (data.success) setFolders(data.folders || []); })
      .finally(() => setLoadingFolders(false));
  }, [selectedAccId]);

  function handleFolderCreated(folder) {
    setFolders(prev => [folder, ...prev]);
  }

  return (
    <DashboardLayout activeTab="social">
      <div className={styles.pageContainer}>

        {/* ── Cabeçalho ── */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Gerador de Copy</h1>
            <p className="page-subtitle">Crie legendas, roteiros e copies otimizados para engajamento e conversão</p>
          </div>
        </div>

        {/* ── Top panel: seleção de conta + nova pasta ── */}
        <div className={styles.topPanel}>
          <div className={styles.topPanelInner}>
            <div className={styles.topPanelLeft}>
              <div className={styles.topPanelLabel}>Instagram / Empresa</div>
              <SearchableSelect
                accounts={accounts}
                value={selectedAccId}
                onChange={setSelectedAccId}
                loading={loadingAcc}
              />
            </div>

            <button
              className={styles.btnNewFolder}
              onClick={() => setShowNewFolder(true)}
              disabled={!selectedAccId}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nova Pasta
            </button>
          </div>
        </div>

        {/* ── Grid de pastas / estados ── */}
        {!selectedAccId ? (
          <div className={styles.noAccountState}>
            <div className={styles.emptyIcon}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#525252" strokeWidth="1.5">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-8 8-8s8 4 8 8"/>
              </svg>
            </div>
            <div className={styles.emptyTitle}>Selecione um Instagram</div>
            <div className={styles.emptyDesc}>Escolha uma conta Instagram acima para ver e gerenciar o planejamento de conteúdo.</div>
            {accounts.length === 0 && (
              <a href="/dashboard/settings" className={styles.emptyAction}>
                Conectar conta
              </a>
            )}
          </div>
        ) : loadingFolders ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {[1,2,3].map(i => (
              <div key={i} className="glass-card" style={{ padding: 20, height: 160 }}>
                <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8, marginBottom: 16 }} />
                <div className="skeleton" style={{ width: '70%', height: 14, marginBottom: 10 }} />
                <div className="skeleton" style={{ width: '45%', height: 10 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.foldersGrid}>
            {folders.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,0,51,0.4)" strokeWidth="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className={styles.emptyTitle}>Nenhuma pasta criada</div>
                <div className={styles.emptyDesc}>
                  Crie sua primeira pasta para organizar o conteúdo por semana,
                  tema ou campanha. Mantenha o histórico de planejamento sempre acessível.
                </div>
                <button className={styles.emptyAction} onClick={() => setShowNewFolder(true)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Criar primeira pasta
                </button>
              </div>
            ) : (
              folders.map(folder => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  onClick={() => setOpenFolder(folder)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Modal: nova pasta ── */}
      {showNewFolder && (
        <NewFolderModal
          accountId={selectedAccId}
          onClose={() => setShowNewFolder(false)}
          onCreated={handleFolderCreated}
        />
      )}

      {/* ── Modal: editor de conteúdo ── */}
      {openFolder && (
        <ContentEditorModal
          folder={openFolder}
          account={selectedAccount}
          onClose={() => setOpenFolder(null)}
        />
      )}
    </DashboardLayout>
  );
}
