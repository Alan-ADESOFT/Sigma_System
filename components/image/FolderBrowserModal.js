/**
 * components/image/FolderBrowserModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Popup que aparece ANTES do designer quando o usuário clica num cliente.
 * Funções:
 *   · Lista as pastas existentes do cliente
 *   · Permite criar nova pasta inline
 *   · Renomear / deletar inline
 *   · Click numa pasta abre o designer (chama onSelectFolder(folder))
 *   · Estado vazio: card grande incentivando criar a primeira pasta
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/folderBrowser.module.css';

const SUGGESTIONS = [
  'Lançamento da Coleção',
  'Posts de Lifestyle',
  'Ofertas e Campanhas',
  'Identidade Visual',
];

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function FolderBrowserModal({ client, onClose, onSelectFolder }) {
  const { notify } = useNotification();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renameInputRef = useRef(null);

  // Carrega
  const load = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/image/folders?clientId=${client.id}`);
      const json = await res.json();
      if (json.success) setFolders(json.data || []);
    } catch (err) {
      console.error('[ERRO][Frontend:FolderBrowser]', err.message);
    } finally {
      setLoading(false);
    }
  }, [client?.id]);

  useEffect(() => { load(); }, [load]);

  // Esc fecha
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !creating && !renamingId) onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, creating, renamingId]);

  // Foco no rename
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  async function createFolder(e) {
    e?.preventDefault?.();
    const trimmed = newName.trim();
    if (!trimmed) {
      notify('Dê um nome para a pasta', 'warning');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/image/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, name: trimmed }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'falha ao criar');
      notify('Pasta criada', 'success');
      setNewName('');
      await load();
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setCreating(false);
    }
  }

  function startRename(folder, e) {
    e.stopPropagation();
    setRenamingId(folder.id);
    setRenameDraft(folder.name);
  }

  async function commitRename(folder) {
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === folder.name) {
      setRenamingId(null);
      return;
    }
    try {
      const res = await fetch(`/api/image/folders/${folder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'falha');
      notify('Pasta renomeada', 'success');
      setRenamingId(null);
      load();
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  async function deleteFolder(folder, e) {
    e.stopPropagation();
    const ok = window.confirm(
      `Apagar a pasta "${folder.name}"? As imagens dentro dela permanecem (folder_id ficará vazio).`
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/image/folders/${folder.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      notify('Pasta removida', 'success');
      load();
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  function handleFolderClick(folder) {
    if (renamingId === folder.id) return;
    onSelectFolder?.(folder);
  }

  const isEmpty = !loading && folders.length === 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerTitle}>{client?.company_name || 'Cliente'}</div>
            <div className={styles.headerSub}>
              {loading
                ? 'Carregando pastas...'
                : `${folders.length} ${folders.length === 1 ? 'pasta' : 'pastas'} · selecione uma para começar`}
            </div>
          </div>
          <button
            type="button"
            className={styles.headerClose}
            onClick={onClose}
            aria-label="Fechar"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Toolbar — apenas quando JÁ tem pastas (criar nova rapidamente) */}
        {!isEmpty && !loading && (
          <div className={styles.toolbar}>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(e); }}
              placeholder="Nome da nova pasta..."
              maxLength={80}
            />
            <button
              type="button"
              className="sigma-btn-primary btn-sm"
              onClick={createFolder}
              disabled={creating || !newName.trim()}
            >
              <Icon name="folderPlus" size={11} />
              {creating ? 'Criando' : 'Criar'}
            </button>
          </div>
        )}

        {/* Body */}
        <div className={styles.list}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
              <span className="spinner" style={{ width: 18, height: 18, margin: '0 auto 10px' }} />
              <div>Carregando pastas</div>
            </div>
          )}

          {isEmpty && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <Icon name="folderPlus" size={28} />
              </div>
              <h3 className={styles.emptyTitle}>
                {client?.id ? `Crie a primeira pasta de ${client.company_name}` : 'Crie sua primeira pasta'}
              </h3>
              <p className={styles.emptyDesc}>
                Pastas organizam as gerações por campanha, projeto ou tema.
                Comece com uma — você pode adicionar mais depois.
              </p>
              <form className={styles.emptyForm} onSubmit={createFolder}>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ex: Lançamento da Coleção"
                  maxLength={80}
                  autoFocus
                />
                <button
                  type="submit"
                  className="sigma-btn-primary"
                  disabled={creating || !newName.trim()}
                >
                  {creating ? 'Criando' : 'Criar'}
                </button>
              </form>
              <div className={styles.suggestions}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => setNewName(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && folders.map(f => (
            <div
              key={f.id}
              className={styles.folderRow}
              onClick={() => handleFolderClick(f)}
            >
              <div className={styles.folderIcon} style={{ color: f.color || undefined }}>
                <Icon name="folder" size={16} />
              </div>

              <div className={styles.folderInfo}>
                {renamingId === f.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    className={styles.folderNameInput}
                    value={renameDraft}
                    onChange={e => setRenameDraft(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(f);
                      if (e.key === 'Escape') { setRenamingId(null); }
                    }}
                    onBlur={() => commitRename(f)}
                    maxLength={80}
                  />
                ) : (
                  <>
                    <div className={styles.folderName}>{f.name}</div>
                    <div className={styles.folderMeta}>
                      {f.job_count || 0} {f.job_count === 1 ? 'imagem' : 'imagens'}
                      {f.created_at && ` · criada em ${fmtDate(f.created_at)}`}
                    </div>
                  </>
                )}
              </div>

              <div className={styles.folderActions}>
                <button
                  type="button"
                  className={styles.folderActionBtn}
                  onClick={e => startRename(f, e)}
                  title="Renomear"
                  aria-label="Renomear"
                >
                  <Icon name="edit" size={12} />
                </button>
                <button
                  type="button"
                  className={`${styles.folderActionBtn} ${styles.danger}`}
                  onClick={e => deleteFolder(f, e)}
                  title="Apagar"
                  aria-label="Apagar"
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>

              <span className={styles.folderArrow} aria-hidden="true">
                <Icon name="chevronRight" size={14} />
              </span>
            </div>
          ))}
        </div>

        {!isEmpty && !loading && (
          <div className={styles.footerHint}>
            Clique numa pasta para abrir o gerador de imagem
          </div>
        )}
      </div>
    </div>
  );
}
