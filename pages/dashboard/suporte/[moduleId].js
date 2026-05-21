/**
 * pages/dashboard/suporte/[moduleId].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Página de um módulo da Central de Suporte com acordeão de aulas.
 *
 * - Apenas uma aula expandida por vez (acordeão clássico).
 * - Aula expandida mostra: player do vídeo principal, lista de vídeos extras,
 *   descrição (whiteSpace pre-wrap), grid de materiais auxiliares.
 * - Lightbox simples pra imagens (modal full-screen).
 * - Admin/god veem botões de edit/delete inline; user comum só leitura.
 *
 * Performance: carrega o módulo inteiro aninhado em UMA request via
 * GET /api/support/modules/[id] (que faz no máx 2 queries no banco). Player
 * usa preload="metadata" pra não baixar vídeo até clicar play.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DashboardLayout, { ICONS } from '../../../components/DashboardLayout';
import SupportModuleModal from '../../../components/SupportModuleModal';
import SupportLessonModal from '../../../components/SupportLessonModal';
import SupportMediaModal from '../../../components/SupportMediaModal';
import SupportMediaCard from '../../../components/SupportMediaCard';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/support.module.css';

function isAdmin(user) {
  return user?.role === 'admin' || user?.role === 'god';
}

/* ─── Ícones inline ──────────────────────────────────────────────────── */
function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
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
function IconPlay() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function SupportModulePage() {
  const router = useRouter();
  const { moduleId } = router.query;
  const { user } = useAuth();
  const { notify } = useNotification();
  const admin = isAdmin(user);

  const [moduleData, setModuleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openLessonId, setOpenLessonId] = useState(null);
  // Qual vídeo está tocando em cada aula (default = primeiro)
  const [activeVideoByLesson, setActiveVideoByLesson] = useState({});

  // Lightbox de imagem
  const [lightbox, setLightbox] = useState(null);

  // Modais
  const [editModuleOpen, setEditModuleOpen] = useState(false);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [mediaModalLessonId, setMediaModalLessonId] = useState(null);
  const [editingMedia, setEditingMedia] = useState(null);

  const fetchModule = useCallback(async () => {
    if (!moduleId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/support/modules/${moduleId}`);
      const data = await res.json();
      if (!data.success) {
        if (res.status === 404) {
          notify('Módulo não encontrado', 'error');
          router.replace('/dashboard/suporte');
          return;
        }
        throw new Error(data.error || 'Falha');
      }
      setModuleData(data.module);
    } catch (err) {
      console.error('[ERRO][Suporte:module]', err);
      notify('Erro ao carregar módulo: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [moduleId, notify, router]);

  useEffect(() => {
    fetchModule();
  }, [fetchModule]);

  // ESC fecha lightbox
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e) { if (e.key === 'Escape') setLightbox(null); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  function toggleLesson(id) {
    setOpenLessonId((prev) => (prev === id ? null : id));
  }

  /* ── Mutations admin ── */

  async function handleDeleteModule() {
    if (!confirm(`Excluir o módulo "${moduleData.title}"? Apaga todas as aulas e mídias.`)) return;
    if (!confirm('Tem certeza? Esta ação não pode ser desfeita.')) return;
    try {
      const res = await fetch(`/api/support/modules/${moduleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      notify('Módulo excluído', 'success');
      router.replace('/dashboard/suporte');
    } catch (err) {
      notify('Erro: ' + err.message, 'error');
    }
  }

  async function handleDeleteLesson(lesson) {
    if (!confirm(`Excluir a aula "${lesson.title}"? Apaga as mídias dela do banco.`)) return;
    try {
      const res = await fetch(`/api/support/lessons/${lesson.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      notify('Aula excluída', 'success');
      fetchModule();
    } catch (err) {
      notify('Erro: ' + err.message, 'error');
    }
  }

  async function handleDeleteMedia(media) {
    if (!confirm(`Excluir a mídia "${media.title || media.file_name}"?`)) return;
    try {
      const res = await fetch(`/api/support/media/${media.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      notify('Mídia excluída', 'success');
      fetchModule();
    } catch (err) {
      notify('Erro: ' + err.message, 'error');
    }
  }

  /* ── Renders auxiliares ── */

  function renderLessonBody(lesson) {
    const allVideos = lesson.videos || [];
    const activeIdx = activeVideoByLesson[lesson.id] ?? 0;
    const activeVideo = allVideos[activeIdx];
    const attachments = lesson.attachments || [];

    return (
      <div className={styles.lessonBody}>
        {activeVideo && (
          <div>
            <div className={styles.sectionLabel}>// VÍDEO</div>
            <div className={styles.playerWrap}>
              <video
                key={activeVideo.id}
                src={activeVideo.file_url}
                controls
                preload="metadata"
              />
            </div>

            {allVideos.length > 1 && (
              <div className={styles.videoList} style={{ marginTop: 10 }}>
                {allVideos.map((v, idx) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`${styles.videoListItem} ${idx === activeIdx ? styles.videoListItemActive : ''}`}
                    onClick={() => setActiveVideoByLesson((prev) => ({ ...prev, [lesson.id]: idx }))}
                  >
                    <IconPlay /> {v.title || v.file_name || `Vídeo ${idx + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {lesson.description && (
          <div>
            <div className={styles.sectionLabel}>// DESCRIÇÃO</div>
            <div className={styles.lessonDesc}>{lesson.description}</div>
          </div>
        )}

        {attachments.length > 0 && (
          <div>
            <div className={styles.sectionLabel}>// MATERIAIS</div>
            <div className={styles.mediaGrid}>
              {attachments.map((att) => (
                <SupportMediaCard
                  key={att.id}
                  media={att}
                  onDelete={admin ? handleDeleteMedia : null}
                  onPreviewImage={(m) => setLightbox(m)}
                />
              ))}
            </div>
          </div>
        )}

        {admin && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className={styles.btnSecondary}
              onClick={() => { setMediaModalLessonId(lesson.id); setEditingMedia(null); }}
            >
              <IconPlus /> Adicionar mídia
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── Render principal ── */

  if (loading) {
    return (
      <DashboardLayout activeTab="suporte">
        <div className={`glass-card ${styles.moduleHeader}`}>
          <div className={`${styles.skeleton}`} style={{ width: 56, height: 56 }} />
          <div style={{ flex: 1 }}>
            <div className={`${styles.skeleton}`} style={{ height: 24, width: '40%', marginBottom: 8 }} />
            <div className={`${styles.skeleton}`} style={{ height: 16, width: '80%' }} />
          </div>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`${styles.skeleton} ${styles.skeletonLesson}`} />
        ))}
      </DashboardLayout>
    );
  }

  if (!moduleData) {
    return (
      <DashboardLayout activeTab="suporte">
        <div className={styles.emptyState}>
          <div className={styles.emptyText}>Módulo não encontrado.</div>
        </div>
      </DashboardLayout>
    );
  }

  const lessons = moduleData.lessons || [];

  return (
    <DashboardLayout activeTab="suporte">
      <div className={styles.breadcrumb}>
        <Link href="/dashboard/suporte" className={styles.breadcrumbLink}>Suporte</Link>
        <span className={styles.breadcrumbSep}>/</span>
        <span className={styles.breadcrumbCurrent}>{moduleData.title}</span>
      </div>

      <div className={`glass-card ${styles.moduleHeader}`}>
        <span className={styles.moduleHeaderIcon}>
          {ICONS[moduleData.icon] || ICONS.book}
        </span>
        <div className={styles.moduleHeaderInfo}>
          <h1 className={styles.moduleHeaderTitle}>{moduleData.title}</h1>
          {moduleData.description && (
            <p className={styles.moduleHeaderDesc}>{moduleData.description}</p>
          )}
        </div>
        {admin && (
          <div className={styles.moduleHeaderActions}>
            <button className={styles.btnSecondary} onClick={() => setEditModuleOpen(true)}>
              <IconPencil /> Editar módulo
            </button>
            <button
              className={styles.btnSecondary}
              onClick={() => { setEditingLesson(null); setLessonModalOpen(true); }}
            >
              <IconPlus /> Nova aula
            </button>
            <button
              className={styles.btnSecondary}
              onClick={handleDeleteModule}
              style={{ color: 'var(--brand-300)', borderColor: 'rgba(255,0,51,0.30)' }}
            >
              <IconTrash /> Excluir
            </button>
          </div>
        )}
      </div>

      {lessons.length === 0 ? (
        <div className="glass-card" style={{ padding: 0 }}>
          <div className={styles.emptyState}>
            <div className={styles.emptyText}>Nenhuma aula cadastrada nesse módulo.</div>
            {admin && (
              <button
                className="sigma-btn-primary"
                onClick={() => { setEditingLesson(null); setLessonModalOpen(true); }}
              >
                <IconPlus /> Criar primeira aula
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.lessonAccordion}>
          {lessons.map((lesson, idx) => {
            const isOpen = openLessonId === lesson.id;
            const vCount = (lesson.videos || []).length;
            const aCount = (lesson.attachments || []).length;
            return (
              <div
                key={lesson.id}
                className={`${styles.lessonRow} ${isOpen ? styles.lessonRowOpen : ''}`}
              >
                <div className={styles.lessonHeader} onClick={() => toggleLesson(lesson.id)}>
                  <span className={`${styles.lessonChevron} ${isOpen ? styles.lessonChevronOpen : ''}`}>
                    <IconChevron />
                  </span>
                  <span className={styles.lessonNumber}>{String(idx + 1).padStart(2, '0')}</span>
                  <span className={styles.lessonTitle}>{lesson.title}</span>
                  <span className={styles.lessonCount}>
                    {vCount} {vCount === 1 ? 'vídeo' : 'vídeos'} · {aCount} {aCount === 1 ? 'material' : 'materiais'}
                  </span>
                  {admin && (
                    <div className={styles.lessonHeaderActions} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => { setEditingLesson(lesson); setLessonModalOpen(true); }}
                        title="Editar aula"
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        onClick={() => handleDeleteLesson(lesson)}
                        title="Excluir aula"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  )}
                </div>
                {isOpen && renderLessonBody(lesson)}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Lightbox de imagem ── */}
      {lightbox && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => setLightbox(null)}
            title="Fechar"
          >
            <IconClose />
          </button>
          <img
            src={lightbox.file_url}
            alt={lightbox.title || lightbox.file_name || ''}
            className={styles.lightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── Modais admin ── */}
      {editModuleOpen && (
        <SupportModuleModal
          module={moduleData}
          onClose={() => setEditModuleOpen(false)}
          onSaved={() => { setEditModuleOpen(false); fetchModule(); }}
        />
      )}

      {lessonModalOpen && (
        <SupportLessonModal
          moduleId={moduleId}
          lesson={editingLesson}
          onClose={() => { setLessonModalOpen(false); setEditingLesson(null); }}
          onSaved={() => { setLessonModalOpen(false); setEditingLesson(null); fetchModule(); }}
        />
      )}

      {mediaModalLessonId && (
        <SupportMediaModal
          lessonId={mediaModalLessonId}
          media={editingMedia}
          onClose={() => { setMediaModalLessonId(null); setEditingMedia(null); }}
          onSaved={() => { setMediaModalLessonId(null); setEditingMedia(null); fetchModule(); }}
        />
      )}
    </DashboardLayout>
  );
}
