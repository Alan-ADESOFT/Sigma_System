/**
 * pages/dashboard/content-plan.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Planejamento de Conteúdo — calendário 7/30 dias.
 *
 * UX:
 *   · Calendário ocupa toda a largura (sem preview lateral fixo)
 *   · Click em "+" no dia abre modal limpo (Mídia + Conteúdo)
 *   · Click em post existente abre modal de edição
 *   · Botão "Importar copy de pasta" abre drawer lateral com pastas → chats
 *   · Upload de imagem/vídeo via MediaUploader (drag & drop)
 *   · Toda ação dispara notificação (sucesso / erro / info)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import ClientSelect from '../../components/ClientSelect';
import InstagramPreview from '../../components/InstagramPreview';
import MediaUploader from '../../components/MediaUploader';
import CopyImporterDrawer from '../../components/CopyImporterDrawer';
import { useNotification } from '../../context/NotificationContext';
import styles from '../../assets/style/contentPlan.module.css';

const VIEWS = [
  { value: '7',  label: '7 dias' },
  { value: '30', label: '30 dias' },
];

const MEDIA_TYPES = [
  { value: 'IMAGE',    label: 'Foto',      accept: 'image' },
  { value: 'REELS',    label: 'Reels',     accept: 'video' },
  { value: 'CAROUSEL', label: 'Carrossel', accept: 'image' },
  { value: 'STORIES',  label: 'Stories',   accept: 'both' },
];

const STATUS_COLORS = {
  draft:      { bg: 'rgba(82,82,82,0.2)',   border: 'rgba(82,82,82,0.4)',   color: '#a3a3a3' },
  scheduled:  { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)',  color: '#22c55e' },
  publishing: { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.4)', color: '#f97316' },
  published:  { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', color: '#3b82f6' },
  failed:     { bg: 'rgba(255,0,51,0.15)',   border: 'rgba(255,0,51,0.4)',   color: '#ff1a4d' },
};

const DAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function getDateRange(view) {
  const today = startOfDay(new Date());
  const days = parseInt(view, 10);
  return {
    days,
    list: Array.from({ length: days }, (_, i) => addDays(today, i)),
    from: today,
    to: addDays(today, days),
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
function PostPill({ post, onClick }) {
  const c = STATUS_COLORS[post.status] || STATUS_COLORS.draft;
  const time = new Date(post.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const thumb = post.imageUrls?.[0];
  return (
    <div
      className={styles.postPill}
      style={{ background: c.bg, borderColor: c.border, color: c.color }}
      onClick={(e) => { e.stopPropagation(); onClick?.(post); }}
    >
      {thumb ? (
        <img src={thumb} alt="" className={styles.pillThumb} />
      ) : (
        <div className={styles.pillThumbPlaceholder} />
      )}
      <div className={styles.pillBody}>
        <div className={styles.pillType}>{post.mediaType}</div>
        <div className={styles.pillTime}>{time}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   POST MODAL
═══════════════════════════════════════════════════════════ */
function PostModal({ post, clientId, account, onClose, onSaved }) {
  const { notify } = useNotification();
  const isEdit = !!post?.id;

  const [mediaType, setMediaType] = useState(post?.mediaType || 'IMAGE');

  // Estado de mídia: convertemos URLs antigas em objetos no formato do MediaUploader
  const [imageMedia, setImageMedia] = useState(
    (post?.imageUrls || []).map((url) => ({ url, kind: 'image' }))
  );
  const [videoMedia, setVideoMedia] = useState(
    post?.videoUrl ? [{ url: post.videoUrl, kind: 'video' }] : []
  );

  const [caption, setCaption] = useState(post?.caption || '');
  const [scheduledAt, setScheduledAt] = useState(
    post?.scheduledAt
      ? new Date(post.scheduledAt).toISOString().slice(0, 16)
      : new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)
  );
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleTypeChange(type) {
    setMediaType(type);
    // Limpa mídia incompatível ao trocar tipo
    if (type === 'REELS') setImageMedia([]);
    if (type === 'IMAGE' || type === 'CAROUSEL') setVideoMedia([]);
  }

  // Validação client-side antes de salvar
  function validateForm() {
    const errors = [];
    if (caption.length > 2200) errors.push('Legenda excede 2200 caracteres');
    if (mediaType === 'IMAGE' && imageMedia.length === 0) errors.push('Adicione uma imagem');
    if (mediaType === 'REELS' && videoMedia.length === 0) errors.push('Adicione um vídeo');
    if (mediaType === 'CAROUSEL' && imageMedia.length < 2) errors.push('Carrossel precisa de pelo menos 2 imagens');
    if (mediaType === 'STORIES' && imageMedia.length === 0 && videoMedia.length === 0) {
      errors.push('Adicione uma mídia para o Stories');
    }
    if (!scheduledAt) errors.push('Data e hora obrigatórias');
    return errors;
  }

  async function handleSave(targetStatus) {
    const errors = validateForm();
    if (errors.length > 0) {
      errors.forEach((e) => notify(e, 'error'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        clientId,
        mediaType,
        imageUrls: imageMedia.map((m) => m.url),
        videoUrl: videoMedia[0]?.url,
        caption,
        scheduledAt: new Date(scheduledAt).toISOString(),
        status: targetStatus,
      };
      const url = isEdit
        ? `/api/instagram/scheduled-posts?postId=${post.id}`
        : '/api/instagram/scheduled-posts';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        notify(
          isEdit
            ? 'Post atualizado'
            : targetStatus === 'scheduled' ? 'Post agendado' : 'Rascunho salvo',
          'success'
        );
        onSaved?.();
        onClose();
      } else {
        notify(data.error || 'Erro ao salvar', 'error');
      }
    } catch (err) {
      notify('Falha de rede ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    try {
      const res = await fetch(`/api/instagram/scheduled-posts?postId=${post.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        notify('Post removido', 'success');
        onSaved?.();
        onClose();
      } else {
        notify(data.error || 'Erro ao remover', 'error');
      }
    } catch {
      notify('Falha ao remover', 'error');
    }
  }

  function handlePickCopy(text) {
    setCaption(text);
  }

  // Determina o tipo aceito pelo MediaUploader baseado no mediaType
  const currentType = MEDIA_TYPES.find((t) => t.value === mediaType);
  const showImageUploader = mediaType === 'IMAGE' || mediaType === 'CAROUSEL' || mediaType === 'STORIES';
  const showVideoUploader = mediaType === 'REELS' || mediaType === 'STORIES';
  const allowMultiple = mediaType === 'CAROUSEL';

  // Para o preview
  const previewImageUrls = imageMedia.map((m) => m.url);
  const previewVideoUrl = videoMedia[0]?.url;

  return (
    <>
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <div className={styles.modalTitle}>{isEdit ? 'Editar Post' : 'Novo Post'}</div>
            <button className={styles.modalClose} onClick={onClose} title="Fechar">✕</button>
          </div>

          <div className={styles.modalBody}>
            {/* COLUNA ESQUERDA: MÍDIA + TIPO */}
            <div className={styles.modalSection}>
              <div className={styles.sectionLabel}>// MÍDIA</div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Tipo de publicação</label>
                <div className={styles.typeSelector}>
                  {MEDIA_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={`${styles.typeBtn} ${mediaType === t.value ? styles.typeBtnActive : ''}`}
                      onClick={() => handleTypeChange(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {showImageUploader && (
                <MediaUploader
                  accept="image"
                  multiple={allowMultiple}
                  value={imageMedia}
                  onChange={setImageMedia}
                  label={allowMultiple ? 'Imagens do carrossel (2+)' : 'Imagem'}
                />
              )}

              {showVideoUploader && (
                <MediaUploader
                  accept="video"
                  multiple={false}
                  value={videoMedia}
                  onChange={setVideoMedia}
                  label="Vídeo"
                />
              )}
            </div>

            {/* COLUNA CENTRAL: CONTEÚDO */}
            <div className={styles.modalSection}>
              <div className={styles.sectionLabel}>// CONTEÚDO</div>

              <div className={styles.field}>
                <div className={styles.captionHead}>
                  <label className={styles.fieldLabel}>Legenda</label>
                  <button
                    type="button"
                    className={styles.importBtn}
                    onClick={() => setDrawerOpen(true)}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    Importar de pasta
                  </button>
                </div>
                <textarea
                  className="sigma-input"
                  rows={10}
                  maxLength={2200}
                  placeholder="Escreva a legenda..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  style={{ resize: 'vertical', minHeight: 200 }}
                />
                <div className={styles.charCounter}>{caption.length} / 2200</div>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Data e hora</label>
                <input
                  className="sigma-input"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            </div>

            {/* COLUNA DIREITA: PREVIEW */}
            <div className={styles.modalPreview}>
              <div className={styles.sectionLabel}>// PREVIEW</div>
              <InstagramPreview
                mode="post"
                account={account}
                mediaType={mediaType}
                imageUrls={previewImageUrls}
                videoUrl={previewVideoUrl}
                caption={caption}
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            {isEdit && (
              <button className="btn btn-danger" onClick={handleDelete}>
                Remover
              </button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => handleSave('draft')} disabled={saving}>
                Salvar Rascunho
              </button>
              <button className="sigma-btn-primary" onClick={() => handleSave('scheduled')} disabled={saving}>
                {saving ? 'SALVANDO...' : 'AGENDAR POST'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <CopyImporterDrawer
        open={drawerOpen}
        clientId={clientId}
        onClose={() => setDrawerOpen(false)}
        onPick={handlePickCopy}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════════════════ */
export default function ContentPlanPage() {
  const { notify } = useNotification();
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [view, setView] = useState('7');

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState(null);

  const [modalPost, setModalPost] = useState(null);

  /* Carrega clientes */
  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((d) => { if (d.success) setClients(d.clients || []); })
      .catch(() => notify('Erro ao carregar clientes', 'error'))
      .finally(() => setLoadingClients(false));
  }, []);

  /* Carrega conta + posts ao trocar de cliente */
  const loadData = useCallback(async () => {
    if (!selectedClientId) {
      setPosts([]);
      setAccount(null);
      return;
    }
    setLoading(true);
    try {
      const range = getDateRange(view);
      const [postsRes, accountRes] = await Promise.all([
        fetch(`/api/instagram/scheduled-posts?clientId=${selectedClientId}&from=${range.from.toISOString()}&to=${range.to.toISOString()}`),
        fetch(`/api/instagram/account?clientId=${selectedClientId}`),
      ]);
      const postsData = await postsRes.json();
      const accountData = await accountRes.json();
      if (postsData.success) setPosts(postsData.posts || []);
      else notify('Erro ao carregar posts agendados', 'error');
      if (accountData.success) setAccount(accountData.account);
    } catch (err) {
      notify('Erro ao carregar planejamento', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedClientId, view]);

  useEffect(() => { loadData(); }, [loadData]);

  const range = getDateRange(view);
  const today = startOfDay(new Date());

  // Agrupa posts por dia
  const postsByDay = posts.reduce((acc, p) => {
    const day = isoDate(new Date(p.scheduledAt));
    if (!acc[day]) acc[day] = [];
    acc[day].push(p);
    return acc;
  }, {});

  // Stats
  const stats = {
    total: posts.length,
    draft: posts.filter((p) => p.status === 'draft').length,
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    published: posts.filter((p) => p.status === 'published').length,
  };

  return (
    <DashboardLayout activeTab="content-plan">
      <div className={styles.header}>
        <div>
          <h1 className="page-title">Planejamento de Conteúdo</h1>
          <p className="page-subtitle">Calendário editorial e agendamento de posts</p>
        </div>
        <div className={styles.headerControls}>
          <ClientSelect
            clients={clients}
            value={selectedClientId}
            onChange={setSelectedClientId}
            loading={loadingClients}
            allowEmpty
          />
          <div className={styles.viewToggle}>
            {VIEWS.map((v) => (
              <button
                key={v.value}
                className={`${styles.viewBtn} ${view === v.value ? styles.viewBtnActive : ''}`}
                onClick={() => setView(v.value)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!selectedClientId ? (
        <div className={`glass-card ${styles.emptyState}`}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,0,51,0.4)" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div className={styles.emptyTitle}>Selecione um cliente</div>
          <div className={styles.emptyDesc}>Escolha um cliente para começar a planejar conteúdo.</div>
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className={styles.statsBar}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Total</span>
              <span className={styles.statValue}>{stats.total}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Rascunhos</span>
              <span className={styles.statValue} style={{ color: '#a3a3a3' }}>{stats.draft}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Agendados</span>
              <span className={styles.statValue} style={{ color: '#22c55e' }}>{stats.scheduled}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Publicados</span>
              <span className={styles.statValue} style={{ color: '#3b82f6' }}>{stats.published}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              {!account && (
                <Link href={`/dashboard/clients/${selectedClientId}?tab=instagram`} className={styles.warningLink}>
                  ⚠ Conecte o Instagram para publicar
                </Link>
              )}
              <button
                className="sigma-btn-primary"
                onClick={() => {
                  const at = new Date();
                  at.setHours(at.getHours() + 1, 0, 0, 0);
                  setModalPost({ scheduledAt: at.toISOString() });
                }}
              >
                + NOVO POST
              </button>
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div className={styles.loadingBar}>
              <div className="spinner" />
              <span>// carregando planejamento...</span>
            </div>
          )}

          {/* CALENDÁRIO */}
          <div className={view === '7' ? styles.calendar7 : styles.calendar30}>
            {range.list.map((day) => {
              const iso = isoDate(day);
              const dayPosts = postsByDay[iso] || [];
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={iso}
                  className={`${styles.dayCell} ${isToday ? styles.dayCellToday : ''}`}
                >
                  <div className={styles.dayHeader}>
                    <span className={styles.dayNumber}>{day.getDate()}</span>
                    <span className={styles.dayLabel}>{DAY_LABELS[day.getDay()]}</span>
                    {isToday && <span className={styles.dayTodayPing} />}
                  </div>
                  <div className={styles.dayPosts}>
                    {dayPosts.map((post) => (
                      <PostPill
                        key={post.id}
                        post={post}
                        onClick={(p) => setModalPost(p)}
                      />
                    ))}
                  </div>
                  <button
                    className={styles.dayAddBtn}
                    onClick={() => {
                      const at = new Date(day);
                      at.setHours(9, 0, 0, 0);
                      setModalPost({ scheduledAt: at.toISOString() });
                    }}
                    title="Novo post neste dia"
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {modalPost && (
        <PostModal
          post={modalPost}
          clientId={selectedClientId}
          account={account}
          onClose={() => setModalPost(null)}
          onSaved={loadData}
        />
      )}
    </DashboardLayout>
  );
}
