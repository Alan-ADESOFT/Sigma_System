/**
 * pages/dashboard/agentes-kb.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Base de Conhecimento — Knowledge Base dos Agentes IA
 *
 * Dados de marca, produto, persona, tom de voz e concorrentes que são
 * injetados automaticamente nos prompts dos agentes via placeholders.
 *
 * Layout:
 *   · Tabs de categoria (marca / produto / persona / tom_de_voz / concorrentes)
 *   · Cada tab: lista de pares chave → valor, editáveis inline
 *   · Botão "Novo item" por categoria
 *   · Indicador de quantos itens estão cadastrados
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useNotification } from '../../context/NotificationContext';

/* ─── Configuração das categorias ──────────────────────────────────────────── */
const CATEGORIES = [
  {
    key:         'marca',
    label:       'Marca',
    placeholder: '{MARCA}',
    description: 'Nome, missão, visão, valores, história e identidade da marca',
    color:       '#ff0033',
    colorBg:     'rgba(255,0,51,0.08)',
    colorBorder: 'rgba(255,0,51,0.2)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    suggestions: ['Nome da marca', 'Missão', 'Visão', 'Valores', 'História', 'Fundadores', 'Diferenciais'],
  },
  {
    key:         'produto',
    label:       'Produto',
    placeholder: '{PRODUTO}',
    description: 'Produto ou serviço principal, funcionalidades, preço, formato e entrega',
    color:       '#3b82f6',
    colorBg:     'rgba(59,130,246,0.08)',
    colorBorder: 'rgba(59,130,246,0.2)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
    suggestions: ['Nome do produto', 'Descrição', 'Preço', 'Formato', 'Garantia', 'Bônus', 'Transformação'],
  },
  {
    key:         'persona',
    label:       'Persona',
    placeholder: '{PERSONA}',
    description: 'Público-alvo, avatar do cliente ideal, dores e desejos',
    color:       '#22c55e',
    colorBg:     'rgba(34,197,94,0.08)',
    colorBorder: 'rgba(34,197,94,0.2)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    suggestions: ['Nome do avatar', 'Idade', 'Profissão', 'Maior dor', 'Maior desejo', 'Objeção principal', 'Linguagem que usa'],
  },
  {
    key:         'tom_de_voz',
    label:       'Tom de Voz',
    placeholder: '{TOM}',
    description: 'Como a marca se comunica: adjetivos, palavras proibidas e estilo',
    color:       '#a855f7',
    colorBg:     'rgba(168,85,247,0.08)',
    colorBorder: 'rgba(168,85,247,0.2)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 18.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z"/><path d="M12 2v2"/><path d="M12 20v2"/>
        <path d="m4.22 4.22 1.42 1.42"/><path d="m18.36 18.36 1.42 1.42"/>
        <path d="M2 12h2"/><path d="M20 12h2"/>
        <path d="m4.22 19.78 1.42-1.42"/><path d="m18.36 5.64 1.42-1.42"/>
      </svg>
    ),
    suggestions: ['Tom principal', 'Adjetivos da comunicação', 'Palavras evitadas', 'Estilo de copy', 'Exemplos de headline', 'Emojis usados'],
  },
  {
    key:         'concorrentes',
    label:       'Concorrentes',
    placeholder: '{CONCORRENTES}',
    description: 'Principais concorrentes, pontos fortes e fracos, diferenciação',
    color:       '#f97316',
    colorBg:     'rgba(249,115,22,0.08)',
    colorBorder: 'rgba(249,115,22,0.2)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
      </svg>
    ),
    suggestions: ['Nome do concorrente', 'Produto principal', 'Preço', 'Promessa', 'Ponto fraco', 'Como nos diferenciamos'],
  },
];

/* ─── Ícones ────────────────────────────────────────────────────────────────── */
const Ico = {
  plus:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  edit:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  x:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  info:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  database:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
};

/* ─── Toast ─────────────────────────────────────────────────────────────────── */
function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9000 }}>
      {toasts.map(t => (
        <div key={t.id} className="animate-scale-in" style={{
          padding: '10px 16px',
          background: 'linear-gradient(145deg,rgba(17,17,17,0.98),rgba(10,10,10,0.99))',
          border: `1px solid ${t.type === 'success' ? 'rgba(34,197,94,0.3)' : t.type === 'error' ? 'rgba(255,0,51,0.3)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
          color: t.type === 'success' ? '#22c55e' : t.type === 'error' ? '#ff1a4d' : 'var(--text-secondary)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/* ─── Linha de item ─────────────────────────────────────────────────────────── */
function KbItem({ item, catColor, onSave, onDelete }) {
  const [editing,   setEditing]   = useState(false);
  const [editKey,   setEditKey]   = useState(item.key);
  const [editValue, setEditValue] = useState(item.value);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const valueRef = useRef(null);

  useEffect(() => {
    if (editing && valueRef.current) valueRef.current.focus();
  }, [editing]);

  async function save() {
    if (!editKey.trim() || !editValue.trim()) return;
    setSaving(true);
    await onSave(item.id, { key: editKey, value: editValue });
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    setEditKey(item.key);
    setEditValue(item.value);
    setEditing(false);
  }

  async function del() {
    setDeleting(true);
    await onDelete(item.id);
    setDeleting(false);
  }

  return (
    <div
      className="animate-fade-in-up"
      style={{
        padding: '12px 16px',
        background: editing ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)',
        border: `1px solid ${editing ? catColor + '33' : 'rgba(255,255,255,0.05)'}`,
        borderRadius: 8,
        transition: 'all 0.2s',
      }}
    >
      {editing ? (
        /* ── Modo edição ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={editKey}
            onChange={e => setEditKey(e.target.value)}
            placeholder="Chave (ex: nome_da_marca)"
            style={{
              width: '100%', padding: '7px 10px',
              background: 'rgba(10,10,10,0.7)',
              border: `1px solid ${catColor}44`,
              borderRadius: 5, color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
              outline: 'none',
            }}
          />
          <textarea
            ref={valueRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            placeholder="Valor..."
            rows={3}
            style={{
              width: '100%', padding: '8px 10px',
              background: 'rgba(10,10,10,0.7)',
              border: `1px solid ${catColor}44`,
              borderRadius: 5, color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)', fontSize: '0.82rem',
              lineHeight: 1.6, resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={cancel} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 4,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
              color: 'var(--text-muted)', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
            }}>
              {Ico.x} Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 4,
                background: catColor + '22',
                border: `1px solid ${catColor}44`,
                color: catColor, cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                fontWeight: 600, opacity: saving ? 0.6 : 1,
              }}
            >
              {Ico.check} {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Modo visualização ── */
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
              fontWeight: 700, color: catColor,
              letterSpacing: '0.06em', marginBottom: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.key}
            </div>
            <div style={{
              fontSize: '0.83rem', color: 'var(--text-secondary)',
              lineHeight: 1.55, wordBreak: 'break-word',
            }}>
              {item.value}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              onClick={() => setEditing(true)}
              title="Editar"
              style={{
                width: 28, height: 28, borderRadius: 5,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.05)',
                color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              {Ico.edit}
            </button>
            <button
              onClick={del}
              disabled={deleting}
              title="Remover"
              style={{
                width: 28, height: 28, borderRadius: 5,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.05)',
                color: 'var(--text-muted)', cursor: deleting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', opacity: deleting ? 0.5 : 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,0,51,0.25)'; e.currentTarget.style.color = '#ff1a4d'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              {Ico.trash}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Formulário de novo item ────────────────────────────────────────────────── */
function NewItemForm({ category, catColor, suggestions, onAdd, onCancel }) {
  const [key,   setKey]   = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const keyRef = useRef(null);

  useEffect(() => { keyRef.current?.focus(); }, []);

  async function submit() {
    if (!key.trim() || !value.trim()) return;
    setSaving(true);
    await onAdd(category, key.trim(), value.trim());
    setSaving(false);
  }

  return (
    <div
      className="animate-scale-in"
      style={{
        padding: '16px',
        background: catColor + '08',
        border: `1px solid ${catColor}33`,
        borderRadius: 10, marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: catColor, fontWeight: 700 }}>
          NOVO ITEM
        </span>
      </div>

      {/* Sugestões rápidas */}
      {suggestions?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {suggestions.map(s => (
            <button
              key={s}
              onClick={() => setKey(s)}
              style={{
                padding: '3px 8px', borderRadius: 4,
                background: key === s ? catColor + '22' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${key === s ? catColor + '44' : 'rgba(255,255,255,0.07)'}`,
                color: key === s ? catColor : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                transition: 'all 0.15s',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          ref={keyRef}
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="Chave (ex: nome_da_marca)"
          style={{
            width: '100%', padding: '8px 12px',
            background: 'rgba(10,10,10,0.7)',
            border: `1px solid ${catColor}33`,
            borderRadius: 6, color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
            outline: 'none',
          }}
        />
        <textarea
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Valor — descreva detalhadamente para enriquecer os prompts..."
          rows={4}
          style={{
            width: '100%', padding: '8px 12px',
            background: 'rgba(10,10,10,0.7)',
            border: `1px solid ${catColor}33`,
            borderRadius: 6, color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)', fontSize: '0.85rem',
            lineHeight: 1.6, resize: 'vertical', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 4,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
              color: 'var(--text-muted)', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
            }}
          >
            {Ico.x} Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving || !key.trim() || !value.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 18px', borderRadius: 4,
              background: saving || !key.trim() || !value.trim() ? 'rgba(17,17,17,0.7)' : catColor + '22',
              border: `1px solid ${saving || !key.trim() || !value.trim() ? 'rgba(255,255,255,0.06)' : catColor + '44'}`,
              color: saving || !key.trim() || !value.trim() ? 'var(--text-muted)' : catColor,
              cursor: saving || !key.trim() || !value.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
              fontWeight: 600, transition: 'all 0.2s',
            }}
          >
            {Ico.check} {saving ? 'Salvando...' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────────────────────────────────────── */
export default function AgentesKBPage() {
  const { notify } = useNotification();
  const [activeTab, setActiveTab]     = useState('marca');
  const [data, setData]               = useState({});
  const [loading, setLoading]         = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [totalItems, setTotalItems]   = useState(0);

  /* ── Toast (usa sistema global) ── */
  const addToast = useCallback((message, type = 'info') => {
    notify(message, type);
  }, [notify]);

  /* ── Carrega dados ── */
  async function loadData() {
    setLoading(true);
    console.log('[INFO][Frontend:KB] Carregando base de conhecimento');
    try {
      const r = await fetch('/api/agentes/knowledge');
      const d = await r.json();
      if (d.success) {
        setData(d.data);
        const total = Object.values(d.data).reduce((acc, arr) => acc + arr.length, 0);
        setTotalItems(total);
        console.log('[SUCESSO][Frontend:KB] KB carregada', { totalItems: total });
      }
    } catch (err) {
      console.error('[ERRO][Frontend:KB] Falha ao carregar KB', { error: err.message });
      addToast('Erro ao carregar base de conhecimento', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Adicionar item ── */
  async function handleAdd(category, key, value) {
    try {
      console.log('[INFO][Frontend:KB] Adicionando item', { category, key });
      const r = await fetch('/api/agentes/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, key, value }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      console.log('[SUCESSO][Frontend:KB] Item adicionado', { category, key, id: d.data?.id });
      addToast('Item adicionado!', 'success');
      setShowNewForm(false);
      await loadData();
    } catch (err) {
      console.error('[ERRO][Frontend:KB] Falha ao adicionar item', { error: err.message });
      addToast(err.message || 'Erro ao adicionar item', 'error');
    }
  }

  /* ── Editar item ── */
  async function handleSave(id, updates) {
    try {
      console.log('[INFO][Frontend:KB] Editando item', { id, updates });
      const r = await fetch(`/api/agentes/knowledge?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      console.log('[SUCESSO][Frontend:KB] Item atualizado', { id });
      addToast('Item atualizado!', 'success');
      await loadData();
    } catch (err) {
      console.error('[ERRO][Frontend:KB] Falha ao editar item', { error: err.message });
      addToast(err.message || 'Erro ao atualizar item', 'error');
    }
  }

  /* ── Deletar item ── */
  async function handleDelete(id) {
    try {
      console.log('[INFO][Frontend:KB] Removendo item', { id });
      const r = await fetch(`/api/agentes/knowledge?id=${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      console.log('[SUCESSO][Frontend:KB] Item removido', { id });
      addToast('Item removido', 'info');
      await loadData();
    } catch (err) {
      console.error('[ERRO][Frontend:KB] Falha ao remover item', { error: err.message });
      addToast(err.message || 'Erro ao remover item', 'error');
    }
  }

  const activeCat   = CATEGORIES.find(c => c.key === activeTab);
  const activeItems = data[activeTab] || [];

  return (
    <DashboardLayout activeTab="agentes-kb">

      {/* ── Cabeçalho ── */}
      <div className="page-header animate-fade-in-up" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,0,51,0.06)',
              border: '1px solid rgba(255,0,51,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {Ico.database}
            </div>
            <div>
              <h1 className="page-title" style={{ marginBottom: 0 }}>Base de Conhecimento</h1>
              <p className="page-subtitle" style={{ marginTop: 2 }}>
                Dados injetados automaticamente nos prompts dos agentes
              </p>
            </div>
          </div>

          {/* Total de itens + botão adicionar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!loading && (
              <span style={{
                padding: '4px 10px', borderRadius: 4,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                color: 'var(--text-muted)',
              }}>
                {totalItems} {totalItems === 1 ? 'item' : 'itens'} cadastrados
              </span>
            )}
            <button
              onClick={() => { setShowNewForm(v => !v); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 4,
                background: showNewForm
                  ? activeCat?.colorBg || 'rgba(255,0,51,0.08)'
                  : 'linear-gradient(135deg,#cc0029,#ff0033)',
                border: showNewForm
                  ? `1px solid ${activeCat?.colorBorder || 'rgba(255,0,51,0.2)'}`
                  : '1px solid rgba(255,0,51,0.4)',
                color: showNewForm ? activeCat?.color || '#ff0033' : '#fff',
                cursor: 'pointer', fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem', fontWeight: 600,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                transition: 'all 0.2s',
              }}
            >
              {Ico.plus}
              {showNewForm ? 'Cancelar' : 'Novo Item'}
            </button>
          </div>
        </div>
        <div className="divider-sweep" />
      </div>

      {/* ── Aviso: como funciona ── */}
      <div
        className="glass-card animate-fade-in-up stagger-1"
        style={{
          padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-start', gap: 10,
          borderLeft: '3px solid rgba(59,130,246,0.4)',
        }}
      >
        <span style={{ color: '#3b82f6', flexShrink: 0, marginTop: 1 }}>{Ico.info}</span>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Os dados cadastrados aqui são injetados automaticamente nos prompts dos agentes via placeholders
          <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
            {' '}{'{MARCA}'}, {'{PRODUTO}'}, {'{PERSONA}'}, {'{TOM}'}
          </strong>.
          Quanto mais detalhado, melhores serão os resultados gerados.
        </div>
      </div>

      {/* ── Tabs de categoria ── */}
      <div
        className="animate-fade-in-up stagger-2"
        style={{
          display: 'flex', gap: 6, marginBottom: 16,
          overflowX: 'auto', paddingBottom: 2,
        }}
      >
        {CATEGORIES.map(cat => {
          const count   = (data[cat.key] || []).length;
          const isActive = activeTab === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => { setActiveTab(cat.key); setShowNewForm(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 6, flexShrink: 0,
                background: isActive ? cat.colorBg : 'linear-gradient(145deg,rgba(17,17,17,0.7),rgba(10,10,10,0.8))',
                border: `1px solid ${isActive ? cat.colorBorder : 'rgba(255,255,255,0.05)'}`,
                color: isActive ? cat.color : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem', fontWeight: 600,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = cat.colorBorder; e.currentTarget.style.color = cat.color; }}}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-muted)'; }}}
            >
              <span style={{ color: isActive ? cat.color : 'var(--text-muted)', transition: 'color 0.2s' }}>
                {cat.icon}
              </span>
              {cat.label}
              {count > 0 && (
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 9,
                  background: isActive ? cat.color + '33' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${isActive ? cat.color + '55' : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
                  color: isActive ? cat.color : 'var(--text-muted)',
                  fontWeight: 700, padding: '0 4px',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Conteúdo da categoria ativa ── */}
      <div className="glass-card animate-fade-in-up stagger-3" style={{ padding: '20px 24px' }}>
        {/* Header da categoria */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ color: activeCat?.color }}>{activeCat?.icon}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
                fontWeight: 700, color: 'var(--text-primary)',
              }}>
                {activeCat?.label}
              </span>
              <span style={{
                padding: '2px 8px', borderRadius: 4,
                background: activeCat?.colorBg,
                border: `1px solid ${activeCat?.colorBorder}`,
                fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                color: activeCat?.color, fontWeight: 700,
              }}>
                {activeCat?.placeholder}
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {activeCat?.description}
            </p>
          </div>

          {/* Botão adicionar inline */}
          {!showNewForm && (
            <button
              onClick={() => setShowNewForm(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 4, flexShrink: 0,
                background: activeCat?.colorBg || 'transparent',
                border: `1px solid ${activeCat?.colorBorder || 'rgba(255,255,255,0.06)'}`,
                color: activeCat?.color || 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                fontWeight: 600, transition: 'all 0.2s',
              }}
            >
              {Ico.plus} Adicionar
            </button>
          )}
        </div>

        <div className="divider-sweep" style={{ marginBottom: 16 }} />

        {/* Formulário de novo item */}
        {showNewForm && (
          <NewItemForm
            category={activeTab}
            catColor={activeCat?.color || '#ff0033'}
            suggestions={activeCat?.suggestions || []}
            onAdd={handleAdd}
            onCancel={() => setShowNewForm(false)}
          />
        )}

        {/* Lista de itens */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 8 }} />
            ))}
          </div>
        ) : activeItems.length === 0 && !showNewForm ? (
          /* ── Empty state ── */
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: activeCat?.colorBg || 'rgba(255,0,51,0.06)',
              border: `1px solid ${activeCat?.colorBorder || 'rgba(255,0,51,0.15)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
            }}>
              <span style={{ color: activeCat?.color || '#ff0033' }}>{activeCat?.icon}</span>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
              color: 'var(--text-muted)', marginBottom: 6,
            }}>
              Nenhum dado de {activeCat?.label.toLowerCase()} cadastrado
            </div>
            <p style={{ fontSize: '0.75rem', color: '#3a3a3a', marginBottom: 16 }}>
              Adicione informações para enriquecer os prompts dos agentes
            </p>
            <button
              onClick={() => setShowNewForm(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 4,
                background: activeCat?.colorBg || 'rgba(255,0,51,0.08)',
                border: `1px solid ${activeCat?.colorBorder || 'rgba(255,0,51,0.2)'}`,
                color: activeCat?.color || '#ff0033',
                cursor: 'pointer', fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem', fontWeight: 600,
              }}
            >
              {Ico.plus} Adicionar primeiro item
            </button>
          </div>
        ) : (
          /* ── Grade de itens ── */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 10,
          }}>
            {activeItems.map(item => (
              <KbItem
                key={item.id}
                item={item}
                catColor={activeCat?.color || '#ff0033'}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
