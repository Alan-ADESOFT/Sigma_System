import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useNotification } from '../../context/NotificationContext';

const AGENT_LIST = [
  { name: 'agente1',  label: 'Agente 01 - Diagnostico',         desc: 'Analisa dados e monta diagnostico estrategico' },
  { name: 'agente2a', label: 'Agente 2A - Pesquisador',         desc: 'Pesquisa concorrentes na web' },
  { name: 'agente2b', label: 'Agente 2B - Analista',            desc: 'Analisa dados dos concorrentes' },
  { name: 'agente3',  label: 'Agente 03 - Publico-Alvo',        desc: 'Define perfil do publico' },
  { name: 'agente4a', label: 'Agente 4A - Pesquisador Avatar',  desc: 'Pesquisa dores e linguagem do publico' },
  { name: 'agente4b', label: 'Agente 4B - Construtor Avatar',   desc: 'Constroi avatar completo' },
  { name: 'agente5',  label: 'Agente 05 - Posicionamento',      desc: 'Define posicionamento da marca' },
  { name: 'agente6',  label: 'Agente 06 - Oferta',              desc: 'Estrutura oferta completa' },
];

function PromptsSection() {
  const { notify } = useNotification();
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [promptText, setPromptText]       = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [isCustom, setIsCustom]           = useState(false);
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);

  const loadPrompt = useCallback(async (agentName) => {
    setLoading(true);
    try {
      const r = await fetch('/api/agentes/prompts/' + agentName);
      const d = await r.json();
      if (d.success) {
        setPromptText(d.data.prompt);
        setDefaultPrompt(d.data.defaultPrompt);
        setIsCustom(d.data.isCustom);
      }
    } catch {}
    setLoading(false);
  }, []);

  function handleToggle(agentName) {
    if (expandedAgent === agentName) {
      setExpandedAgent(null);
    } else {
      setExpandedAgent(agentName);
      loadPrompt(agentName);
    }
  }

  async function handleSave() {
    if (!expandedAgent) return;
    setSaving(true);
    try {
      const r = await fetch('/api/agentes/prompts/' + expandedAgent, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
      });
      const d = await r.json();
      if (d.success) {
        setIsCustom(true);
        notify('Prompt salvo!', 'success');
      } else {
        notify(d.error || 'Erro ao salvar', 'error');
      }
    } catch { notify('Erro ao salvar prompt', 'error'); }
    setSaving(false);
  }

  async function handleReset() {
    if (!expandedAgent || !confirm('Restaurar prompt ao padrao? A customizacao sera perdida.')) return;
    setSaving(true);
    try {
      const r = await fetch('/api/agentes/prompts/' + expandedAgent, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) {
        setPromptText(defaultPrompt);
        setIsCustom(false);
        notify('Prompt restaurado ao padrao', 'success');
      }
    } catch { notify('Erro ao restaurar', 'error'); }
    setSaving(false);
  }

  return (
    <div className="glass-card" style={{ padding: '20px 24px', marginTop: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Prompts dos Agentes
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Customize os prompts base usados por cada agente. Alteracoes afetam todas as execucoes futuras.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {AGENT_LIST.map(agent => (
          <div key={agent.name}>
            {/* Card do agente */}
            <div
              onClick={() => handleToggle(agent.name)}
              style={{
                padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                background: expandedAgent === agent.name ? 'rgba(255,0,51,0.03)' : 'rgba(255,255,255,0.01)',
                border: '1px solid ' + (expandedAgent === agent.name ? 'rgba(255,0,51,0.15)' : 'rgba(255,255,255,0.05)'),
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'all 0.15s',
              }}
            >
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {agent.label}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {agent.desc}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {expandedAgent === agent.name && isCustom && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.48rem', fontWeight: 600,
                    padding: '1px 6px', borderRadius: 3,
                    background: 'rgba(249,115,22,0.1)', color: '#f97316',
                  }}>
                    CUSTOMIZADO
                  </span>
                )}
                {expandedAgent === agent.name && !isCustom && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.48rem', fontWeight: 600,
                    padding: '1px 6px', borderRadius: 3,
                    background: 'rgba(82,82,82,0.15)', color: '#525252',
                  }}>
                    PADRAO
                  </span>
                )}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"
                  style={{ transform: expandedAgent === agent.name ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                  <polyline points="6,9 12,15 18,9" />
                </svg>
              </div>
            </div>

            {/* Editor expandido */}
            {expandedAgent === agent.name && (
              <div style={{ padding: '12px 14px', marginTop: 4, borderRadius: 8, background: 'rgba(10,10,10,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                {loading ? (
                  <div style={{ padding: 20, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>Carregando prompt...</div>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                      Use placeholders: {'{DADOS_CLIENTE}'}, {'{OUTPUT_DIAGNOSTICO}'}, {'{OUTPUT_AVATAR}'}, etc.
                    </div>
                    <textarea
                      value={promptText}
                      onChange={e => setPromptText(e.target.value)}
                      rows={18}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                        background: 'rgba(5,5,5,0.8)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8, color: 'var(--text-secondary)', fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)', lineHeight: 1.6, outline: 'none', resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                      {isCustom && (
                        <button
                          onClick={handleReset}
                          disabled={saving}
                          style={{
                            padding: '5px 14px', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer',
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
                          }}
                        >
                          Restaurar Padrao
                        </button>
                      )}
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                          padding: '5px 14px', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer',
                          background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.25)',
                          color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
                        }}
                      >
                        {saving ? 'Salvando...' : 'Salvar Alteracoes'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { notify } = useNotification();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [message, setMessage] = useState(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [loadingReview, setLoadingReview] = useState(true);

  // Form para adicionar conta manual
  const [accountForm, setAccountForm] = useState({
    name: '',
    handle: '',
    adsToken: '',
    adsAccountId: '',
  });

  useEffect(() => {
    // Carrega estado do modo revisão
    fetch('/api/settings/review-mode')
      .then(r => r.json())
      .then(d => { if (d.success) setReviewMode(d.enabled); })
      .catch(() => {})
      .finally(() => setLoadingReview(false));

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
      {/* ── Prompts dos Agentes ── */}
      <PromptsSection />

      {/* ── Modo Revisão de Agentes ── */}
      <div className="glass-card" style={{ padding: '20px 24px', marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              Modo Revisão de Agentes
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 500 }}>
              Quando ativado, cada etapa do pipeline precisa ser aprovada manualmente antes do próximo agente ser executado. Recomendado para clientes novos ou trabalho em equipe.
            </div>
          </div>
          <button
            disabled={loadingReview}
            onClick={async () => {
              const next = !reviewMode;
              setReviewMode(next);
              try {
                await fetch('/api/settings/review-mode', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ enabled: next }),
                });
                notify(next ? 'Modo revisão ativado' : 'Modo revisão desativado', 'success');
              } catch {
                setReviewMode(!next);
                notify('Erro ao salvar configuração', 'error');
              }
            }}
            style={{
              width: 48, height: 26, borderRadius: 13, cursor: 'pointer', border: 'none',
              background: reviewMode ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: reviewMode ? '#22c55e' : '#525252',
              position: 'absolute', top: 3,
              left: reviewMode ? 25 : 3,
              transition: 'all 0.2s',
              boxShadow: reviewMode ? '0 0 8px rgba(34,197,94,0.4)' : 'none',
            }} />
          </button>
        </div>
      </div>

    </DashboardLayout>
  );
}
