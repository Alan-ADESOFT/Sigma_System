/**
 * pages/dashboard/comercial/propostas/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Listagem de propostas com filtro de status + busca + cards.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../../components/DashboardLayout';
import ProposalCard from '../../../../components/comercial/ProposalCard';
import NewProposalModal from '../../../../components/comercial/NewProposalModal';
import ProposalEditModal from '../../../../components/comercial/ProposalEditModal';
import ConfirmModal from '../../../../components/comercial/ConfirmModal';
import { useNotification } from '../../../../context/NotificationContext';
import styles from '../../../../assets/style/proposalsList.module.css';

const STATUS_FILTERS = [
  { k: '',          l: 'Todas' },
  { k: 'draft',     l: 'Rascunho' },
  { k: 'published', l: 'Publicadas' },
  { k: 'expired',   l: 'Expiradas' },
  { k: 'won',       l: 'Ganhas' },
  { k: 'lost',      l: 'Perdidas' },
];

export default function PropostasPage() {
  const { notify } = useNotification();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') setBaseUrl(window.location.origin);
  }, []);

  async function fetchList() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/comercial/proposals?${params.toString()}`);
      const j = await res.json();
      if (j.success) setList(j.proposals);
    } catch (err) {
      notify('Erro ao carregar propostas', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchList(); /* eslint-disable-line */ }, [statusFilter]);
  useEffect(() => {
    const id = setTimeout(() => fetchList(), 250);
    return () => clearTimeout(id);
    /* eslint-disable-next-line */
  }, [search]);

  const counts = useMemo(() => {
    const acc = {};
    for (const p of list) acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, [list]);

  const [pendingDelete, setPendingDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);

  function handleDelete(p) {
    setPendingDelete(p);
  }

  function handleOpenEdit(p) {
    setEditingId(p.id);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      const res = await fetch(`/api/comercial/proposals/${pendingDelete.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Falha');
      notify('Proposta deletada', 'success');
      setPendingDelete(null);
      fetchList();
    } catch (err) { notify(err.message, 'error'); }
  }

  async function handleDuplicate(p) {
    try {
      const res = await fetch(`/api/comercial/proposals/${p.id}/duplicate`, { method: 'POST' });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Falha');
      notify('Proposta duplicada', 'success');
      fetchList();
    } catch (err) { notify(err.message, 'error'); }
  }

  return (
    <DashboardLayout activeTab="comercial/propostas">
      <div className={styles.page}>
        <div className={styles.headerRow}>
          <div>
            <h1 className="page-title">Propostas</h1>
            <p className="page-subtitle">{list.length} propostas no total</p>
          </div>
          <div>
            <button className="sigma-btn-primary" onClick={() => setShowNew(true)}>+ Nova proposta</button>
          </div>
        </div>

        <div className={styles.toolbar}>
          <input
            className="sigma-input"
            placeholder="Buscar por cliente ou slug..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 240, maxWidth: 300 }}
          />
          <div className={styles.statusFilter}>
            {STATUS_FILTERS.map(f => (
              <button
                key={f.k}
                className={`${styles.statusBtn} ${statusFilter === f.k ? styles.statusBtnActive : ''}`}
                onClick={() => setStatusFilter(f.k)}
              >
                {f.l}{f.k && counts[f.k] ? ` · ${counts[f.k]}` : ''}
              </button>
            ))}
          </div>
        </div>

        {loading && list.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Carregando propostas...
          </div>
        ) : list.length === 0 ? (
          <div className={`glass-card ${styles.empty}`}>
            <h3>Nenhuma proposta ainda</h3>
            <p>Crie a primeira proposta SIGMA — você pode escolher um prospect existente, criar manual ou importar do pipeline.</p>
            <button className="sigma-btn-primary" onClick={() => setShowNew(true)}>+ Nova proposta</button>
          </div>
        ) : (
          <div className={styles.grid}>
            {list.map(p => (
              <ProposalCard
                key={p.id}
                proposal={p}
                baseUrl={baseUrl}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onOpenEdit={handleOpenEdit}
              />
            ))}
          </div>
        )}

        {showNew && (
          <NewProposalModal onClose={() => { setShowNew(false); fetchList(); }} />
        )}

        {editingId && (
          <ProposalEditModal
            proposalId={editingId}
            onClose={() => { setEditingId(null); fetchList(); }}
            onSaved={() => fetchList()}
          />
        )}

        <ConfirmModal
          open={!!pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          variant="danger"
          title="Excluir proposta"
          description="Esta ação é permanente e não pode ser desfeita. Confirme antes de prosseguir."
          warningTitle="Tem certeza que deseja excluir"
          warningHighlight={pendingDelete?.client_name || 'proposta'}
          warningText={
            pendingDelete?.status === 'published'
              ? `⚠ Esta proposta está PUBLICADA. O link público vai parar de funcionar imediatamente. Os ${pendingDelete?.view_count || 0} históricos de visualização também serão excluídos.`
              : 'A proposta e todo seu conteúdo (diagnóstico, oportunidade, pilares, projeção) serão removidos permanentemente.'
          }
          warningCascade="conteúdo · views · tracking · histórico"
          confirmLabel="Excluir definitivamente"
          cancelLabel="Cancelar"
        />
      </div>
    </DashboardLayout>
  );
}
