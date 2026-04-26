/**
 * pages/dashboard/ads/relatorios.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Gerenciamento de links públicos de relatório de Ads.
 *
 * Lista TODOS os tokens do tenant (com nome do cliente em cada linha).
 * Filtros: cliente, status (ativo/expirado/revogado) e busca livre.
 * O botão "Criar link" abre o modal — o seletor de cliente é interno ao modal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';
import AdsPublicShareModal from '../../../components/ads/AdsPublicShareModal';
import styles from '../../../assets/style/adsRelatorios.module.css';

const STATUS_OPTIONS = [
  { value: 'all',     label: 'Todos os status' },
  { value: 'active',  label: 'Ativos' },
  { value: 'expired', label: 'Expirados' },
  { value: 'revoked', label: 'Revogados' },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function clientInitials(name) {
  return (name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function resolveBaseUrl() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export default function AdsRelatoriosPage() {
  const { notify } = useNotification();
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [tokens, setTokens] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // Filtros
  const [filterClientId, setFilterClientId] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  /* Carrega clientes (necessário para filtro e modal) */
  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((d) => { if (d.success) setClients(d.clients || []); })
      .catch(() => notify('Erro ao carregar clientes', 'error'))
      .finally(() => setLoadingClients(false));
  }, []);

  /* Carrega TODOS os tokens do tenant — listagem global */
  const loadTokens = useCallback(async () => {
    setLoadingTokens(true);
    try {
      const r = await fetch('/api/ads/public/list-tokens');
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setTokens(d.tokens || []);
    } catch (e) {
      notify(e.message, 'error');
      setTokens([]);
    } finally {
      setLoadingTokens(false);
    }
  }, [notify]);
  useEffect(() => { loadTokens(); }, [loadTokens]);

  /* Filtros aplicados em memória */
  const filteredTokens = useMemo(() => {
    return tokens.filter((t) => {
      if (filterClientId && t.clientId !== filterClientId) return false;
      if (filterStatus !== 'all' && t.effectiveStatus !== filterStatus) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${t.companyName || ''} ${t.token || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tokens, filterClientId, filterStatus, search]);

  const stats = useMemo(() => {
    const total = tokens.length;
    const active = tokens.filter((t) => t.effectiveStatus === 'active').length;
    const expired = tokens.filter((t) => t.effectiveStatus === 'expired').length;
    const revoked = tokens.filter((t) => t.effectiveStatus === 'revoked').length;
    const totalViews = tokens.reduce((s, t) => s + (t.viewsCount || 0), 0);
    return { total, active, expired, revoked, totalViews };
  }, [tokens]);

  async function handleRevoke(tokenId) {
    try {
      const r = await fetch('/api/ads/public/revoke-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId, reason: 'manual' }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      notify('Link revogado', 'success');
      setConfirmRevoke(null);
      loadTokens();
    } catch (e) { notify(e.message, 'error'); }
  }

  async function handleCopy(token) {
    const url = `${resolveBaseUrl()}/relatorio-ads/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copiado para a área de transferência', 'success');
    } catch {
      notify('Falha ao copiar — copie manualmente', 'warning');
    }
  }

  const hasActiveFilters = filterClientId || filterStatus !== 'all' || search.trim();

  return (
    <DashboardLayout activeTab="ads">
      {/* HEADER */}
      <div className={styles.headerRow}>
        <div>
          <h1 className="page-title">Relatórios Públicos</h1>
          <p className="page-subtitle">
            Gere e gerencie links de relatório que os clientes acessam sem login
          </p>
        </div>
        <button type="button" className="sigma-btn-primary" onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Criar link público
        </button>
      </div>

      {/* STATS */}
      <div className={styles.statsRow}>
        <StatCard label="Total de links" value={stats.total} />
        <StatCard label="Ativos" value={stats.active} tone="ok" />
        <StatCard label="Expirados" value={stats.expired} tone="warn" />
        <StatCard label="Revogados" value={stats.revoked} tone="muted" />
        <StatCard label="Acessos acumulados" value={stats.totalViews} />
      </div>

      {/* FILTROS */}
      <div className={styles.filterBar}>
        <div className={styles.searchBox}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={styles.searchIcon}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por cliente ou token..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.miniSelect}>
            <span className={styles.miniSelectLabel}>Cliente</span>
            <select
              value={filterClientId}
              onChange={(e) => setFilterClientId(e.target.value)}
              disabled={loadingClients}
            >
              <option value="">Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </label>
          <label className={styles.miniSelect}>
            <span className={styles.miniSelectLabel}>Status</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          {hasActiveFilters && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => { setFilterClientId(''); setFilterStatus('all'); setSearch(''); }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* CONTEÚDO */}
      {loadingTokens ? (
        <div className={`glass-card ${styles.emptyCard}`}>
          <div className={styles.spinner} aria-hidden="true" />
          <span>Carregando links...</span>
        </div>
      ) : tokens.length === 0 ? (
        <div className={`glass-card ${styles.emptyCard}`}>
          <div className={styles.emptyIcon} aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <h3 className={styles.emptyTitle}>Nenhum link público gerado</h3>
          <p className={styles.emptyText}>
            Compartilhe relatórios de Ads com os clientes sem precisar dar acesso ao painel.
          </p>
          <button type="button" className="sigma-btn-primary" onClick={() => setShowCreate(true)}>
            Criar primeiro link
          </button>
        </div>
      ) : filteredTokens.length === 0 ? (
        <div className={`glass-card ${styles.emptyCard}`}>
          <div className={styles.emptyIcon} aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h3 className={styles.emptyTitle}>Nenhum link encontrado</h3>
          <p className={styles.emptyText}>
            Ajuste os filtros para encontrar o link que procura.
          </p>
        </div>
      ) : (
        <div className={`glass-card ${styles.tableCard}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Criado</th>
                <th>Validade</th>
                <th>Acessos</th>
                <th>Último acesso</th>
                <th>Status</th>
                <th aria-label="Ações"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTokens.map((t) => {
                const url = `${resolveBaseUrl()}/relatorio-ads/${t.token}`;
                return (
                  <tr key={t.id}>
                    <td>
                      <div className={styles.clientCell}>
                        {t.logoUrl ? (
                          <img src={t.logoUrl} alt="" className={styles.clientAvatar} />
                        ) : (
                          <div className={styles.clientAvatarPh}>{clientInitials(t.companyName)}</div>
                        )}
                        <div className={styles.clientName}>{t.companyName || '—'}</div>
                      </div>
                    </td>
                    <td>{fmtDate(t.createdAt)}</td>
                    <td>{t.expiresAt ? fmtDate(t.expiresAt) : 'Sem expiração'}</td>
                    <td className={styles.viewsCell}>
                      <span className={styles.viewsValue}>{t.viewsCount}</span>
                    </td>
                    <td>{t.lastViewedAt ? fmtDate(t.lastViewedAt) : '—'}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[`status_${t.effectiveStatus}`] || ''}`}>
                        {t.effectiveStatus === 'active'
                          ? 'Ativo'
                          : t.effectiveStatus === 'expired'
                            ? 'Expirado'
                            : 'Revogado'}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Copiar link"
                        onClick={() => handleCopy(t.token)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                      <a
                        className={styles.iconBtn}
                        href={url}
                        target="_blank"
                        rel="noreferrer noopener"
                        title="Abrir em nova aba"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                      {t.effectiveStatus === 'active' && (
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.iconDanger}`}
                          title="Revogar link"
                          onClick={() => setConfirmRevoke(t)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmRevoke && (
        <div className="set-modal-overlay" onClick={() => setConfirmRevoke(null)}>
          <div className="set-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 96vw)' }}>
            <div className="set-modal-header">
              <div>
                <h2 className="set-modal-title">Revogar link público</h2>
                <div className="set-modal-subtitle">
                  Após revogado, qualquer pessoa com o link verá uma página de erro.
                  Esta ação não pode ser desfeita.
                </div>
              </div>
            </div>
            <div className="set-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmRevoke(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={() => handleRevoke(confirmRevoke.id)}>
                Revogar agora
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <AdsPublicShareModal
          clients={clients}
          onClose={() => setShowCreate(false)}
          onCreated={() => loadTokens()}
        />
      )}
    </DashboardLayout>
  );
}

/* ─── Stat card ─────────────────────────────────────────────────────────── */
function StatCard({ label, value, tone }) {
  return (
    <div className={`${styles.statCard} ${tone ? styles[`stat_${tone}`] : ''}`}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}
