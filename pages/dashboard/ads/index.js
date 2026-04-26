/**
 * pages/dashboard/ads/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboard principal de Ads (substitui a antiga pages/dashboard/ads.js).
 *
 * Fluxo:
 *   1. Carrega lista de clientes
 *   2. Resolve cliente selecionado (URL ?clientId=X tem prioridade)
 *   3. Verifica se cliente tem conta de Ads → se não, empty state com CTA
 *   4. Carrega POST /api/ads/dashboard com KPIs, comparison, timeline,
 *      top/bottom campaigns, anomalias
 *   5. Carrega POST /api/ads/campaigns para a árvore drill-down
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';

import AdsClientSelect from '../../../components/ads/AdsClientSelect';
import AdsKpiCards from '../../../components/ads/AdsKpiCards';
import AdsTimelineChart from '../../../components/ads/AdsTimelineChart';
import AdsCampaignsTree from '../../../components/ads/AdsCampaignsTree';
import AdsAnomaliesPanel from '../../../components/ads/AdsAnomaliesPanel';
import AdsAIInsightsModal from '../../../components/ads/AdsAIInsightsModal';
import AdsBreakdownTable from '../../../components/ads/AdsBreakdownTable';
import AdsPublicShareModal from '../../../components/ads/AdsPublicShareModal';

import styles from '../../../assets/style/ads.module.css';

const DATE_PRESETS = [
  { value: 'today',       label: 'Hoje' },
  { value: 'yesterday',   label: 'Ontem' },
  { value: 'last_7d',     label: '7 dias' },
  { value: 'last_14d',    label: '14 dias' },
  { value: 'last_30d',    label: '30 dias' },
  { value: 'last_90d',    label: '90 dias' },
  { value: 'this_month',  label: 'Este mês' },
  { value: 'last_month',  label: 'Mês passado' },
];

export default function AdsPage() {
  const router = useRouter();
  const { notify } = useNotification();

  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [datePreset, setDatePreset] = useState('last_30d');

  const [account, setAccount] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(false);

  const [dashboard, setDashboard] = useState(null);
  const [hierarchy, setHierarchy] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);
  const [error, setError] = useState(null);

  const [activeView, setActiveView] = useState('campaigns'); // 'campaigns' | 'breakdown'
  const [aiTarget, setAiTarget] = useState(null); // { scope, targetId, targetName }
  const [showShare, setShowShare] = useState(false);
  const [busyActionId, setBusyActionId] = useState(null);

  /* ── carrega clientes ────────────────────────────────────────────────── */
  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((d) => { if (d.success) setClients(d.clients || []); else notify(d.error || 'Falha ao carregar clientes', 'error'); })
      .catch(() => notify('Falha ao carregar clientes', 'error'))
      .finally(() => setLoadingClients(false));
  }, []);

  /* ── pré-seleciona ?clientId= ────────────────────────────────────────── */
  useEffect(() => {
    if (!router.isReady) return;
    const fromQuery = router.query.clientId;
    if (typeof fromQuery === 'string' && fromQuery && fromQuery !== selectedClientId) {
      setSelectedClientId(fromQuery);
    }
  }, [router.isReady, router.query.clientId]);

  /* ── carrega conta ───────────────────────────────────────────────────── */
  const loadAccount = useCallback(async () => {
    if (!selectedClientId) { setAccount(null); return; }
    setLoadingAccount(true);
    try {
      const r = await fetch(`/api/ads/accounts/by-client/${selectedClientId}`);
      const d = await r.json();
      setAccount(d.success ? d.account : null);
    } catch {
      setAccount(null);
    } finally {
      setLoadingAccount(false);
    }
  }, [selectedClientId]);
  useEffect(() => { loadAccount(); }, [loadAccount]);

  /* ── carrega dashboard + campanhas ───────────────────────────────────── */
  const loadDashboard = useCallback(async () => {
    if (!selectedClientId || !account) { setDashboard(null); setHierarchy(null); return; }
    setLoadingDashboard(true);
    setLoadingHierarchy(true);
    setError(null);
    try {
      const [dashRes, hierRes] = await Promise.all([
        fetch('/api/ads/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: selectedClientId, datePreset }),
        }),
        fetch('/api/ads/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: selectedClientId, datePreset, includeSets: true, includeAds: true }),
        }),
      ]);
      const [dashData, hierData] = await Promise.all([dashRes.json(), hierRes.json()]);

      if (!dashData.success) throw new Error(dashData.error || 'Falha no dashboard');
      setDashboard(dashData);
      setLoadingDashboard(false);

      if (!hierData.success) throw new Error(hierData.error || 'Falha nas campanhas');
      // injeta adsets em cada campanha por campaign_id e ads em cada adset por adset_id
      const adsetsByCampaign = new Map();
      (hierData.adSets || []).forEach((s) => {
        const arr = adsetsByCampaign.get(s.campaign_id) || [];
        arr.push(s);
        adsetsByCampaign.set(s.campaign_id, arr);
      });
      const adsByAdset = new Map();
      (hierData.ads || []).forEach((a) => {
        const arr = adsByAdset.get(a.adset_id) || [];
        arr.push(a);
        adsByAdset.set(a.adset_id, arr);
      });
      const enriched = (hierData.campaigns || []).map((c) => ({
        ...c,
        adsets: (adsetsByCampaign.get(c.id) || []).map((s) => ({
          ...s,
          ads: adsByAdset.get(s.id) || [],
        })),
      }));
      setHierarchy(enriched);
    } catch (err) {
      setError(err.message);
      notify(err.message, 'error');
    } finally {
      setLoadingDashboard(false);
      setLoadingHierarchy(false);
    }
  }, [selectedClientId, account, datePreset, notify]);
  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  /* ── ações ───────────────────────────────────────────────────────────── */
  async function doAction(obj, level, action) {
    setBusyActionId(obj.id);
    try {
      const r = await fetch('/api/ads/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClientId, action, level, targetId: obj.id }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha na ação');
      notify(action === 'pause' ? 'Pausado' : 'Retomado', 'success');
      loadDashboard();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusyActionId(null);
    }
  }

  async function ackAnomaly(anomaly) {
    try {
      const r = await fetch('/api/ads/anomalies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anomalyId: anomaly.id, action: 'ack' }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      notify('Anomalia reconhecida', 'success');
      setDashboard((prev) => prev && {
        ...prev,
        anomalies: (prev.anomalies || []).filter((a) => a.id !== anomaly.id),
      });
    } catch (e) { notify(e.message, 'error'); }
  }
  async function resolveAnomaly(anomaly) {
    try {
      const r = await fetch('/api/ads/anomalies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anomalyId: anomaly.id, action: 'resolve' }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      notify('Anomalia resolvida', 'success');
      setDashboard((prev) => prev && {
        ...prev,
        anomalies: (prev.anomalies || []).filter((a) => a.id !== anomaly.id),
      });
    } catch (e) { notify(e.message, 'error'); }
  }

  /* ── render ──────────────────────────────────────────────────────────── */
  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <DashboardLayout activeTab="ads">
      {/* HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className="page-title">Campanhas Ads</h1>
          <p className="page-subtitle">Visão geral, diagnóstico de IA e ações sobre as campanhas Meta</p>
        </div>
        <div className={styles.headerControls}>
          <AdsClientSelect
            clients={clients}
            value={selectedClientId}
            onChange={(id) => {
              setSelectedClientId(id);
              router.replace({ pathname: router.pathname, query: id ? { clientId: id } : {} }, undefined, { shallow: true });
            }}
            loading={loadingClients}
          />
          <select
            className={styles.dateSelect}
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            disabled={!account}
          >
            {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* SEM CLIENTE SELECIONADO */}
      {!selectedClientId && (
        <div className={`glass-card ${styles.emptyState}`}>
          <div className={styles.emptyIcon} aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 22-7z" />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>Selecione um cliente</h2>
          <p className={styles.emptyText}>Escolha um cliente acima para visualizar o dashboard de Ads.</p>
        </div>
      )}

      {/* CLIENTE SEM CONTA CONECTADA */}
      {selectedClientId && !loadingAccount && !account && (
        <div className={`glass-card ${styles.emptyState}`}>
          <div className={styles.emptyIcon} aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>Conta de Ads não conectada</h2>
          <p className={styles.emptyText}>
            {selectedClient?.company_name || 'Este cliente'} ainda não tem uma conta Meta Ads vinculada.
          </p>
          <Link href={`/dashboard/clients/${selectedClientId}?tab=ads`} className="sigma-btn-primary">
            Ir para o perfil do cliente
          </Link>
        </div>
      )}

      {/* DASHBOARD */}
      {selectedClientId && account && (
        <>
          <AdsAnomaliesPanel
            anomalies={dashboard?.anomalies || []}
            onAcknowledge={ackAnomaly}
            onResolve={resolveAnomaly}
          />

          <AdsKpiCards
            kpiSummary={dashboard?.kpiSummary}
            comparison={dashboard?.comparison}
            loading={loadingDashboard}
          />

          {dashboard?.timeline && (
            <AdsTimelineChart timeline={dashboard.timeline} initialMetric="spend" />
          )}

          <div className={styles.viewSwitcher} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'campaigns'}
              className={`${styles.viewBtn} ${activeView === 'campaigns' ? styles.viewBtnActive : ''}`}
              onClick={() => setActiveView('campaigns')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              Campanhas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'breakdown'}
              className={`${styles.viewBtn} ${activeView === 'breakdown' ? styles.viewBtnActive : ''}`}
              onClick={() => setActiveView('breakdown')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" style={{ display: 'none' }}/>
                <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
              </svg>
              Segmentação
            </button>
          </div>

          {/* key={activeView} desmonta um conteúdo antes de montar o outro,
              evitando qualquer sobreposição visual entre as abas */}
          <div key={activeView}>
            {activeView === 'campaigns' ? (
              <div className={`glass-card ${styles.tableCard}`}>
                {loadingHierarchy ? (
                  <div className={styles.emptyTable}>
                    <span className={styles.inlineSpinner} aria-hidden="true" />
                    Carregando campanhas...
                  </div>
                ) : (
                  <AdsCampaignsTree
                    campaigns={hierarchy || []}
                    busyId={busyActionId}
                    onPause={(o, l) => doAction(o, l, 'pause')}
                    onResume={(o, l) => doAction(o, l, 'resume')}
                    onAnalyze={(scope, targetId, targetName) => setAiTarget({ scope, targetId, targetName })}
                  />
                )}
              </div>
            ) : (
              <div className={`glass-card ${styles.tableCard}`}>
                <AdsBreakdownTable clientId={selectedClientId} datePreset={datePreset} />
              </div>
            )}
          </div>

          {/* Botões flutuantes */}
          <div className={styles.fabBar}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowShare(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Compartilhar
            </button>
            <button
              type="button"
              className="sigma-btn-primary"
              onClick={() => setAiTarget({ scope: 'account', targetId: null, targetName: selectedClient?.company_name })}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Analisar com IA
            </button>
          </div>

          {error && (
            <div className={styles.aiError} style={{ marginTop: 12 }}>
              {error}
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadDashboard} style={{ marginLeft: 12 }}>
                Tentar novamente
              </button>
            </div>
          )}
        </>
      )}

      {aiTarget && (
        <AdsAIInsightsModal
          clientId={selectedClientId}
          scope={aiTarget.scope}
          targetId={aiTarget.targetId}
          targetName={aiTarget.targetName}
          datePreset={datePreset}
          onClose={() => setAiTarget(null)}
        />
      )}

      {showShare && (
        <AdsPublicShareModal
          clientId={selectedClientId}
          clientName={selectedClient?.company_name}
          onClose={() => setShowShare(false)}
        />
      )}
    </DashboardLayout>
  );
}
