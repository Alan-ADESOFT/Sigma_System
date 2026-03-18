import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useNotification } from '../../context/NotificationContext';

const DATE_PRESETS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last_7d', label: '7 dias' },
  { value: 'last_14d', label: '14 dias' },
  { value: 'last_30d', label: '30 dias' },
  { value: 'last_90d', label: '90 dias' },
  { value: 'this_month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes passado' },
];

export default function AdsPage() {
  const { notify } = useNotification();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [datePreset, setDatePreset] = useState('last_30d');
  const [campaigns, setCampaigns] = useState([]);
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      console.log('[INFO][Frontend:Ads] Carregando contas de Ads...');
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) {
        const adsAccounts = (data.accounts || []).filter((a) => a.adsToken && a.adsAccountId);
        setAccounts(adsAccounts);
        if (adsAccounts.length > 0) setSelectedAccount(adsAccounts[0]);
        console.log('[SUCESSO][Frontend:Ads] Contas de Ads carregadas', { total: adsAccounts.length });
      }
    } catch (err) {
      console.error('[ERRO][Frontend:Ads] Erro ao carregar contas', { error: err.message });
      notify('Erro ao carregar contas de Ads', 'error');
    }
  }

  const loadCampaigns = useCallback(async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setError(null);

    try {
      console.log('[INFO][Frontend:Ads] Carregando campanhas', { accountId: selectedAccount.adsAccountId, datePreset });
      const res = await fetch('/api/ads-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: selectedAccount.adsToken,
          accountId: selectedAccount.adsAccountId,
          datePreset,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.campaigns || []);
        console.log('[SUCESSO][Frontend:Ads] Campanhas carregadas', { total: (data.campaigns || []).length });
      } else {
        setError(data.error);
        console.error('[ERRO][Frontend:Ads] Erro ao carregar campanhas', { error: data.error });
        notify('Erro ao carregar campanhas', 'error');
      }

      // Carregar KPIs
      console.log('[INFO][Frontend:Ads] Carregando insights/KPIs', { accountId: selectedAccount.adsAccountId, datePreset });
      const insightsRes = await fetch('/api/ads-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: selectedAccount.adsToken,
          accountId: selectedAccount.adsAccountId,
          datePreset,
        }),
      });
      const insightsData = await insightsRes.json();
      if (insightsData.success) {
        setKpi(insightsData.kpiSummary);
        console.log('[SUCESSO][Frontend:Ads] Insights/KPIs carregados');
      }
    } catch (err) {
      setError(err.message);
      console.error('[ERRO][Frontend:Ads] Erro ao carregar campanhas/insights', { error: err.message });
      notify('Erro ao carregar campanhas', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, datePreset]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  async function handleCampaignAction(campaignId, action, status) {
    if (!selectedAccount) return;
    try {
      console.log('[INFO][Frontend:Ads] Executando acao na campanha', { campaignId, action, status });
      const res = await fetch('/api/ads-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: selectedAccount.adsToken,
          action,
          targetId: campaignId,
          status,
        }),
      });
      const data = await res.json();
      if (data.success) {
        loadCampaigns();
        console.log('[SUCESSO][Frontend:Ads] Acao executada na campanha', { campaignId, action, status });
        notify(`Campanha ${status === 'ACTIVE' ? 'ativada' : 'pausada'} com sucesso`, 'success');
      }
    } catch (err) {
      console.error('[ERRO][Frontend:Ads] Erro na acao da campanha', { error: err.message });
      notify('Erro ao executar acao na campanha', 'error');
    }
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: kpi?.currency || 'BRL' }).format(value);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Math.round(value));
  }

  return (
    <DashboardLayout activeTab="ads">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Campanhas & Ads</h1>
          <p className="page-subtitle">Gerencie suas campanhas do Facebook/Instagram Ads</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {accounts.length > 1 && (
            <select
              className="select"
              style={{ width: 200 }}
              value={selectedAccount?.id || ''}
              onChange={(e) => setSelectedAccount(accounts.find((a) => a.id === e.target.value))}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.handle})</option>
              ))}
            </select>
          )}
          <select className="select" style={{ width: 140 }} value={datePreset} onChange={(e) => setDatePreset(e.target.value)}>
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <h3 style={{ marginBottom: 8 }}>Nenhuma conta de Ads configurada</h3>
          <p className="text-muted">
            Va em Configuracoes e adicione o Token de Ads e o Account ID da sua conta.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          {kpi && (
            <div className="kpi-grid">
              <div className="kpi-card">
                <span className="kpi-label">Gasto Total</span>
                <span className="kpi-value">{formatCurrency(kpi.totalSpend)}</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Impressoes</span>
                <span className="kpi-value">{formatNumber(kpi.totalImpressions)}</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Cliques</span>
                <span className="kpi-value">{formatNumber(kpi.totalClicks)}</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">CTR Medio</span>
                <span className="kpi-value">{kpi.avgCtr.toFixed(2)}%</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">CPC Medio</span>
                <span className="kpi-value">{formatCurrency(kpi.avgCpc)}</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">ROAS</span>
                <span className="kpi-value">{kpi.roas.toFixed(2)}x</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Campanhas Ativas</span>
                <span className="kpi-value" style={{ color: 'var(--success)' }}>{kpi.activeCampaigns}</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Conversoes</span>
                <span className="kpi-value">{formatNumber(kpi.totalConversions)}</span>
              </div>
            </div>
          )}

          {/* Campaigns Table */}
          {error && (
            <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 16 }}>
              <p className="text-danger">{error}</p>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Campanhas ({campaigns.length})</h3>
              <button className="btn btn-secondary btn-sm" onClick={loadCampaigns} disabled={loading}>
                {loading ? 'Carregando...' : 'Atualizar'}
              </button>
            </div>

            {loading && campaigns.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Campanha</th>
                      <th>Status</th>
                      <th>Objetivo</th>
                      <th>Gasto</th>
                      <th>Impressoes</th>
                      <th>Cliques</th>
                      <th>CTR</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((camp) => (
                      <tr key={camp.id}>
                        <td style={{ maxWidth: 200 }} className="truncate">{camp.name}</td>
                        <td>
                          <span className={`badge badge-${camp.effective_status === 'ACTIVE' ? 'active' : camp.effective_status === 'PAUSED' ? 'paused' : 'error'}`}>
                            {camp.effective_status}
                          </span>
                        </td>
                        <td className="text-sm text-muted">{camp.objective?.replace('OUTCOME_', '') || '-'}</td>
                        <td className="font-mono">{camp.insights ? formatCurrency(parseFloat(camp.insights.spend)) : '-'}</td>
                        <td className="font-mono">{camp.insights ? formatNumber(parseInt(camp.insights.impressions)) : '-'}</td>
                        <td className="font-mono">{camp.insights ? formatNumber(parseInt(camp.insights.clicks)) : '-'}</td>
                        <td className="font-mono">{camp.insights?.ctr ? `${parseFloat(camp.insights.ctr).toFixed(2)}%` : '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {camp.effective_status === 'ACTIVE' ? (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleCampaignAction(camp.id, 'campaign_status', 'PAUSED')}
                              >
                                Pausar
                              </button>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleCampaignAction(camp.id, 'campaign_status', 'ACTIVE')}
                              >
                                Ativar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
