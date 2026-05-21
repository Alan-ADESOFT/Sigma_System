/**
 * components/SupportMediaModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal admin pra adicionar mídia (vídeo OU anexo) em uma aula.
 *
 * Fluxo:
 *   1. Admin escolhe tipo (Vídeo / Anexo).
 *   2. Faz upload via MediaUploader → /api/upload retorna { url, kind, size, mime }
 *   3. Modal preenche title default com o filename e abre form pra editar
 *      metadados (title, description, sort_order).
 *   4. Clica Salvar → POST /api/support/media com lessonId+kind+arquivo.
 *
 * Props:
 *   - lessonId: obrigatório quando criando
 *   - media:    registro existente (modo edit — só edita metadados, não troca arquivo)
 *   - onClose / onSaved(media)
 *
 * Em modo edit, esconde o uploader e mostra só os campos editáveis.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import styles from '../assets/style/support.module.css';
import MediaUploader from './MediaUploader';
import { useNotification } from '../context/NotificationContext';

// MIMEs aceitos no preset "anexo" do MediaUploader (PDF + DOCX/DOC + imagens)
const ATTACHMENT_ACCEPT = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
].join(',');

export default function SupportMediaModal({ lessonId, media, onClose, onSaved }) {
  const { notify } = useNotification();
  const isEdit = !!media?.id;

  // Tipo: 'video' | 'attachment'. Em edit, vem do registro existente.
  const [kind, setKind] = useState(media?.kind || 'video');

  // Resultado do upload (quando criando). Em edit, fica vazio.
  const [uploaded, setUploaded] = useState(
    isEdit ? {
      url: media.file_url,
      kind: media.kind === 'video' ? 'video' : (media.mime_type?.startsWith('image/') ? 'image' : 'document'),
      mime: media.mime_type,
      size: media.file_size_bytes,
      name: media.file_name,
    } : null
  );

  const [title, setTitle] = useState(media?.title || '');
  const [description, setDescription] = useState(media?.description || '');
  const [sortOrder, setSortOrder] = useState(
    Number.isFinite(Number(media?.sort_order)) ? Number(media.sort_order) : 0
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !saving) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  function handleUploaded(items) {
    const item = Array.isArray(items) && items[0];
    if (!item?.url) return;
    setUploaded(item);
    // Pré-preenche título com o nome do arquivo (sem extensão) se vazio
    if (!title.trim() && item.name) {
      const base = String(item.name).replace(/\.[^.]+$/, '');
      setTitle(base);
    }
  }

  async function handleSave() {
    if (!isEdit && !uploaded?.url) {
      notify('Envie um arquivo antes de salvar', 'warning');
      return;
    }
    if (!isEdit && !lessonId) {
      notify('lessonId obrigatório', 'error');
      return;
    }
    setSaving(true);
    try {
      let res, data;
      if (isEdit) {
        // Só edita metadados — não troca arquivo
        res = await fetch(`/api/support/media/${media.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim() || null,
            description: description.trim() || null,
            sort_order: sortOrder,
          }),
        });
      } else {
        res = await fetch('/api/support/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonId,
            kind,
            title: title.trim() || null,
            description: description.trim() || null,
            file_url: uploaded.url,
            file_name: uploaded.name || null,
            file_size_bytes: uploaded.size || null,
            mime_type: uploaded.mime || null,
            sort_order: sortOrder,
          }),
        });
      }
      data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao salvar');

      console.log(`[SUCESSO][SupportMediaModal] ${isEdit ? 'editada' : 'criada'}`, { id: data.media?.id, kind });
      notify(isEdit ? 'Mídia atualizada' : 'Mídia adicionada', 'success');
      onSaved && onSaved(data.media);
      onClose();
    } catch (err) {
      console.error('[ERRO][SupportMediaModal]', err);
      notify('Erro: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={saving ? undefined : onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEdit ? 'Editar mídia' : 'Adicionar mídia'}</h2>
        </div>

        <div className={styles.modalBody}>
          {!isEdit && (
            <div className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tab} ${kind === 'video' ? styles.tabActive : ''}`}
                onClick={() => { setKind('video'); setUploaded(null); }}
              >
                Vídeo
              </button>
              <button
                type="button"
                className={`${styles.tab} ${kind === 'attachment' ? styles.tabActive : ''}`}
                onClick={() => { setKind('attachment'); setUploaded(null); }}
              >
                Anexo (PDF, DOCX, Imagem)
              </button>
            </div>
          )}

          {!isEdit && (
            <div className={styles.field}>
              <label className={styles.label}>
                {kind === 'video' ? 'Arquivo de vídeo' : 'Arquivo (PDF, DOCX, imagem)'}
              </label>
              {!uploaded ? (
                <MediaUploader
                  accept={kind === 'video' ? 'video' : ATTACHMENT_ACCEPT}
                  multiple={false}
                  value={[]}
                  onChange={handleUploaded}
                />
              ) : (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(34,197,94,0.06)',
                  border: '1px solid rgba(34,197,94,0.20)',
                  borderRadius: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  color: '#86efac',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}>
                  <span>✓ {uploaded.name || 'arquivo enviado'}</span>
                  <button
                    type="button"
                    onClick={() => setUploaded(null)}
                    className={styles.btnSecondary}
                    style={{ padding: '4px 10px', fontSize: '0.6rem' }}
                  >
                    Trocar
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Título (opcional)</label>
            <input
              type="text"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Default = nome do arquivo"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Descrição (opcional)</label>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
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
          <button
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={saving || (!isEdit && !uploaded)}
          >
            {saving ? 'Salvando…' : (isEdit ? 'Salvar' : 'Adicionar')}
          </button>
        </div>
      </div>
    </div>
  );
}
