/**
 * components/image/TemplateModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal "Salvar como template" — usado pelo card hover ou pelo botão do
 * workspace. Recebe `sourceJob` (linha de image_jobs) e `clientId`.
 *
 * Modo "Usar" foi extraído para TemplatesList.js como sidebar persistente.
 * Esse modal é apenas pra criar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';

export default function TemplateModal({ sourceJob, clientId, onSave, onClose }) {
  const { notify } = useNotification();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onEsc(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { notify('Nome obrigatório', 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/image/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          sourceJobId: sourceJob?.id,
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'falha');
      notify('Template salvo', 'success');
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
      aria-label="Salvar como template"
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
        style={{ width: 'min(480px, 92vw)', padding: 22 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="section-title" style={{ color: 'var(--text-primary)' }}>Salvar como template</h2>
          <button type="button" onClick={onClose} className="btn btn-icon btn-secondary" aria-label="Fechar">
            <Icon name="x" size={12} />
          </button>
        </div>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
          Templates ficam salvos por cliente e podem ser reusados em gerações futuras.
          Limite: 20 templates por cliente.
        </p>

        {sourceJob?.result_thumbnail_url && (
          <div style={{
            width: 120, height: 120, borderRadius: 8,
            overflow: 'hidden', margin: '0 auto 16px',
            border: '1px solid var(--border-default)',
          }}>
            <img src={sourceJob.result_thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        <label className="label-micro" style={{ display: 'block', marginBottom: 6 }}>
          NOME <span style={{ color: 'var(--brand-500)' }}>*</span>
        </label>
        <input
          autoFocus
          className="sigma-input"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={100}
          placeholder="Ex: Post quadrado dramático"
        />

        <label className="label-micro" style={{ display: 'block', margin: '14px 0 6px' }}>DESCRIÇÃO</label>
        <textarea
          className="textarea"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="Quando usar este template..."
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="sigma-btn-primary" disabled={saving || !name.trim()}>
            {saving ? '...' : 'Salvar template'}
          </button>
        </div>
      </form>
    </div>
  );
}
