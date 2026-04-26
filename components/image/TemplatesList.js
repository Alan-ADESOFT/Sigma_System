/**
 * components/image/TemplatesList.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lista de templates do cliente, sidebar direita do workspace.
 * Click em template: aplica nos campos do workspace via callback `onUse`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageWorkspace.module.css';

export default function TemplatesList({ clientId, onUse, refreshKey = 0 }) {
  const { notify } = useNotification();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!clientId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/image/templates?clientId=${clientId}`);
      const json = await res.json();
      if (json.success) setItems(json.data || []);
    } catch (err) {
      console.error('[ERRO][Frontend:TemplatesList]', err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function handleUse(tpl) {
    try {
      const res = await fetch(`/api/image/templates/${tpl.id}/use`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onUse?.(json.data);
      notify(`Template "${tpl.name}" aplicado`, 'success');
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  async function handleDelete(tpl, e) {
    e.stopPropagation();
    if (!window.confirm(`Apagar template "${tpl.name}"?`)) return;
    try {
      const res = await fetch(`/api/image/templates/${tpl.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      notify('Template removido', 'success');
      load();
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  const filtered = search
    ? items.filter(t => (t.name + ' ' + (t.description || '')).toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className={`glass-card ${styles.templatesPanel}`}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 4px 10px',
      }}>
        <span className="label-micro">TEMPLATES</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.55rem',
          color: 'var(--text-muted)',
        }}>
          {items.length}/20
        </span>
      </div>

      {items.length > 4 && (
        <input
          type="text"
          className="sigma-input"
          placeholder="Buscar template..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 10, fontSize: '0.75rem' }}
        />
      )}

      {loading && (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', padding: 8 }}>
          carregando...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', padding: 12, textAlign: 'center', lineHeight: 1.6 }}>
          {search
            ? 'Nenhum template encontrado'
            : 'Sem templates ainda. Salve gerações como template para reusar.'}
        </div>
      )}

      {filtered.map(t => (
        <div
          key={t.id}
          className={styles.templateCard}
          onClick={() => handleUse(t)}
          title={t.description || t.name}
        >
          {t.preview_image_url
            ? <img src={t.preview_image_url} alt="" className={styles.templatePreview} />
            : <div className={styles.templatePreview} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <Icon name="layers" size={14} />
              </div>}
          <div className={styles.templateInfo}>
            <div className={styles.templateName}>{t.name}</div>
            <div className={styles.templateMeta}>
              {t.format} · {t.usage_count || 0} usos
            </div>
          </div>
          <button
            type="button"
            className={styles.folderActionBtn}
            onClick={e => handleDelete(t, e)}
            title="Apagar"
            aria-label="Apagar template"
          >
            <Icon name="trash" size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
