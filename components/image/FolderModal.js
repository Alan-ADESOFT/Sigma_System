/**
 * components/image/FolderModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal para criar ou editar uma pasta. Inclui seletor de cor.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';

const COLORS = [
  '#ff0033', '#f97316', '#f59e0b', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#a3a3a3',
];

export default function FolderModal({ clientId, folder, onSave, onClose }) {
  const { notify } = useNotification();
  const [name, setName] = useState(folder?.name || '');
  const [color, setColor] = useState(folder?.color || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onEsc(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  async function submit(e) {
    e?.preventDefault?.();
    if (!name.trim()) { notify('Nome obrigatório', 'warning'); return; }
    setSaving(true);
    try {
      const url = folder?.id
        ? `/api/image/folders/${folder.id}`
        : '/api/image/folders';
      const method = folder?.id ? 'PUT' : 'POST';
      const body = folder?.id
        ? { name: name.trim(), color: color || null }
        : { clientId, name: name.trim(), color: color || null };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'falha');
      notify(folder?.id ? 'Pasta atualizada' : 'Pasta criada', 'success');
      onSave?.(json.data);
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={folder?.id ? 'Editar pasta' : 'Nova pasta'}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(5,5,5,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="glass-card animate-scale-in"
        style={{ width: 'min(420px, 92vw)', padding: 22 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="section-title" style={{ color: 'var(--text-primary)' }}>
            {folder?.id ? 'Editar pasta' : 'Nova pasta'}
          </h2>
          <button type="button" onClick={onClose} className="btn btn-icon btn-secondary" aria-label="Fechar">
            <Icon name="x" size={12} />
          </button>
        </div>

        <label className="label-micro" style={{ display: 'block', marginBottom: 6 }}>NOME</label>
        <input
          autoFocus
          type="text"
          className="sigma-input"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={80}
          placeholder="Ex: Lançamento Coleção"
        />

        <div style={{ marginTop: 14 }}>
          <label className="label-micro" style={{ display: 'block', marginBottom: 6 }}>COR</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              onClick={() => setColor('')}
              style={{
                width: 26, height: 26, borderRadius: 6,
                border: !color ? '2px solid var(--brand-500)' : '1px solid var(--border-default)',
                background: 'rgba(10,10,10,0.6)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
              }}
              title="Sem cor"
            >
              —
            </button>
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: c,
                  border: color === c ? '2px solid var(--text-primary)' : `1px solid ${c}`,
                  cursor: 'pointer',
                  outline: 'none',
                }}
                title={c}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="sigma-btn-primary" disabled={saving || !name.trim()}>
            {saving ? '...' : folder?.id ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </div>
  );
}
