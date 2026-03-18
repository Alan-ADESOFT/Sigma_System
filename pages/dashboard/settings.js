import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useNotification } from '../../context/NotificationContext';

export default function SettingsPage() {
  const { notify } = useNotification();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [message, setMessage] = useState(null);

  // Form para adicionar conta manual
  const [accountForm, setAccountForm] = useState({
    name: '',
    handle: '',
    adsToken: '',
    adsAccountId: '',
  });

  useEffect(() => {
    loadAccounts();
    // Verificar params de retorno do OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'meta_connected') {
      setMessage({ type: 'success', text: `Conta @${params.get('username')} conectada com sucesso via Meta!` });
    } else if (params.get('error')) {
      setMessage({ type: 'error', text: `Erro na autenticacao: ${params.get('error')}` });
    }
  }, []);

  async function loadAccounts() {
    try {
      console.log('[INFO][Frontend:Settings] Carregando contas...');
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts || []);
        console.log('[SUCESSO][Frontend:Settings] Contas carregadas', { total: (data.accounts || []).length });
      }
    } catch (err) {
      console.error('[ERRO][Frontend:Settings] Erro ao carregar contas', { error: err.message });
      notify('Erro ao carregar contas', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleConnectMeta() {
    // Redireciona para o fluxo OAuth do Instagram
    window.location.href = '/api/auth/instagram';
  }

  async function handleSaveAccount() {
    if (!accountForm.handle.trim()) return alert('Handle obrigatorio');

    try {
      console.log('[INFO][Frontend:Settings] Salvando nova conta', { handle: accountForm.handle });
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `acc_${Date.now()}`,
          name: accountForm.name || accountForm.handle,
          handle: accountForm.handle.startsWith('@') ? accountForm.handle : `@${accountForm.handle}`,
          avatarUrl: null,
          notes: null,
          oauthToken: null,
          adsToken: accountForm.adsToken || null,
          adsAccountId: accountForm.adsAccountId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddAccount(false);
        setAccountForm({ name: '', handle: '', adsToken: '', adsAccountId: '' });
        loadAccounts();
        setMessage({ type: 'success', text: 'Conta adicionada! Agora conecte via Meta OAuth.' });
        console.log('[SUCESSO][Frontend:Settings] Conta salva com sucesso', { handle: accountForm.handle });
        notify('Conta adicionada com sucesso!', 'success');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      console.error('[ERRO][Frontend:Settings] Erro ao salvar conta', { error: err.message });
      notify('Erro ao salvar conta', 'error');
    }
  }

  async function handleDeleteAccount(id) {
    if (!confirm('Tem certeza que deseja remover esta conta?')) return;
    try {
      console.log('[INFO][Frontend:Settings] Removendo conta', { id });
      const res = await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadAccounts();
        console.log('[SUCESSO][Frontend:Settings] Conta removida', { id });
        notify('Conta removida com sucesso', 'success');
      }
    } catch (err) {
      console.error('[ERRO][Frontend:Settings] Erro ao remover conta', { error: err.message });
      notify('Erro ao remover conta', 'error');
    }
  }

  async function handleUpdateAds(accountId, adsToken, adsAccountId) {
    try {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;

      console.log('[INFO][Frontend:Settings] Atualizando configuracoes de Ads', { accountId });
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...account,
          adsToken,
          adsAccountId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        loadAccounts();
        setMessage({ type: 'success', text: 'Configuracoes de Ads atualizadas!' });
        console.log('[SUCESSO][Frontend:Settings] Configuracoes de Ads atualizadas', { accountId });
        notify('Configuracoes de Ads atualizadas!', 'success');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      console.error('[ERRO][Frontend:Settings] Erro ao atualizar Ads', { error: err.message });
      notify('Erro ao atualizar configuracoes de Ads', 'error');
    }
  }

  return (
    <DashboardLayout activeTab="settings">
      <div className="page-header">
        <h1 className="page-title">Configuracoes</h1>
        <p className="page-subtitle">Gerencie contas, tokens e integracoes</p>
      </div>

      {message && (
        <div
          className="card"
          style={{
            borderColor: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
            marginBottom: 16,
            padding: 14,
          }}
        >
          <p style={{ color: message.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
            {message.text}
          </p>
        </div>
      )}

      {/* Conectar via Meta OAuth */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Conectar Instagram via Meta</h3>
        </div>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Conecte sua conta Instagram Business/Creator via OAuth para habilitar publicacao automatica,
          insights avancados e gerenciamento de campanhas.
        </p>
        <button className="btn btn-instagram" onClick={handleConnectMeta}>
          Conectar com Instagram
        </button>
      </div>

      {/* Contas */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Contas ({accounts.length})</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddAccount(true)}>
            + Adicionar Manual
          </button>
        </div>

        {loading ? (
          <div className="spinner" style={{ margin: '20px auto' }} />
        ) : accounts.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>
            Nenhuma conta adicionada.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="card"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {acc.avatarUrl ? (
                    <img src={acc.avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      @
                    </div>
                  )}
                  <div>
                    <strong>{acc.name}</strong>
                    <div className="text-sm text-muted">{acc.handle}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${acc.oauthToken ? 'badge-active' : 'badge-error'}`}>
                    {acc.oauthToken ? 'Meta OK' : 'Sem Token'}
                  </span>
                  <span className={`badge ${acc.adsToken ? 'badge-active' : 'badge-paused'}`}>
                    {acc.adsToken ? 'Ads OK' : 'Sem Ads'}
                  </span>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAccount(acc.id)}>
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal - Adicionar Conta Manual */}
      {showAddAccount && (
        <div className="modal-overlay" onClick={() => setShowAddAccount(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Adicionar Conta</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Nome</label>
                <input
                  className="input"
                  value={accountForm.name}
                  onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nome da conta"
                />
              </div>
              <div>
                <label className="label">Handle *</label>
                <input
                  className="input"
                  value={accountForm.handle}
                  onChange={(e) => setAccountForm((p) => ({ ...p, handle: e.target.value }))}
                  placeholder="@username"
                />
              </div>
              <div>
                <label className="label">Token de Ads (opcional)</label>
                <input
                  className="input"
                  value={accountForm.adsToken}
                  onChange={(e) => setAccountForm((p) => ({ ...p, adsToken: e.target.value }))}
                  placeholder="Token do Facebook Ads"
                />
              </div>
              <div>
                <label className="label">Account ID de Ads (opcional)</label>
                <input
                  className="input"
                  value={accountForm.adsAccountId}
                  onChange={(e) => setAccountForm((p) => ({ ...p, adsAccountId: e.target.value }))}
                  placeholder="act_XXXXXXXXXXXXX"
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddAccount(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveAccount}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
