/**
 * components/comercial/NotesField.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Campo de notas com 2 modos:
 *  · view: renderiza markdown (## headers, **bold**, *italic*, listas, links)
 *  · edit: textarea editável (auto-save controlado pelo parent)
 *
 * Toggle por click. Click fora do textarea volta pra view.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import MarkdownRender from './MarkdownRender';
import styles from '../../assets/style/notesField.module.css';

export default function NotesField({
  value,
  onChange,
  placeholder = 'Anote observações sobre este lead. Use **negrito**, *itálico*, ## headings, listas com - ...',
  saving = false,
}) {
  const [editMode, setEditMode] = useState(false);
  const wrapRef = useRef(null);
  const taRef   = useRef(null);

  // Auto-foca textarea ao entrar em edit
  useEffect(() => {
    if (editMode && taRef.current) {
      taRef.current.focus();
      // Move cursor pro fim do conteúdo
      const len = taRef.current.value.length;
      taRef.current.setSelectionRange(len, len);
    }
  }, [editMode]);

  // Click fora → sai do modo edit
  useEffect(() => {
    if (!editMode) return;
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setEditMode(false);
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setEditMode(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown',   onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown',   onKey);
    };
  }, [editMode]);

  const isEmpty = !value || !String(value).trim();

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.label}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          Notas internas
        </span>

        <div className={styles.headerActions}>
          {saving && <span className={styles.savingTag}>Salvando...</span>}
          {!saving && !isEmpty && !editMode && (
            <span className={styles.savedTag}>✓ Salvo</span>
          )}
          {!editMode ? (
            <button
              type="button"
              className={styles.editBtn}
              onClick={() => setEditMode(true)}
              title="Editar"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Editar
            </button>
          ) : (
            <button
              type="button"
              className={styles.editBtn}
              onClick={() => setEditMode(false)}
              title="Concluir edição"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Pronto
            </button>
          )}
        </div>
      </div>

      {editMode ? (
        <div className={styles.editorBox}>
          <textarea
            ref={taRef}
            className={styles.textarea}
            value={value || ''}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
          />
          <div className={styles.editorHint}>
            Markdown suportado: <code>**negrito**</code> · <code>*itálico*</code> · <code># Título</code> · <code>- lista</code>
          </div>
        </div>
      ) : isEmpty ? (
        <button
          type="button"
          className={styles.emptyState}
          onClick={() => setEditMode(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5"  y1="12" x2="19" y2="12"/>
          </svg>
          Adicionar notas internas sobre este lead
        </button>
      ) : (
        <div
          className={styles.viewBox}
          onClick={() => setEditMode(true)}
          title="Clique para editar"
        >
          <MarkdownRender source={value} className={styles.rendered} />
        </div>
      )}
    </div>
  );
}
