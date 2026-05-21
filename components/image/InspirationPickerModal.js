/**
 * @fileoverview Modal "Escolher da Arte Guia" no Image Generator
 *
 * Mostra 3 secoes: refs fixas do brandbook + templates do cliente +
 * templates globais. Operador seleciona N imagens (multi-select),
 * confirma, e o pai recebe array de URLs (e os ids pra incrementar
 * usage_count na geracao).
 *
 * Sprint Image v2 (maio/2026).
 */

import { useEffect, useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import styles from '../../assets/style/inspirationTemplates.module.css';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {function} props.onClose
 * @param {function} props.onConfirm - recebe array de { url, id, scope: 'global'|'client'|'fixed', title }
 * @param {string} [props.clientId] - se houver, carrega templates do cliente + brandbook
 * @param {number} [props.maxSelection=5]
 */
export default function InspirationPickerModal({
  open, onClose, onConfirm, clientId, maxSelection = 5,
}) {
  const { notify } = useNotification();
  const [tab, setTab] = useState('all'); // 'all' | 'fixed' | 'client' | 'global'
  const [globals, setGlobals] = useState([]);
  const [clients, setClients] = useState([]);
  const [fixedRefs, setFixedRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]); // [{ id, scope, url, title }]

  useEffect(() => {
    if (!open) return;
    setSelected([]); setTab('all');
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function loadAll() {
    setLoading(true);
    try {
      // Globais: sempre carrega
      const gRes = await fetch('/api/image/templates/global');
      const gJson = await gRes.json();
      if (gJson.success) setGlobals(gJson.data || []);

      // Cliente + brandbook: so se tem clientId
      if (clientId) {
        const [cRes, bRes] = await Promise.all([
          fetch(`/api/image/templates/client/${clientId}`),
          fetch(`/api/image/brandbook/${clientId}`),
        ]);
        const cJson = await cRes.json();
        if (cJson.success) setClients(cJson.data || []);

        try {
          const bJson = await bRes.json();
          const fixed = (() => {
            const fr = bJson?.data?.active?.fixed_references;
            if (Array.isArray(fr)) return fr;
            try { return JSON.parse(fr || '[]'); } catch { return []; }
          })();
          setFixedRefs(fixed.filter(f => f?.url));
        } catch { setFixedRefs([]); }
      }
    } catch (err) {
      console.error('[ERRO][InspirationPicker] loadAll', err);
      notify('Falha ao carregar Arte Guia', 'error');
    } finally { setLoading(false); }
  }

  function toggleSelect(item) {
    const exists = selected.find(s => s.scope === item.scope && s.id === item.id);
    if (exists) {
      setSelected(prev => prev.filter(s => !(s.scope === item.scope && s.id === item.id)));
    } else {
      if (selected.length >= maxSelection) {
        notify(`Maximo ${maxSelection} imagens selecionadas`, 'warning');
        return;
      }
      setSelected(prev => [...prev, item]);
    }
  }

  const isSelected = (scope, id) =>
    !!selected.find(s => s.scope === scope && s.id === id);

  if (!open) return null;

  const sections = [];
  if (tab === 'all' || tab === 'fixed') {
    if (fixedRefs.length) sections.push({
      key: 'fixed',
      title: `Referencias fixas do brandbook (${fixedRefs.length})`,
      items: fixedRefs.map((f, i) => ({
        id: f.url, scope: 'fixed', url: f.url, title: f.label || `Ref fixa ${i + 1}`,
      })),
    });
  }
  if (tab === 'all' || tab === 'client') {
    if (clients.length) sections.push({
      key: 'client',
      title: `Templates deste cliente (${clients.length})`,
      items: clients.map(t => ({ id: t.id, scope: 'client', url: t.url, title: t.title, thumbnail: t.thumbnail_url })),
    });
  }
  if (tab === 'all' || tab === 'global') {
    if (globals.length) sections.push({
      key: 'global',
      title: `Templates globais do tenant (${globals.length})`,
      items: globals.map(t => ({ id: t.id, scope: 'global', url: t.url, title: t.title, thumbnail: t.thumbnail_url, category: t.category })),
    });
  }

  return (
    <div className={styles.pickerBackdrop} onClick={onClose}>
      <div className={styles.pickerModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.pickerHeader}>
          <div className={styles.pickerTitle}>
            <span className={styles.pickerBadge}>ARTE GUIA</span>
            Escolher referencias visuais
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.tabsRow}>
          <button className={tab === 'all' ? styles.tabBtnActive : styles.tabBtn} onClick={() => setTab('all')}>Tudo</button>
          {!!fixedRefs.length && (
            <button className={tab === 'fixed' ? styles.tabBtnActive : styles.tabBtn} onClick={() => setTab('fixed')}>Refs Fixas ({fixedRefs.length})</button>
          )}
          {!!clients.length && (
            <button className={tab === 'client' ? styles.tabBtnActive : styles.tabBtn} onClick={() => setTab('client')}>Cliente ({clients.length})</button>
          )}
          <button className={tab === 'global' ? styles.tabBtnActive : styles.tabBtn} onClick={() => setTab('global')}>Globais ({globals.length})</button>
        </div>

        <div className={styles.pickerBody}>
          {loading ? (
            <div className={styles.loadingState}>Carregando Arte Guia...</div>
          ) : sections.length === 0 ? (
            <div className={styles.emptyState}>
              {clientId ? 'Nenhuma referencia ainda. Adicione na aba Arte Guia do cliente ou em Settings → Templates.'
                       : 'Nenhum template global cadastrado. Va em Settings → Templates de Imagem.'}
            </div>
          ) : (
            sections.map(sec => (
              <div key={sec.key} className={styles.pickerSection}>
                <div className={styles.pickerSectionTitle}>{sec.title}</div>
                <div className={styles.gridMd}>
                  {sec.items.map(it => {
                    const sel = isSelected(it.scope, it.id);
                    return (
                      <div
                        key={`${it.scope}-${it.id}`}
                        className={sel ? styles.pickerCardSelected : styles.pickerCard}
                        onClick={() => toggleSelect(it)}>
                        <img src={it.thumbnail || it.url} alt={it.title} loading="lazy" />
                        {sel && <div className={styles.pickerCardCheck}>✓</div>}
                        <div className={styles.pickerCardLabel}>{it.title}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.pickerFooter}>
          <span className={styles.selectedCount}>
            {selected.length}/{maxSelection} selecionada(s)
          </span>
          <button
            className={styles.confirmBtn}
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}>
            Usar como referencia
          </button>
        </div>
      </div>
    </div>
  );
}
