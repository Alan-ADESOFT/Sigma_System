/**
 * pages/dashboard/settings/image-templates.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings page — Templates de Inspiracao GLOBAIS do tenant.
 *
 * Galeria de artes-modelo (banco de inspiracao do tenant). Qualquer cliente
 * pode usar essas templates como referencia visual ao gerar uma imagem.
 *
 * O upload de arquivo fisico vai pra /api/upload (padrao do projeto). Aqui
 * so persistimos a URL retornada + metadata (titulo + categoria).
 *
 * Sprint Image v2 (maio/2026).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/inspirationTemplates.module.css';

const CATEGORIES = [
  { value: 'feed',    label: 'Feed' },
  { value: 'story',   label: 'Story / Reels' },
  { value: 'ad',      label: 'Anuncio' },
  { value: 'banner',  label: 'Banner' },
  { value: 'capa',    label: 'Capa' },
  { value: 'quote',   label: 'Quote / Post-it' },
  { value: 'outros',  label: 'Outros' },
];

export default function ImageTemplatesPage() {
  const { notify } = useNotification();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null); // { id, title, category, ... }
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/image/templates/global?includeInactive=1');
      const d = await r.json();
      if (d.success) setItems(d.data || []);
    } catch (err) {
      console.error('[ERRO][ImageTemplates] load', err);
      notify('Falha ao carregar templates', 'error');
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  // ── Upload (multi-file) ─────────────────────────────────────────────────
  async function handleFiles(files) {
    if (!files?.length) return;
    setUploading(true);
    let okCount = 0;
    for (const file of files) {
      try {
        const form = new FormData();
        form.append('file', file);
        const upRes = await fetch('/api/upload', { method: 'POST', body: form });
        const upJson = await upRes.json();
        if (!upJson.success) throw new Error(upJson.error);

        const r = await fetch('/api/image/templates/global', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:    file.name.replace(/\.[^.]+$/, '').slice(0, 80),
            category: 'outros', // operador re-categoriza depois inline
            url:      upJson.localPath,
          }),
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.error);
        okCount += 1;
      } catch (err) {
        console.error('[ERRO][ImageTemplates] upload', { file: file.name, error: err.message });
      }
    }
    setUploading(false);
    notify(`${okCount} template(s) adicionado(s) — ajuste a categoria inline.`, 'success');
    load();
  }

  async function patch(id, body) {
    try {
      const r = await fetch(`/api/image/templates/global?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setItems(prev => prev.map(it => it.id === id ? d.data : it));
    } catch (err) { notify('Falha ao salvar: ' + err.message, 'error'); }
  }

  async function remove(id) {
    if (!window.confirm('Apagar este template? Ele deixara de aparecer pra qualquer cliente.')) return;
    try {
      const r = await fetch(`/api/image/templates/global?id=${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setItems(prev => prev.filter(it => it.id !== id));
      notify('Template apagado', 'success');
    } catch (err) { notify('Falha ao apagar: ' + err.message, 'error'); }
  }

  const filtered = filter === 'all' ? items : items.filter(it => it.category === filter);
  const counts = items.reduce((acc, it) => { acc[it.category] = (acc[it.category] || 0) + 1; return acc; }, {});

  return (
    <DashboardLayout activeTab="settings/image-templates">
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Templates de Imagem (Arte Guia global)</div>
            <div className={styles.subtitle}>
              Banco de artes-modelo do tenant. Qualquer cliente pode escolher essas
              referencias ao gerar uma imagem. Use templates de alta qualidade — eles
              definem o padrao visual padrao da agencia.
            </div>
          </div>
          <button
            className={styles.uploadBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}>
            {uploading ? 'Subindo...' : '+ Upload (1 ou mais)'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp"
            style={{ display: 'none' }}
            onChange={(e) => { handleFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
          />
        </div>

        <div className={styles.filterRow}>
          <button
            className={filter === 'all' ? styles.filterPillActive : styles.filterPill}
            onClick={() => setFilter('all')}>
            Tudo ({items.length})
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              className={filter === c.value ? styles.filterPillActive : styles.filterPill}
              onClick={() => setFilter(c.value)}>
              {c.label} ({counts[c.value] || 0})
            </button>
          ))}
        </div>

        {loading ? (
          <div className={styles.loadingState}>Carregando templates...</div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            {filter === 'all'
              ? 'Nenhum template cadastrado ainda. Faca upload pra comecar.'
              : 'Nenhum template nesta categoria.'}
          </div>
        ) : (
          <div className={styles.gridLg}>
            {filtered.map(t => (
              <div key={t.id} className={styles.card} data-inactive={!t.is_active ? 'true' : 'false'}>
                <div className={styles.thumbWrap}>
                  <img src={t.thumbnail_url || t.url} alt={t.title} loading="lazy" />
                  {!t.is_active && <span className={styles.inactiveBadge}>INATIVO</span>}
                  {t.usage_count > 0 && <span className={styles.usageBadge}>{t.usage_count}× usado</span>}
                </div>
                <div className={styles.cardBody}>
                  {editing?.id === t.id ? (
                    <input
                      autoFocus
                      defaultValue={t.title}
                      onBlur={(e) => { patch(t.id, { title: e.target.value }); setEditing(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(null); }}
                      className={styles.titleInput}
                    />
                  ) : (
                    <div className={styles.cardTitle} onClick={() => setEditing({ id: t.id })}>
                      {t.title}
                    </div>
                  )}
                  <select
                    className={styles.catSelect}
                    value={t.category}
                    onChange={(e) => patch(t.id, { category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <div className={styles.cardActions}>
                    <button
                      className={styles.smallBtn}
                      onClick={() => patch(t.id, { is_active: !t.is_active })}>
                      {t.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      className={`${styles.smallBtn} ${styles.smallBtnDanger}`}
                      onClick={() => remove(t.id)}>
                      Apagar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
