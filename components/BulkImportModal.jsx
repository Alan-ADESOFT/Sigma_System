/**
 * components/BulkImportModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Passo 1 do fluxo "Importar Ata" — upload (texto colado OU arquivo).
 *
 * Quando o usuário clica em "Processar com IA", manda pra
 * /api/tasks/bulk-import/parse e transiciona pro <BulkImportPreview /> com o
 * resultado. O texto bruto fica guardado no estado pra o "Voltar" do preview
 * funcionar sem perder o conteúdo.
 *
 * Reuso: o pai (pages/dashboard/tasks/index.js) é quem mantém a lista de
 * users/clients/categories e passa pra cá. Não fazemos fetch interno — esse
 * conteúdo já está no contexto da página de tasks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import styles from '../assets/style/bulkImport.module.css';
import { useNotification } from '../context/NotificationContext';
import BulkImportPreview from './BulkImportPreview';

const IconClose = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconUpload = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

/* Helper: semana atual em ISO (segunda) */
function currentWeekIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function BulkImportModal({
  onClose,
  onCommitted,
  users = [],
  clients = [],
  categories = [],
  currentUserId,
}) {
  const { notify } = useNotification();
  const fileInputRef = useRef(null);

  const [mode, setMode] = useState('paste'); // paste | file
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [referenceWeek, setReferenceWeek] = useState(currentWeekIso());
  const [loading, setLoading] = useState(false);

  // Resultado do parse → renderiza preview
  const [parsed, setParsed] = useState(null);

  // ESC fecha
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !loading) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, loading]);

  function handleFilePick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      notify('Arquivo excede 5MB', 'error');
      return;
    }
    setFile(f);
  }

  async function handleProcess() {
    if (mode === 'paste' && !text.trim()) {
      notify('Cole o texto ou anexe um arquivo', 'warning');
      return;
    }
    if (mode === 'file' && !file) {
      notify('Selecione um arquivo', 'warning');
      return;
    }

    setLoading(true);
    try {
      let res;
      if (mode === 'paste') {
        res = await fetch('/api/tasks/bulk-import/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.trim(), referenceWeek }),
        });
      } else {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('referenceWeek', referenceWeek);
        if (text.trim()) fd.append('text', text.trim());
        res = await fetch('/api/tasks/bulk-import/parse', { method: 'POST', body: fd });
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha no parse');
      if (!data.tasks || data.tasks.length === 0) {
        notify('A IA não conseguiu extrair tarefas desse texto', 'warning');
        return;
      }
      console.log('[SUCESSO][bulkImport/modal] parse', { tasks: data.tasks.length });
      setParsed({ tasks: data.tasks, warnings: data.warnings || [], meta: data.meta || {} });
    } catch (err) {
      console.error('[ERRO][bulkImport/modal]', err.message);
      notify('Erro ao processar com IA: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // Se já parseou → mostra o preview (mantém o estado deste modal pra "Voltar")
  if (parsed) {
    return (
      <BulkImportPreview
        initialTasks={parsed.tasks}
        warnings={parsed.warnings}
        meta={parsed.meta}
        users={users}
        clients={clients}
        categories={categories}
        currentUserId={currentUserId}
        onBack={() => setParsed(null)}
        onClose={onClose}
        onCommitted={onCommitted}
      />
    );
  }

  return (
    <div className={styles.overlay} onClick={loading ? undefined : onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.headerTitle}>Importar Ata — Distribuição via IA</h2>
            <div className={styles.headerSubtitle}>
              Cole a ata ou anexe um arquivo. A IA distribui entre o time.
            </div>
          </div>
          <button className={styles.closeBtn} type="button" onClick={onClose} disabled={loading} title="Fechar">
            <IconClose />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${mode === 'paste' ? styles.tabActive : ''}`}
              onClick={() => setMode('paste')}
            >
              Colar texto
            </button>
            <button
              type="button"
              className={`${styles.tab} ${mode === 'file' ? styles.tabActive : ''}`}
              onClick={() => setMode('file')}
            >
              Enviar arquivo
            </button>
          </div>

          {mode === 'paste' ? (
            <div>
              <label className={styles.label}>Texto bruto</label>
              <textarea
                className={styles.textarea}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Cole aqui a ata da reunião, lista de bullets, ou parágrafo livre…"
                disabled={loading}
              />
            </div>
          ) : (
            <div>
              <label className={styles.label}>Arquivo (.txt, .md, .docx, .pdf — máx 5MB)</label>
              <div className={styles.fileBox} onClick={() => fileInputRef.current?.click()}>
                <IconUpload />
                <span className={styles.fileBoxLabel}>Clique para selecionar ou arraste o arquivo</span>
                <span className={styles.fileBoxHint}>Aceita texto, markdown, docx, pdf</span>
                {file && <span className={styles.fileBoxFile}>{file.name}</span>}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.docx,.pdf"
                  style={{ display: 'none' }}
                  onChange={handleFilePick}
                />
              </div>
            </div>
          )}

          <div>
            <label className={styles.label}>Semana de referência</label>
            <input
              type="date"
              className={styles.input}
              value={referenceWeek}
              onChange={(e) => setReferenceWeek(e.target.value)}
              disabled={loading}
            />
          </div>

          {loading && (
            <div className={styles.loadingBox}>
              <span className={styles.loadingDot} />
              <span className={styles.loadingText}>
                Processando ata com IA… (pode levar 10–30s)
              </span>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} type="button" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className={styles.btnPrimary}
            type="button"
            onClick={handleProcess}
            disabled={loading}
          >
            {loading ? 'Processando…' : 'Processar com IA'}
          </button>
        </div>
      </div>
    </div>
  );
}
