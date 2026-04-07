/**
 * pages/dashboard/social-dashboard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboarding Social — análise completa de performance do Instagram do cliente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import ClientSelect from '../../components/ClientSelect';
import { useNotification } from '../../context/NotificationContext';
import styles from '../../assets/style/socialDashboard.module.css';

const PERIODS = [
  { value: 'week',  label: 'Últimos 7 dias',  apiPeriod: 'week'  },
  { value: 'month', label: 'Últimos 30 dias', apiPeriod: 'month' },
  { value: '90d',   label: 'Últimos 90 dias', apiPeriod: 'month' },
];

function fmt(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

/* ─────────────────────────────────────────────────────────────────────────────
   Renderizador seguro de Markdown (sem dangerouslySetInnerHTML).
   Suporta: ## H2, ### H3, **bold**, *italic*, listas com -, parágrafos.
───────────────────────────────────────────────────────────────────────────── */
function renderInline(text) {
  // Quebra em tokens de bold/italic preservando ordem
  const out = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const bold = remaining.match(/^(.*?)\*\*(.+?)\*\*/);
    const italic = remaining.match(/^(.*?)\*(.+?)\*/);
    if (bold && (!italic || bold.index <= italic.index)) {
      if (bold[1]) out.push(<span key={key++}>{bold[1]}</span>);
      out.push(<strong key={key++}>{bold[2]}</strong>);
      remaining = remaining.slice(bold[0].length);
    } else if (italic) {
      if (italic[1]) out.push(<span key={key++}>{italic[1]}</span>);
      out.push(<em key={key++}>{italic[2]}</em>);
      remaining = remaining.slice(italic[0].length);
    } else {
      out.push(<span key={key++}>{remaining}</span>);
      remaining = '';
    }
  }
  return out;
}

function MarkdownView({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      blocks.push(<h2 key={key++}>{renderInline(line.slice(3))}</h2>);
      i++;
    } else if (line.startsWith('### ')) {
      blocks.push(<h3 key={key++}>{renderInline(line.slice(4))}</h3>);
      i++;
    } else if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(<li key={items.length}>{renderInline(lines[i].slice(2))}</li>);
        i++;
      }
      blocks.push(<ul key={key++}>{items}</ul>);
    } else if (line.match(/^\d+\.\s/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(<li key={items.length}>{renderInline(lines[i].replace(/^\d+\.\s/, ''))}</li>);
        i++;
      }
      blocks.push(<ol key={key++}>{items}</ol>);
    } else if (line.trim() === '') {
      i++;
    } else {
      // Parágrafo
      const paraLines = [];
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('## ') && !lines[i].startsWith('### ') && !lines[i].startsWith('- ') && !lines[i].match(/^\d+\.\s/)) {
        paraLines.push(lines[i]);
        i++;
      }
      blocks.push(<p key={key++}>{renderInline(paraLines.join(' '))}</p>);
    }
  }
  return <div className={styles.markdown}>{blocks}</div>;
}

function MetricCard({ label, value, icon }) {
  return (
    <div className={`glass-card ${styles.metricCard}`}>
      <div className={styles.metricHead}>
        <span className={styles.metricIcon}>{icon}</span>
        <span className={styles.metricLabel}>{label}</span>
      </div>
      <div className={styles.metricValue}>{fmt(value)}</div>
    </div>
  );
}

function MIcon({ d }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function postBadge(media) {
  const t = media.media_product_type || media.media_type;
  if (t === 'REELS') return { label: 'REELS', bg: 'rgba(236,72,153,0.12)', color: '#ec4899' };
  if (media.media_type === 'CAROUSEL_ALBUM') return { label: 'CARROSSEL', bg: 'rgba(99,102,241,0.12)', color: '#818cf8' };
  if (media.media_type === 'VIDEO') return { label: 'VÍDEO', bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' };
  return { label: 'FOTO', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' };
}

export default function SocialDashboardPage() {
  const { notify } = useNotification();
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [period, setPeriod] = useState('month');

  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [hasIG, setHasIG] = useState(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState('');

  /* Carrega clientes */
  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((d) => { if (d.success) setClients(d.clients || []); })
      .catch(() => notify('Erro ao carregar clientes', 'error'))
      .finally(() => setLoadingClients(false));
  }, []);

  /* Carrega insights */
  const loadInsights = useCallback(async () => {
    if (!selectedClientId) {
      setInsights(null);
      setHasIG(null);
      return;
    }
    setLoadingInsights(true);
    setInsights(null);
    try {
      const apiPeriod = PERIODS.find((p) => p.value === period)?.apiPeriod || 'month';
      const res = await fetch(`/api/instagram/insights?clientId=${selectedClientId}&period=${apiPeriod}`);
      const data = await res.json();
      if (res.status === 404) {
        setHasIG(false);
        return;
      }
      if (data.success) {
        setInsights(data);
        setHasIG(true);
      } else {
        notify(data.error || 'Erro ao carregar insights', 'error');
      }
    } catch (err) {
      notify('Falha ao carregar insights', 'error');
    } finally {
      setLoadingInsights(false);
    }
  }, [selectedClientId, period]);

  useEffect(() => { loadInsights(); }, [loadInsights]);

  async function handleGenerateAI() {
    if (!insights || !selectedClientId) return;
    setAiOpen(true);
    setAiLoading(true);
    setAiText('');
    try {
      const res = await fetch('/api/instagram/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          insights: insights.insights || {},
          recentMedia: insights.recentMedia || [],
          period,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiText(data.analysis);
      } else {
        notify(data.error || 'Falha ao gerar análise', 'error');
        setAiOpen(false);
      }
    } catch (err) {
      notify('Erro ao gerar análise', 'error');
      setAiOpen(false);
    } finally {
      setAiLoading(false);
    }
  }

  function handleCopyAI() {
    if (!aiText) return;
    navigator.clipboard.writeText(aiText)
      .then(() => notify('Análise copiada', 'success'))
      .catch(() => notify('Falha ao copiar', 'error'));
  }

  const ig = insights?.insights || {};
  const profile = insights?.profile || {};
  const recent = insights?.recentMedia || [];

  return (
    <DashboardLayout activeTab="social-dashboard">
      <div className={styles.header}>
        <div>
          <h1 className="page-title">Dashboarding Social</h1>
          <p className="page-subtitle">Análise completa de performance do Instagram</p>
        </div>
        <div className={styles.headerControls}>
          <ClientSelect
            clients={clients}
            value={selectedClientId}
            onChange={setSelectedClientId}
            loading={loadingClients}
            allowEmpty
          />
          <div className={styles.periodToggle}>
            {PERIODS.map((p) => (
              <button
                key={p.value}
                className={`${styles.periodBtn} ${period === p.value ? styles.periodBtnActive : ''}`}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!selectedClientId ? (
        <div className={`glass-card ${styles.emptyState}`}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,0,51,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <div className={styles.emptyTitle}>Selecione um cliente</div>
          <div className={styles.emptyDesc}>Escolha um cliente acima para ver o dashboard.</div>
        </div>
      ) : loadingInsights ? (
        <div className={styles.metricsGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`glass-card ${styles.metricCard}`}>
              <div className="skeleton" style={{ width: 80, height: 10, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: 100, height: 24 }} />
            </div>
          ))}
        </div>
      ) : hasIG === false ? (
        <div className={`glass-card ${styles.emptyState}`}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,0,51,0.4)" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          <div className={styles.emptyTitle}>Instagram não conectado</div>
          <div className={styles.emptyDesc}>
            Este cliente ainda não tem uma conta Instagram conectada.
          </div>
          <Link href={`/dashboard/clients/${selectedClientId}?tab=instagram`} className="sigma-btn-primary" style={{ marginTop: 16 }}>
            Conectar Instagram
          </Link>
        </div>
      ) : insights ? (
        <>
          <div className={`glass-card ${styles.profileCard}`}>
            {profile.profile_picture_url ? (
              <img src={profile.profile_picture_url} alt={profile.username} className={styles.profileAvatar} />
            ) : (
              <div className={styles.profileAvatarPlaceholder}>
                {(profile.username || '?').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className={styles.profileInfo}>
              <div className={styles.profileUsername}>@{profile.username || '—'}</div>
              <div className={styles.profileName}>{profile.name || ''}</div>
              {profile.biography && (
                <div className={styles.profileBio}>{profile.biography}</div>
              )}
              <div className={styles.profileStats}>
                <span><strong>{fmt(profile.followers_count)}</strong> seguidores</span>
                <span className={styles.statSep}>·</span>
                <span><strong>{fmt(profile.follows_count)}</strong> seguindo</span>
                <span className={styles.statSep}>·</span>
                <span><strong>{fmt(profile.media_count)}</strong> posts</span>
              </div>
            </div>
          </div>

          <div className={styles.sectionTitle}>// MÉTRICAS DO PERÍODO</div>
          <div className={styles.metricsGrid}>
            <MetricCard label="Alcance"         value={ig.reach || 0}              icon={<MIcon d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" />} />
            <MetricCard label="Views"           value={ig.views || 0}              icon={<MIcon d="M5 3l14 9-14 9V3z" />} />
            <MetricCard label="Interações"      value={ig.total_interactions || 0} icon={<MIcon d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />} />
            <MetricCard label="Contas Engajadas" value={ig.accounts_engaged || 0}  icon={<MIcon d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />} />
            <MetricCard label="Visitas Perfil"  value={ig.profile_views || 0}      icon={<MIcon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />} />
            <MetricCard label="Novos Seguidores" value={ig.follower_count || 0}    icon={<MIcon d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" />} />
          </div>

          {recent.length > 0 && (
            <div className={`glass-card ${styles.chartCard}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div className={styles.sectionTitle}>// PERFORMANCE DOS POSTS RECENTES</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  {recent.length} de {profile.media_count || recent.length} posts
                </span>
              </div>
              <div className={styles.barChart}>
                {recent.slice(0, Math.min(recent.length, 15)).reverse().map((p) => {
                  const total = (p.like_count || 0) + (p.comments_count || 0);
                  const max = Math.max(...recent.map((m) => (m.like_count || 0) + (m.comments_count || 0))) || 1;
                  const heightPct = Math.max(8, (total / max) * 100);
                  const date = p.timestamp ? new Date(p.timestamp) : null;
                  return (
                    <div key={p.id} className={styles.barCol} title={`${total} interações`}>
                      <div className={styles.barFill} style={{ height: `${heightPct}%`, maxWidth: 70 }} />
                      <div className={styles.barLabel}>
                        {date ? `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}` : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={styles.chartLegend}>
                <span><span className={styles.legendDot} /> Engajamento (likes + comentários)</span>
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <>
              <div className={styles.sectionTitle}>// POSTS RECENTES</div>
              <div className={styles.postsGrid}>
                {recent.slice(0, 8).map((p) => {
                  const badge = postBadge(p);
                  const date = p.timestamp ? new Date(p.timestamp).toLocaleDateString('pt-BR') : '—';
                  const thumb = p.thumbnail_url || p.media_url;
                  return (
                    <a key={p.id} href={p.permalink} target="_blank" rel="noopener noreferrer" className={`glass-card ${styles.postCard}`}>
                      <div className={styles.postThumb}>
                        {thumb ? (
                          <img src={thumb} alt="" />
                        ) : (
                          <div className={styles.postPlaceholder}>—</div>
                        )}
                        <span className={styles.postBadge} style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                      <div className={styles.postFooter}>
                        <div className={styles.postDate}>{date}</div>
                        <div className={styles.postStats}>
                          <span>{fmt(p.like_count)} ♡</span>
                          <span>{fmt(p.comments_count)} ◌</span>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </>
          )}

          <div className={styles.aiSection}>
            <div className={styles.aiTitle}>// ANÁLISE COM IA</div>
            <div className={styles.aiDesc}>
              Gere uma análise estratégica completa baseada nas métricas acima.
            </div>
            <button className="sigma-btn-primary" onClick={handleGenerateAI} disabled={aiLoading}>
              {aiLoading ? 'GERANDO...' : 'GERAR ANÁLISE COM IA'}
            </button>
          </div>
        </>
      ) : null}

      {aiOpen && (
        <div className={styles.aiPanelOverlay} onClick={() => setAiOpen(false)}>
          <div className={styles.aiPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.aiPanelHeader}>
              <div className={styles.aiPanelTitle}>Análise Estratégica</div>
              <button className={styles.aiPanelClose} onClick={() => setAiOpen(false)}>✕</button>
            </div>

            <div className={styles.aiPanelBody}>
              {aiLoading ? (
                <div className={styles.aiLoading}>
                  <div className="spinner" />
                  <div className={styles.aiLoadingText}>// processando dados...</div>
                </div>
              ) : (
                <MarkdownView text={aiText} />
              )}
            </div>

            <div className={styles.aiPanelFooter}>
              <button className="btn btn-secondary" onClick={handleCopyAI} disabled={!aiText}>
                Copiar análise
              </button>
              <button className="btn btn-secondary" onClick={() => setAiOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
