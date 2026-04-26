/**
 * pages/dashboard/comercial/captacao/[listId].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Detalhe de uma lista — tabela de leads + bulk select + import pra pipeline.
 * Mostra LeadListProgress se status='running'.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DashboardLayout from '../../../../components/DashboardLayout';
import LeadTable from '../../../../components/comercial/LeadTable';
import LeadListProgress from '../../../../components/comercial/LeadListProgress';
import ConfirmModal from '../../../../components/comercial/ConfirmModal';
import { useNotification } from '../../../../context/NotificationContext';
import styles from '../../../../assets/style/comercialCaptacao.module.css';
import tableStyles from '../../../../assets/style/leadTable.module.css';

export default function ListDetailPage() {
  const router = useRouter();
  const { listId } = router.query;
  const { notify } = useNotification();

  const [list, setList] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmImportAll, setConfirmImportAll] = useState(false);

  async function fetchList(page = 1) {
    if (!listId) return;
    setLoading(true);
    try {
      const url = `/api/comercial/captacao/lists/${listId}?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setList(json.list);
      setLeads(json.leads);
      setPagination(json.pagination);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchList(1); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [listId]);

  // re-buscar quando search muda (debounce)
  useEffect(() => {
    if (!listId) return;
    const id = setTimeout(() => fetchList(1), 300);
    return () => clearTimeout(id);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [search]);

  function handleProgressDone() {
    notify('Captação concluída', 'success');
    fetchList(1);
  }
  function handleProgressError(msg) {
    notify(msg || 'Captação falhou', 'error');
    fetchList(1);
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll(ids) { setSelectedIds(new Set(ids)); }
  function deselectAll()  { setSelectedIds(new Set()); }

  async function handleImport() {
    if (selectedIds.size === 0) return notify('Selecione ao menos 1 lead', 'warning');
    setImporting(true);
    try {
      const res = await fetch(`/api/comercial/captacao/lists/${listId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha');
      notify(`${json.importedCount} leads importados pro Pipeline`, 'success', {
        action: { label: 'Ver', onClick: () => router.push('/dashboard/comercial/pipeline') },
      });
      setSelectedIds(new Set());
      fetchList(pagination.page);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setImporting(false);
    }
  }

  async function handleImportAll() {
    setImporting(true);
    try {
      const res = await fetch(`/api/comercial/captacao/lists/${listId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importAll: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha');
      if ((json.importedCount || 0) === 0) {
        notify(json.message || 'Nenhum lead novo pra importar', 'info');
      } else {
        notify(`${json.importedCount} leads importados pro Pipeline (todos foram pra Pendente)`, 'success', {
          action: { label: 'Ver Pipeline', onClick: () => router.push('/dashboard/comercial/pipeline') },
        });
      }
      setSelectedIds(new Set());
      setConfirmImportAll(false);
      fetchList(pagination.page);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setImporting(false);
    }
  }

  function handleExport() {
    window.location.href = `/api/comercial/captacao/lists/${listId}/export`;
  }

  if (!list && loading) {
    return (
      <DashboardLayout activeTab="comercial/captacao">
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          Carregando lista...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="comercial/captacao">
      <div className={styles.page}>
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <div className="label-micro" style={{ marginBottom: 4 }}>
              <Link href="/dashboard/comercial/captacao" className={tableStyles.linkText}>← Captação</Link>
              {' / '}
              {list?.name}
            </div>
            <h1 className="page-title">{list?.name || 'Lista'}</h1>
            <p className="page-subtitle">
              {list?.source === 'apify' ? 'Origem: Google Maps via Apify' : `Origem: ${list?.source}`}
              {' · '}{list?.leads_count ?? list?.total_leads ?? 0} leads
              {' · '}{list?.imported_count ?? 0} importados
            </p>
          </div>
          <div className={styles.headerActions}>
            <button className="btn btn-secondary" onClick={handleExport}>Exportar CSV</button>
            {list?.status === 'completed' && (() => {
              const pending = (list.leads_count ?? list.total_leads ?? 0) - (list.imported_count ?? 0);
              if (pending <= 0) return null;
              return (
                <button
                  className="sigma-btn-primary"
                  onClick={() => setConfirmImportAll(true)}
                  disabled={importing}
                >
                  Importar TODOS ({pending}) pro Pipeline
                </button>
              );
            })()}
          </div>
        </div>

        {/* SSE de progresso quando running */}
        {list?.status === 'running' && (
          <LeadListProgress listId={listId} onDone={handleProgressDone} onError={handleProgressError} />
        )}

        {list?.status === 'failed' && (
          <div className={`glass-card ${styles.streamPanel}`}
               style={{ borderColor: 'rgba(255,0,51,0.3)' }}>
            <div style={{ color: 'var(--brand-400)', fontFamily: 'var(--font-mono)' }}>
              ⚠ Falhou: {list?.error_message || 'Erro desconhecido'}
            </div>
          </div>
        )}

        {/* Busca + ação em massa */}
        <div className={styles.headerRow}>
          <input
            className="sigma-input"
            placeholder="Buscar por nome, cidade, nicho..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          {selectedIds.size > 0 && (
            <div className={tableStyles.actionBar}>
              <span><strong>{selectedIds.size}</strong> selecionado{selectedIds.size > 1 ? 's' : ''}</span>
              <button className="btn btn-secondary" onClick={deselectAll} disabled={importing}>Limpar</button>
              <button className="sigma-btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? 'Importando...' : `Importar pro Pipeline (${selectedIds.size})`}
              </button>
            </div>
          )}
        </div>

        {loading && leads.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 8px' }} />
            Carregando leads...
          </div>
        ) : (
          <>
            <LeadTable
              leads={leads}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
            />

            {/* Paginação */}
            {pagination.totalPages > 1 && (
              <div className={tableStyles.paginationBar} style={{ marginTop: 12 }}>
                <span>Página {pagination.page} de {pagination.totalPages} · {pagination.total} leads</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={tableStyles.pageBtn} disabled={pagination.page <= 1}
                          onClick={() => fetchList(pagination.page - 1)}>← Anterior</button>
                  <button className={tableStyles.pageBtn} disabled={pagination.page >= pagination.totalPages}
                          onClick={() => fetchList(pagination.page + 1)}>Próxima →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        open={confirmImportAll}
        onClose={() => setConfirmImportAll(false)}
        onConfirm={handleImportAll}
        loading={importing}
        variant="download"
        title={(() => {
          const pending = (list?.leads_count ?? list?.total_leads ?? 0) - (list?.imported_count ?? 0);
          return `Importar ${pending} leads pro Pipeline?`;
        })()}
        description="Todos os leads não-importados desta lista serão adicionados como novos cards na coluna Pendente do Kanban. Cada lead vira 1 card. Você poderá movê-los pelas etapas depois."
        confirmLabel="Importar todos"
        cancelLabel="Cancelar"
      />
    </DashboardLayout>
  );
}
