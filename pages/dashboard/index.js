import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useNotification } from '../../context/NotificationContext';

export default function DashboardHome() {
  const { notify } = useNotification();
  const [accounts, setAccounts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      console.log('[INFO][Frontend:Dashboard] Carregando contas do dashboard via /api/accounts');
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) {
        console.log('[SUCESSO][Frontend:Dashboard] Contas carregadas com sucesso', { total: (data.accounts || []).length });
        setAccounts(data.accounts || []);
      } else {
        console.error('[ERRO][Frontend:Dashboard] Resposta sem sucesso ao carregar contas', { data });
        notify('Erro ao carregar contas do dashboard.', 'error');
      }
    } catch (err) {
      console.error('[ERRO][Frontend:Dashboard] Erro ao carregar dashboard', { error: err.message });
      notify('Erro ao carregar dados do dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout activeTab="dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Visao geral das suas contas Instagram</p>
      </div>

      {loading ? (
        <div className="kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-4">
              <div className="skeleton" style={{ width: '60%', height: 14 }} />
              <div className="skeleton mt-4" style={{ width: '40%', height: 32 }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="glass-card kpi-card glass-card-hover group">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-1 bg-brand-500 rounded-full" />
                <span className="label-micro text-brand-500">Contas Conectadas</span>
              </div>
              <span className="kpi-value text-brand-500 neon-red">{accounts.length}</span>
            </div>
            
            <div className="glass-card kpi-card glass-card-hover group">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-1 bg-brand-500 rounded-full" />
                <span className="label-micro">Com Token Meta</span>
              </div>
              <span className="kpi-value">{accounts.filter((a) => a.oauthToken).length}</span>
            </div>
            
            <div className="glass-card kpi-card glass-card-hover group">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-1 bg-brand-500 rounded-full" />
                <span className="label-micro">Com Ads Config</span>
              </div>
              <span className="kpi-value">{accounts.filter((a) => a.adsToken).length}</span>
            </div>
            
            <div className="glass-card kpi-card glass-card-hover group">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 bg-success rounded-full animate-radar-pulse" />
                <span className="label-micro text-success">Status</span>
              </div>
              <span className="kpi-value text-success neon-green" style={{ fontSize: 20 }}>
                Operacional
              </span>
            </div>
          </div>

          {accounts.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: 40 }}>
              <div className="mb-4 flex justify-center">
                <div className="w-12 h-12 rounded-full border border-border-default flex items-center justify-center bg-surface-base">
                  <span className="text-muted font-mono animate-cursor-blink">_</span>
                </div>
              </div>
              <h3 style={{ marginBottom: 8, fontFamily: 'var(--font-mono)' }}>Nenhuma conta conectada</h3>
              <p className="text-muted text-sm font-sans" style={{ marginBottom: 24 }}>
                Conecte sua primeira conta Instagram para inicializar o fluxo operacional.
              </p>
              <a href="/dashboard/settings" className="sigma-btn-primary">
                Conectar Instagram
              </a>
            </div>
          ) : (
            <div className="glass-card">
              <div className="card-header border-b border-border-default pb-4 mb-4 px-6 pt-6">
                <div className="flex items-center gap-2">
                  <span className="label-micro text-brand-500">01 · LISTAGEM</span>
                  <div className="h-[1px] w-8" style={{ background: "rgba(255,0,51,0.2)" }} />
                </div>
                <h3 className="section-title mt-2">Contas Ativas</h3>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Conta</th>
                      <th>Handle</th>
                      <th>Token Meta</th>
                      <th>Ads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((acc) => (
                      <tr key={acc.id}>
                        <td style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {acc.avatarUrl && (
                            <img
                              src={acc.avatarUrl}
                              alt={acc.name}
                              style={{ width: 32, height: 32, borderRadius: '50%' }}
                            />
                          )}
                          {acc.name}
                        </td>
                        <td>{acc.handle}</td>
                        <td>
                          <span className={`badge ${acc.oauthToken ? 'badge-active' : 'badge-error'}`}>
                            {acc.oauthToken ? 'Conectado' : 'Sem token'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${acc.adsToken ? 'badge-active' : 'badge-paused'}`}>
                            {acc.adsToken ? 'Configurado' : 'Nao config.'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
