/**
 * pages/dashboard/suporte/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lista de módulos da Central de Suporte (tutoriais internos).
 *
 * Leitura pra todos; criar/editar/excluir só admin/god. UI esconde botões
 * (UX) e o backend rejeita 403 (segurança).
 *
 * Grid de cards de módulo. Estado vazio com CTA pra admin criar o primeiro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import DashboardLayout, { ICONS } from '../../../components/DashboardLayout';
import SupportModuleModal from '../../../components/SupportModuleModal';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/support.module.css';

function isAdmin(user) {
  return user?.role === 'admin' || user?.role === 'god';
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconPencil() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </svg>
  );
}
function IconBook() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

export default function SupportIndexPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { notify } = useNotification();
  const admin = isAdmin(user);

  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchModules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/support/modules');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao carregar');
      setModules(data.modules || []);
    } catch (err) {
      console.error('[ERRO][Suporte:index] load', err);
      notify('Erro ao carregar módulos: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  function handleNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function handleEdit(e, m) {
    e.preventDefault();
    e.stopPropagation();
    setEditing(m);
    setModalOpen(true);
  }

  async function handleDelete(e, m) {
    e.preventDefault();
    e.stopPropagation();
    // Confirmação dupla — destrutivo (CASCADE apaga aulas e mídias do banco)
    if (!confirm(`Excluir o módulo "${m.title}"? Isso apagará todas as aulas e mídias dele.`)) return;
    if (!confirm('Tem certeza? Esta ação não pode ser desfeita.')) return;
    try {
      const res = await fetch(`/api/support/modules/${m.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha');
      console.log('[SUCESSO][Suporte:index] módulo apagado', { id: m.id });
      notify('Módulo excluído', 'success');
      fetchModules();
    } catch (err) {
      console.error('[ERRO][Suporte:index] delete', err);
      notify('Erro: ' + err.message, 'error');
    }
  }

  return (
    <DashboardLayout activeTab="suporte">
      <div className={styles.headerRow}>
        <div>
          <h1 className="page-title" style={{ margin: 0, marginBottom: 4 }}>Suporte & Tutoriais</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Base de conhecimento interna — vídeos e materiais para o time.
          </p>
        </div>
        {admin && (
          <div className={styles.headerActions}>
            <button className="sigma-btn-primary" onClick={handleNew}>
              <IconPlus /> Novo Módulo
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className={styles.modulesGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
          ))}
        </div>
      ) : modules.length === 0 ? (
        <div className="glass-card" style={{ padding: 0 }}>
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><IconBook /></span>
            <div className={styles.emptyText}>
              Nenhum tutorial cadastrado ainda.
            </div>
            {admin && (
              <button className="sigma-btn-primary" onClick={handleNew}>
                <IconPlus /> Criar primeiro módulo
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.modulesGrid}>
          {modules.map((m) => (
            <Link
              key={m.id}
              href={`/dashboard/suporte/${m.id}`}
              className={`glass-card ${styles.moduleCard}`}
            >
              {admin && (
                <div className={styles.moduleCardActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={(e) => handleEdit(e, m)}
                    title="Editar"
                  >
                    <IconPencil />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    onClick={(e) => handleDelete(e, m)}
                    title="Excluir"
                  >
                    <IconTrash />
                  </button>
                </div>
              )}
              <span className={styles.moduleIcon}>
                {ICONS[m.icon] || ICONS.book}
              </span>
              <h3 className={styles.moduleTitle}>{m.title}</h3>
              {m.description && (
                <p className={styles.moduleDescription}>{m.description}</p>
              )}
              <div className={styles.moduleFooter}>
                <span>// {m.lesson_count} {m.lesson_count === 1 ? 'aula' : 'aulas'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {modalOpen && (
        <SupportModuleModal
          module={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); fetchModules(); }}
        />
      )}
    </DashboardLayout>
  );
}
