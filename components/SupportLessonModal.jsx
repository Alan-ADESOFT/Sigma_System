/**
 * components/SupportLessonModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal admin pra criar ou editar uma aula dentro de um módulo.
 *
 * Props:
 *   - moduleId: obrigatório quando criando
 *   - lesson:   registro existente (modo edit)
 *   - onClose / onSaved(lesson)
 *
 * Descrição é texto puro (whiteSpace: pre-wrap no render). Sem markdown engine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import styles from '../assets/style/support.module.css';
import { useNotification } from '../context/NotificationContext';

export default function SupportLessonModal({ moduleId, lesson, onClose, onSaved }) {
  const { notify } = useNotification();
  const isEdit = !!lesson?.id;

  const [title, setTitle] = useState(lesson?.title || '');
  const [description, setDescription] = useState(lesson?.description || '');
  const [sortOrder, setSortOrder] = useState(
    Number.isFinite(Number(lesson?.sort_order)) ? Number(lesson.sort_order) : 0
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !saving) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  async function handleSave() {
    if (!title.trim()) {
      notify('Informe o título da aula', 'warning');
      return;
    }
    if (!isEdit && !moduleId) {
      notify('moduleId obrigatório', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        sort_order: sortOrder,
      };
      if (!isEdit) payload.moduleId = moduleId;

      const res = await fetch(
        isEdit ? `/api/support/lessons/${lesson.id}` : '/api/support/lessons',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao salvar');

      console.log(`[SUCESSO][SupportLessonModal] ${isEdit ? 'editada' : 'criada'}`, { id: data.lesson?.id });
      notify(isEdit ? 'Aula atualizada' : 'Aula criada', 'success');
      onSaved && onSaved(data.lesson);
      onClose();
    } catch (err) {
      console.error('[ERRO][SupportLessonModal]', err);
      notify('Erro: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={saving ? undefined : onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEdit ? 'Editar aula' : 'Nova aula'}</h2>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label className={styles.label}>Título *</label>
            <input
              type="text"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Criando sua primeira tarefa"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Descrição</label>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={'Explicação detalhada da aula.\nUse quebras de linha à vontade — o render respeita.'}
              rows={6}
            />
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
            {saving ? 'Salvando…' : (isEdit ? 'Salvar' : 'Criar aula')}
          </button>
        </div>
      </div>
    </div>
  );
}
