/**
 * @fileoverview Galeria inline de templates de inspiracao (cliente OU global)
 *
 * Componente reutilizavel — usado dentro do BrandbookTab pra mostrar os
 * templates do CLIENTE com botao de upload + apagar inline. Tambem pode
 * ser usado em outros contextos via prop apiPath.
 *
 * Sprint Image v2 (maio/2026).
 */

import { useEffect, useState, useCallback } from 'react';
import { useNotification } from '../../context/NotificationContext';
import InspirationTemplatesUpload from './InspirationTemplatesUpload';
import styles from '../../assets/style/inspirationTemplates.module.css';

/**
 * @param {object} props
 * @param {string} props.apiPath - endpoint que faz GET (lista) e suporta DELETE?id=
 * @param {object} [props.uploadExtraBody] - body extra pro POST de criacao
 * @param {string} [props.title]
 * @param {string} [props.emptyMessage]
 */
export default function InspirationTemplatesGallery({
  apiPath, uploadExtraBody = {}, title = 'Templates de Inspiracao',
  emptyMessage = 'Nenhum template ainda. Faca upload pra comecar.',
}) {
  const { notify } = useNotification();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiPath);
      const d = await r.json();
      if (d.success) setItems(d.data || []);
    } catch (err) {
      console.error('[ERRO][InspirationGallery] load', err);
    } finally { setLoading(false); }
  }, [apiPath]);

  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    if (!window.confirm('Apagar este template?')) return;
    try {
      const r = await fetch(`${apiPath}?id=${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setItems(prev => prev.filter(it => it.id !== id));
      notify('Template apagado', 'success');
    } catch (err) { notify('Falha: ' + err.message, 'error'); }
  }

  return (
    <div className={styles.inlineGallery}>
      <div className={styles.inlineGalleryHeader}>
        <span className={styles.inlineGalleryTitle}>{title} ({items.length})</span>
        <InspirationTemplatesUpload
          apiPath={apiPath}
          extraBody={uploadExtraBody}
          onUploaded={(created) => {
            setItems(prev => [...created, ...prev]);
            notify(`${created.length} template(s) adicionado(s)`, 'success');
          }}
          label="+ Adicionar"
          variant="secondary"
        />
      </div>

      {loading ? (
        <div className={styles.loadingState}>Carregando...</div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>{emptyMessage}</div>
      ) : (
        <div className={styles.gridSm}>
          {items.map(t => (
            <div key={t.id} className={styles.card}>
              <div className={styles.thumbWrap}>
                <img src={t.thumbnail_url || t.url} alt={t.title} loading="lazy" />
                {t.usage_count > 0 && <span className={styles.usageBadge}>{t.usage_count}×</span>}
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitle} title={t.title}>{t.title}</div>
                <div className={styles.cardActions}>
                  <button
                    type="button"
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
  );
}
