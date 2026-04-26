/**
 * pages/dashboard/image/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Home do Gerador de Imagem.
 *
 * Fluxo:
 *   1. Geração livre como PRIMEIRO card (sem cliente, ideação rápida)
 *   2. Lista de clientes em seguida (busca por nome/nicho)
 *   3. Click num cliente → FolderBrowserModal (lista pastas, CRUD inline)
 *   4. Click numa pasta → ImageGeneratorModal (designer 90%)
 *   5. Histórico admin abre como modal (não navega pra outra página)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import DashboardLayout from '../../../components/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../context/NotificationContext';
import { Icon } from '../../../components/image/ImageIcons';
import HowItWorksImage from '../../../components/image/HowItWorksImage';
import RateLimitBadge from '../../../components/image/RateLimitBadge';
import ClientCard, { GenericGenerationCard } from '../../../components/image/ClientCard';
import styles from '../../../assets/style/imageHomePage.module.css';

// Carregamento dinâmico
const FolderBrowserModal = dynamic(
  () => import('../../../components/image/FolderBrowserModal'),
  { ssr: false, loading: () => null }
);
const HistoryModal = dynamic(
  () => import('../../../components/image/HistoryModal'),
  { ssr: false, loading: () => null }
);
const ImageGeneratorModal = dynamic(
  () => import('../../../components/image/ImageGeneratorModal'),
  { ssr: false, loading: () => null }
);
const ImageGenerationOverlay = dynamic(
  () => import('../../../components/image/ImageGenerationOverlay'),
  { ssr: false, loading: () => null }
);
const ImageGenerationToast = dynamic(
  () => import('../../../components/image/ImageGenerationToast'),
  { ssr: false, loading: () => null }
);
const ImageDetailModal = dynamic(
  () => import('../../../components/image/ImageDetailModal'),
  { ssr: false, loading: () => null }
);

export default function ImagePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { notify } = useNotification();

  // ─── Estado global ───────────────────────────────────────────
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [settings, setSettings] = useState(null);

  // Map clientId → { brandbook, status }
  const [clientMeta, setClientMeta] = useState({});
  // Map clientId → { imageCount, folderCount }
  const [clientStats, setClientStats] = useState({});

  // Busca
  const [search, setSearch] = useState('');

  // Modais (em camadas)
  const [browsingClient, setBrowsingClient] = useState(null);     // pasta browser
  const [activeClient, setActiveClient] = useState(null);          // designer
  const [activeFolder, setActiveFolder] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Geração
  const [activeJob, setActiveJob] = useState(null);
  const [minimizedJobId, setMinimizedJobId] = useState(null);
  const [detailJob, setDetailJob] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [refreshRate, setRefreshRate] = useState(0);

  // ─── Load inicial ────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [clientsRes, settingsRes] = await Promise.all([
          fetch('/api/clients?limit=200'),
          fetch('/api/image/settings'),
        ]);
        const clientsJson = await clientsRes.json();
        const settingsJson = await settingsRes.json();
        if (clientsJson.success) setClients(clientsJson.clients || clientsJson.data || []);
        if (settingsJson.success) setSettings(settingsJson.data);
      } catch (err) {
        console.error('[ERRO][Frontend:ImagePage] load', err.message);
      } finally {
        setClientsLoading(false);
      }
    }
    load();
  }, []);

  // Carrega meta de cada cliente em paralelo
  useEffect(() => {
    if (!clients.length) return;
    let cancelled = false;

    async function loadMeta(client) {
      try {
        const [bbRes, jobsRes, foldersRes] = await Promise.all([
          fetch(`/api/image/brandbook/${client.id}`),
          fetch(`/api/image/jobs?clientId=${client.id}&limit=1`),
          fetch(`/api/image/folders?clientId=${client.id}`),
        ]);
        const [bb, jobs, folders] = await Promise.all([
          bbRes.json(), jobsRes.json(), foldersRes.json(),
        ]);
        if (cancelled) return;

        setClientMeta(prev => ({
          ...prev,
          [client.id]: {
            brandbook: bb?.data?.active || null,
            status: bb?.data?.active ? 'ready' : 'missing',
          },
        }));
        setClientStats(prev => ({
          ...prev,
          [client.id]: {
            imageCount: jobs?.pagination?.total || 0,
            folderCount: Array.isArray(folders?.data) ? folders.data.length : 0,
          },
        }));
      } catch {
        // best-effort
      }
    }

    clients.forEach(loadMeta);
    return () => { cancelled = true; };
  }, [clients]);

  // ─── Click em cliente → abre FolderBrowserModal ───────────────
  const handleClientClick = useCallback((client) => {
    setBrowsingClient(client);
  }, []);

  // ─── Geração livre → abre designer direto (sem folder) ────────
  const handleGenericClick = useCallback(() => {
    setActiveClient({ id: null, company_name: 'Geração livre' });
    setActiveFolder(null);
  }, []);

  // ─── FolderBrowser → click numa pasta abre o designer ─────────
  const handleSelectFolder = useCallback((folder) => {
    setActiveClient(browsingClient);
    setActiveFolder(folder);
    setBrowsingClient(null);
    // Atualiza stats local (caso pasta foi recém-criada)
    if (browsingClient?.id) {
      setClientStats(prev => ({
        ...prev,
        [browsingClient.id]: {
          ...prev[browsingClient.id],
          folderCount: Math.max(prev[browsingClient.id]?.folderCount || 0, 1),
        },
      }));
    }
  }, [browsingClient]);

  // ─── Geração ──────────────────────────────────────────────────
  const handleGenerate = useCallback((jobInfo) => {
    setActiveJob(jobInfo);
    setRefreshTrigger(k => k + 1);
    setRefreshRate(k => k + 1);
  }, []);

  const handleOverlayMinimize = useCallback((jobId) => {
    setMinimizedJobId(jobId);
    setActiveJob(null);
  }, []);

  const handleOverlayCancel = useCallback(() => {
    setActiveJob(null);
    setRefreshTrigger(k => k + 1);
    setRefreshRate(k => k + 1);
  }, []);

  const handleOverlayComplete = useCallback((job) => {
    setActiveJob(null);
    setRefreshTrigger(k => k + 1);
    setRefreshRate(k => k + 1);
    notify('Imagem gerada', 'success', { onClick: () => setDetailJob(job) });
    setDetailJob(job);
    if (job.client_id) {
      setClientStats(prev => ({
        ...prev,
        [job.client_id]: {
          ...prev[job.client_id],
          imageCount: (prev[job.client_id]?.imageCount || 0) + 1,
        },
      }));
    }
  }, [notify]);

  const handleOverlayError = useCallback(() => {
    setRefreshRate(k => k + 1);
  }, []);

  const handleToastComplete = useCallback((job) => {
    setMinimizedJobId(null);
    setRefreshTrigger(k => k + 1);
    setRefreshRate(k => k + 1);
    notify('Imagem gerada', 'success', { onClick: () => setDetailJob(job) });
  }, [notify]);

  const handleToastClose = useCallback(() => {
    setMinimizedJobId(null);
    setRefreshTrigger(k => k + 1);
  }, []);

  // ─── Filtro de busca ─────────────────────────────────────────
  const filteredClients = useMemo(() => {
    if (!search) return clients;
    const s = search.toLowerCase();
    return clients.filter(c =>
      (c.company_name || '').toLowerCase().includes(s) ||
      (c.niche || '').toLowerCase().includes(s)
    );
  }, [clients, search]);

  // ─── Render ─────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <DashboardLayout activeTab="image">
        <div style={{ padding: 60, textAlign: 'center' }}>
          <span className="spinner" style={{ width: 22, height: 22, margin: '0 auto' }} />
        </div>
      </DashboardLayout>
    );
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'god';

  return (
    <DashboardLayout activeTab="image">
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <h1 className="page-title">Gerador de Imagem</h1>
            <p className="page-subtitle">
              Crie imagens com IA usando o brandbook do cliente como guia visual
            </p>
          </div>
          <div className={styles.headerActions}>
            <RateLimitBadge
              activePolling={!!activeJob || !!minimizedJobId}
              refreshTrigger={refreshRate}
            />
            {isAdmin && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setHistoryOpen(true)}
              >
                <Icon name="clock" size={11} />
                Histórico
              </button>
            )}
            <Link href="/dashboard/settings/image" className="btn btn-secondary btn-sm">
              <Icon name="sliders" size={11} />
              Configurações
            </Link>
          </div>
        </div>

        <HowItWorksImage variant="workspace" />

        {/* Toolbar — somente busca por nome/nicho */}
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>
              <Icon name="search" size={13} />
            </span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Buscar cliente por nome ou nicho..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Section heading */}
        <div className={styles.sectionHeading}>
          <span className={styles.sectionTitle}>Onde você quer começar</span>
          <span className={styles.sectionCount}>
            {clientsLoading
              ? 'Carregando'
              : `${filteredClients.length + 1} ${filteredClients.length + 1 === 1 ? 'opção' : 'opções'}`}
          </span>
        </div>

        {/* Grid: Geração livre PRIMEIRO, depois clientes */}
        {clientsLoading ? (
          <div className={styles.grid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={styles.skeletonCard} />
            ))}
          </div>
        ) : (
          <div className={styles.grid}>
            {/* Card "Geração livre" — sempre primeiro */}
            <div
              className={`${styles.gridItem} animate-fade-in-up`}
              style={{ animationDelay: '0ms' }}
            >
              <GenericGenerationCard onOpen={handleGenericClick} />
            </div>

            {/* Cards de cliente */}
            {filteredClients.map((c, idx) => (
              <div
                key={c.id}
                className={`${styles.gridItem} animate-fade-in-up`}
                style={{ animationDelay: `${Math.min(idx + 1, 8) * 40}ms` }}
              >
                <ClientCard
                  client={c}
                  brandbookStatus={clientMeta[c.id]?.status || 'unknown'}
                  imageCount={clientStats[c.id]?.imageCount}
                  folderCount={clientStats[c.id]?.folderCount}
                  onOpen={handleClientClick}
                />
              </div>
            ))}

            {filteredClients.length === 0 && search && (
              <div className={styles.emptyClients} style={{ gridColumn: '1 / -1' }}>
                Nenhum cliente encontrado para &quot;{search}&quot;.
              </div>
            )}
            {filteredClients.length === 0 && !search && clients.length === 0 && (
              <div className={styles.emptyClients} style={{ gridColumn: '1 / -1' }}>
                Nenhum cliente cadastrado ainda.{' '}
                <Link href="/dashboard/clients">Cadastre o primeiro</Link>{' '}
                para gerar imagens com brandbook.
              </div>
            )}
          </div>
        )}
      </div>

      {/* FolderBrowser — abre quando clica num card de cliente */}
      {browsingClient && (
        <FolderBrowserModal
          client={browsingClient}
          onClose={() => setBrowsingClient(null)}
          onSelectFolder={handleSelectFolder}
        />
      )}

      {/* ImageGeneratorModal — designer 90% */}
      {activeClient && (
        <ImageGeneratorModal
          client={activeClient}
          initialFolderId={activeFolder?.id || null}
          initialFolder={activeFolder}
          brandbook={clientMeta[activeClient.id]?.brandbook || null}
          brandbookLoading={!clientMeta[activeClient.id] && !!activeClient.id}
          settings={settings}
          onClose={() => { setActiveClient(null); setActiveFolder(null); }}
          onGenerate={handleGenerate}
          refreshTrigger={refreshTrigger}
        />
      )}

      {/* HistoryModal — admin only, popup */}
      {historyOpen && isAdmin && (
        <HistoryModal
          onClose={() => setHistoryOpen(false)}
          onOpenJob={(j) => { setHistoryOpen(false); setDetailJob(j); }}
        />
      )}

      {/* Overlay de geração ativa */}
      {activeJob && (
        <ImageGenerationOverlay
          jobId={activeJob.jobId}
          model={activeJob.model}
          provider={activeJob.provider}
          onComplete={handleOverlayComplete}
          onError={handleOverlayError}
          onCancel={handleOverlayCancel}
          onMinimize={handleOverlayMinimize}
          onRetry={() => setActiveJob(null)}
        />
      )}

      {/* Toast em background */}
      {minimizedJobId && !activeJob && (
        <ImageGenerationToast
          jobId={minimizedJobId}
          onComplete={handleToastComplete}
          onError={handleToastClose}
          onClose={handleToastClose}
          onClick={(j) => { setMinimizedJobId(null); setDetailJob(j); }}
        />
      )}

      {/* Detail modal */}
      {detailJob && (
        <ImageDetailModal
          job={detailJob}
          onClose={() => setDetailJob(null)}
          onRegenerate={(j) => {
            setDetailJob(null);
            (async () => {
              try {
                const res = await fetch(`/api/image/jobs/${j.id}/regenerate`, { method: 'POST' });
                const json = await res.json();
                if (!json.success) throw new Error(json.error);
                setActiveJob({ jobId: json.data.jobId, model: j.model, provider: j.provider });
              } catch (err) { notify(`Erro: ${err.message}`, 'error'); }
            })();
          }}
          onSaveTemplate={() => {}}
          onDelete={async (j) => {
            if (!window.confirm('Apagar esta imagem?')) return;
            try {
              await fetch(`/api/image/jobs/${j.id}`, { method: 'DELETE' });
              setDetailJob(null);
              setRefreshTrigger(k => k + 1);
              notify('Imagem apagada', 'success');
            } catch (err) { notify(`Erro: ${err.message}`, 'error'); }
          }}
          onToggleStar={async (j) => {
            await fetch(`/api/image/jobs/${j.id}/star`, { method: 'POST' });
            setRefreshTrigger(k => k + 1);
            setDetailJob({ ...j, is_starred: !j.is_starred });
          }}
        />
      )}
    </DashboardLayout>
  );
}
