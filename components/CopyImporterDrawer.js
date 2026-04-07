/**
 * components/CopyImporterDrawer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drawer lateral que abre quando o usuário seleciona uma pasta no Planejamento.
 *
 * Estados:
 *   1. Lista de pastas (folder picker)
 *   2. Pasta selecionada → carrega chats (sessions) → mostra abas + texto da copy
 *   3. Botão "Copiar para legenda" → fecha + repassa o texto via onPick
 *
 * Props:
 *   open       boolean — controla visibilidade
 *   clientId   string  — cliente do contexto
 *   onClose    () => void
 *   onPick     (text) => void  — chamado quando usuário copia uma copy
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import styles from '../assets/style/copyImporterDrawer.module.css';

export default function CopyImporterDrawer({ open, clientId, onClose, onPick }) {
  const { notify } = useNotification();
  const [folders, setFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  /* Carrega pastas quando abre */
  useEffect(() => {
    if (!open || !clientId) return;
    setLoadingFolders(true);
    setSelectedFolder(null);
    setSessions([]);
    fetch(`/api/social/folders?accountId=${clientId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setFolders(d.folders || []);
        else notify('Erro ao carregar pastas', 'error');
      })
      .catch(() => notify('Falha ao carregar pastas', 'error'))
      .finally(() => setLoadingFolders(false));
  }, [open, clientId]);

  async function handleSelectFolder(folder) {
    setSelectedFolder(folder);
    setLoadingSessions(true);
    setSessions([]);
    setActiveSessionId(null);
    try {
      const res = await fetch(`/api/copy/session?folderId=${folder.id}&clientId=${clientId}`);
      const data = await res.json();
      if (data.success) {
        const list = data.data?.sessions || [];
        setSessions(list);
        if (list.length > 0) setActiveSessionId(list[0].id);
        notify(`${list.length} copy(s) carregada(s)`, 'info');
      } else {
        notify(data.error || 'Erro ao carregar copies', 'error');
      }
    } catch (err) {
      notify('Falha ao carregar copies', 'error');
    } finally {
      setLoadingSessions(false);
    }
  }

  function handlePick(text) {
    if (!text?.trim()) {
      notify('Esta copy está vazia', 'error');
      return;
    }
    onPick?.(text);
    notify('Copy importada para a legenda', 'success');
    onClose?.();
  }

  function handleBack() {
    setSelectedFolder(null);
    setSessions([]);
    setActiveSessionId(null);
  }

  if (!open) return null;

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          {selectedFolder ? (
            <>
              <button className={styles.backBtn} onClick={handleBack} title="Voltar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className={styles.headerTitle}>
                <div className={styles.titleEyebrow}>// PASTA</div>
                <div className={styles.titleMain}>{selectedFolder.name}</div>
              </div>
            </>
          ) : (
            <div className={styles.headerTitle}>
              <div className={styles.titleEyebrow}>// IMPORTAR COPY</div>
              <div className={styles.titleMain}>Selecione uma pasta</div>
            </div>
          )}
          <button className={styles.closeBtn} onClick={onClose} title="Fechar">✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {!selectedFolder ? (
            /* ─── LISTA DE PASTAS ─── */
            loadingFolders ? (
              <div className={styles.loadingState}>
                <div className="spinner" />
                <span>// carregando pastas...</span>
              </div>
            ) : folders.length === 0 ? (
              <div className={styles.emptyState}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <div>Nenhuma pasta de copy criada</div>
                <div className={styles.emptyHint}>Crie pastas no módulo Gerador de Copy</div>
              </div>
            ) : (
              <div className={styles.folderGrid}>
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className={styles.folderCard}
                    style={{ '--folder-color': folder.color || '#ff0033' }}
                    onClick={() => handleSelectFolder(folder)}
                  >
                    <div className={styles.folderIcon}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={folder.color || '#ff0033'} strokeWidth="1.8">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div className={styles.folderInfo}>
                      <div className={styles.folderName}>{folder.name}</div>
                      <div className={styles.folderMeta}>
                        {folder.content_count || 0} copy(s)
                      </div>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.folderArrow}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* ─── PASTA SELECIONADA: CHATS ─── */
            loadingSessions ? (
              <div className={styles.loadingState}>
                <div className="spinner" />
                <span>// carregando copies...</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className={styles.emptyState}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <div>Esta pasta está vazia</div>
                <div className={styles.emptyHint}>Gere copies no Gerador de Copy primeiro</div>
              </div>
            ) : (
              <>
                {/* Tabs de chats */}
                <div className={styles.tabs}>
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      className={`${styles.tab} ${activeSessionId === s.id ? styles.tabActive : ''}`}
                      onClick={() => setActiveSessionId(s.id)}
                    >
                      {s.title || 'Chat'}
                    </button>
                  ))}
                </div>

                {/* Conteúdo da copy ativa */}
                {activeSession ? (
                  <div className={styles.copyView}>
                    <div className={styles.copyMeta}>
                      <span className={styles.metaItem}>
                        <strong>Modelo:</strong> {activeSession.model_used || 'desconhecido'}
                      </span>
                      <span className={styles.metaItem}>
                        <strong>Status:</strong> {activeSession.status || 'draft'}
                      </span>
                    </div>

                    {activeSession.output_text ? (
                      <pre className={styles.copyText}>{activeSession.output_text}</pre>
                    ) : (
                      <div className={styles.copyEmpty}>// chat sem texto gerado ainda</div>
                    )}

                    <div className={styles.copyActions}>
                      <button
                        className="sigma-btn-primary"
                        onClick={() => handlePick(activeSession.output_text)}
                        disabled={!activeSession.output_text}
                      >
                        COPIAR PARA LEGENDA
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
