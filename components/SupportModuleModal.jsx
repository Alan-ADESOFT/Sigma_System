/**
 * components/SupportModuleModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal admin pra criar ou editar um módulo da Central de Suporte.
 *
 * Props:
 *   - module: registro existente (modo edit). Quando null, modo create.
 *   - onClose(): fecha sem salvar
 *   - onSaved(module): chamado após save bem-sucedido (parent atualiza lista)
 *
 * O ícone é um dos do objeto ICONS do DashboardLayout — lista fixa abaixo.
 * Validação mínima: title obrigatório. Resto é opcional.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import styles from '../assets/style/support.module.css';
import { useNotification } from '../context/NotificationContext';

// Lista alinhada ao objeto ICONS do DashboardLayout — qualquer ícone aqui
// existe lá. Adicionar opção nova: incluir o SVG em DashboardLayout.ICONS antes.
const ICON_OPTIONS = [
  'book', 'zap', 'fileText', 'settings',
  'users', 'bot', 'database', 'image', 'barChart',
  'kanban', 'calendar', 'share', 'edit2',
];

export default function SupportModuleModal({ module, onClose, onSaved }) {
  const { notify } = useNotification();
  const isEdit = !!module?.id;

  const [title, setTitle] = useState(module?.title || '');
  const [description, setDescription] = useState(module?.description || '');
  const [icon, setIcon] = useState(module?.icon || 'book');
  const [sortOrder, setSortOrder] = useState(
    Number.isFinite(Number(module?.sort_order)) ? Number(module.sort_order) : 0
  );
  const [saving, setSaving] = useState(false);

  // ESC fecha
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !saving) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  async function handleSave() {
    if (!title.trim()) {
      notify('Informe o título do módulo', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        icon,
        sort_order: sortOrder,
      };
      const res = await fetch(
        isEdit ? `/api/support/modules/${module.id}` : '/api/support/modules',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao salvar');

      console.log(`[SUCESSO][SupportModuleModal] ${isEdit ? 'editado' : 'criado'}`, { id: data.module?.id });
      notify(isEdit ? 'Módulo atualizado' : 'Módulo criado', 'success');
      onSaved && onSaved(data.module);
      onClose();
    } catch (err) {
      console.error('[ERRO][SupportModuleModal]', err);
      notify('Erro: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={saving ? undefined : onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {isEdit ? 'Editar módulo' : 'Novo módulo'}
          </h2>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label className={styles.label}>Título *</label>
            <input
              type="text"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Como usar o módulo de Tarefas"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Descrição</label>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resumo curto do que esse módulo cobre…"
              rows={4}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Ícone</label>
            <div className={styles.iconGrid}>
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`${styles.iconOption} ${opt === icon ? styles.iconOptionActive : ''}`}
                  onClick={() => setIcon(opt)}
                  title={opt}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Ordem (sort_order)</label>
            <input
              type="number"
              className={styles.input}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Salvando…' : (isEdit ? 'Salvar' : 'Criar módulo')}
          </button>
        </div>
      </div>
    </div>
  );
}
