/**
 * pages/dashboard/image/history.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Histórico admin — TODAS as gerações do tenant nos últimos 7 dias.
 * Protegido: só admin/god. Filtros client-side, paginação server-side.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import DashboardLayout from '../../../components/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../context/NotificationContext';
import { Icon } from '../../../components/image/ImageIcons';
import styles from '../../../assets/style/imageHistory.module.css';

const ImageDetailModal = dynamic(
  () => import('../../../components/image/ImageDetailModal'),
  { ssr: false, loading: () => null }
);

const PAGE_SIZE = 50;

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ImageHistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { notify } = useNotification();

  const [days, setDays] = useState(7);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ user: 'all', client: 'all', status: 'all', model: 'all' });
  const [detailJob, setDetailJob] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'god';

  // Redireciona se não admin
  useEffect(() => {
    if (!authLoading && user && !isAdmin) {
      notify('Acesso restrito a admin', 'error');
      router.replace('/dashboard/image');
    }
  }, [authLoading, user, isAdmin, router, notify]);

  // Load
  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/image/history/admin?days=${days}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'falha');
        setItems(json.data || []);
      } catch (err) {
        notify(`Erro: ${err.message}`, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [days, page, isAdmin, notify]);

  // Filtros derivados
  const allUsers   = useMemo(() => [...new Set(items.map(i => i.user_name).filter(Boolean))], [items]);
  const allClients = useMemo(() => [...new Set(items.map(i => i.client_name).filter(Boolean))], [items]);
  const allModels  = useMemo(() => [...new Set(items.map(i => i.model).filter(Boolean))], [items]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filters.user   !== 'all' && i.user_name   !== filters.user)   return false;
      if (filters.client !== 'all' && i.client_name !== filters.client) return false;
      if (filters.status !== 'all' && i.status      !== filters.status) return false;
      if (filters.model  !== 'all' && i.model       !== filters.model)  return false;
      return true;
    });
  }, [items, filters]);

  const totals = useMemo(() => {
    let cost = 0, ms = 0, doneN = 0;
    for (const i of filtered) {
      if (i.cost_usd) cost += parseFloat(i.cost_usd);
      if (i.duration_ms) { ms += i.duration_ms; doneN++; }
    }
    return { cost, avgMs: doneN ? Math.round(ms / doneN) : 0 };
  }, [filtered]);

  if (authLoading || (user && !isAdmin)) {
    return (
      <DashboardLayout activeTab="image">
        <div style={{ padding: 40, textAlign: 'center' }}>
          <span className="spinner" style={{ width: 22, height: 22, margin: '0 auto' }} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="image">
      <div className={styles.page}>
        <div className="page-header">
          <h1 className="page-title">Histórico admin — Imagens</h1>
          <p className="page-subtitle">
            Últimas gerações de todos os usuários nos últimos {days} dias
          </p>
        </div>

        <div className={styles.toolbar}>
          <select className={styles.miniSelect} value={days} onChange={e => { setDays(parseInt(e.target.value)); setPage(0); }}>
            <option value="1">Hoje</option>
            <option value="3">3 dias</option>
            <option value="7">7 dias</option>
            <option value="14">14 dias</option>
            <option value="30">30 dias</option>
          </select>
          <select className={styles.miniSelect} value={filters.user} onChange={e => setFilters(f => ({ ...f, user: e.target.value }))}>
            <option value="all">Todos os usuários</option>
            {allUsers.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select className={styles.miniSelect} value={filters.client} onChange={e => setFilters(f => ({ ...f, client: e.target.value }))}>
            <option value="all">Todos os clientes</option>
            {allClients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={styles.miniSelect} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="all">Todos status</option>
            <option value="done">Concluídas</option>
            <option value="error">Erro</option>
            <option value="cancelled">Canceladas</option>
            <option value="queued">Na fila</option>
            <option value="running">Rodando</option>
          </select>
          <select className={styles.miniSelect} value={filters.model} onChange={e => setFilters(f => ({ ...f, model: e.target.value }))}>
            <option value="all">Todos modelos</option>
            {allModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className={styles.totals}>
          <div className={`glass-card ${styles.kpi}`}>
            <div className={styles.kpiLabel}>Total filtrado</div>
            <div className={styles.kpiValue}>{filtered.length}</div>
          </div>
          <div className={`glass-card ${styles.kpi}`}>
            <div className={styles.kpiLabel}>Custo estimado</div>
            <div className={styles.kpiValue}>${totals.cost.toFixed(4)}</div>
            <div className={styles.kpiHint}>USD nos últimos {days} dias</div>
          </div>
          <div className={`glass-card ${styles.kpi}`}>
            <div className={styles.kpiLabel}>Tempo médio</div>
            <div className={styles.kpiValue}>{totals.avgMs ? `${(totals.avgMs / 1000).toFixed(1)}s` : '—'}</div>
            <div className={styles.kpiHint}>por geração concluída</div>
          </div>
        </div>

        <div className={`glass-card ${styles.tableCard}`}>
          {loading ? (
            <div className={styles.empty}>
              <span className="spinner" style={{ width: 18, height: 18, margin: '0 auto 10px' }} />
              <div>CARREGANDO...</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>Sem registros</div>
          ) : (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Img</th>
                    <th>Usuário</th>
                    <th>Cliente</th>
                    <th>Modelo</th>
                    <th>Status</th>
                    <th>Tempo</th>
                    <th>Custo</th>
                    <th>Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(i => (
                    <tr key={i.id} onClick={() => setDetailJob(i)}>
                      <td>
                        {i.result_thumbnail_url
                          ? <img src={i.result_thumbnail_url} alt="" className={styles.thumb} />
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>{i.user_name || '—'}</td>
                      <td>{i.client_name || '—'}</td>
                      <td>{i.model}</td>
                      <td>
                        <span className={
                          `${styles.statusCell} ${
                            i.status === 'done' ? styles.statusDone :
                            i.status === 'error' ? styles.statusError : styles.statusOther
                          }`
                        }>
                          {i.status === 'done' && <Icon name="check" size={9} />}
                          {i.status === 'error' && <Icon name="x" size={9} />}
                          {i.status}
                        </span>
                      </td>
                      <td>{i.duration_ms ? `${(i.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                      <td>{i.cost_usd ? `$${parseFloat(i.cost_usd).toFixed(4)}` : '—'}</td>
                      <td>{formatTime(i.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className={styles.pagination}>
                <span>Mostrando {filtered.length} resultado(s)</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                  >
                    <Icon name="chevronLeft" size={11} /> Anterior
                  </button>
                  <span style={{ alignSelf: 'center' }}>Página {page + 1}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={items.length < PAGE_SIZE}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Próxima <Icon name="chevronRight" size={11} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {detailJob && (
        <ImageDetailModal
          job={detailJob}
          onClose={() => setDetailJob(null)}
          onRegenerate={() => {}}
          onSaveTemplate={() => {}}
          onDelete={() => {}}
        />
      )}
    </DashboardLayout>
  );
}
