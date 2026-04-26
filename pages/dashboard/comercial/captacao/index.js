/**
 * pages/dashboard/comercial/captacao/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Página principal de Captação:
 *   · KPIs no topo
 *   · Botões "Nova captação" + "Importar CSV"
 *   · Cards das listas existentes
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../../components/DashboardLayout';
import LeadListCard from '../../../../components/comercial/LeadListCard';
import CaptacaoFiltersForm from '../../../../components/comercial/CaptacaoFiltersForm';
import CSVUploadModal from '../../../../components/comercial/CSVUploadModal';
import ConfirmModal from '../../../../components/comercial/ConfirmModal';
import { useNotification } from '../../../../context/NotificationContext';
import styles from '../../../../assets/style/comercialCaptacao.module.css';

export default function CaptacaoPage() {
  const { notify } = useNotification();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showCSV, setShowCSV] = useState(false);
  const [maxJobsPerDay, setMaxJobsPerDay] = useState(10);

  async function fetchLists() {
    setLoading(true);
    try {
      const res = await fetch('/api/comercial/captacao/lists');
      const json = await res.json();
      if (json.success) setLists(json.lists);
    } catch (err) {
      notify('Erro ao carregar listas', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch('/api/comercial/settings');
      const json = await res.json();
      if (json.success) {
        setMaxJobsPerDay(Number(json.settings.comercial_max_jobs_per_day) || 10);
      }
    } catch {}
  }

  useEffect(() => { fetchLists(); fetchSettings(); }, []);

  const kpis = useMemo(() => {
    const active = lists.filter(l => l.status === 'completed' || l.status === 'running');
    const totalLeads = lists.reduce((s, l) => s + (l.leadsCount || l.totalLeads || 0), 0);
    const todayJobs = lists.filter(l =>
      Date.now() - new Date(l.createdAt).getTime() < 24 * 60 * 60 * 1000
    ).length;
    return {
      active: active.length,
      totalLeads,
      remaining: Math.max(0, maxJobsPerDay - todayJobs),
    };
  }, [lists, maxJobsPerDay]);

  const [pendingDelete, setPendingDelete] = useState(null);

  function handleDelete(list) {
    setPendingDelete(list);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      const res = await fetch(`/api/comercial/captacao/lists/${pendingDelete.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Falha');
      notify('Lista deletada', 'success');
      setPendingDelete(null);
      fetchLists();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  function handleExport(list) {
    window.location.href = `/api/comercial/captacao/lists/${list.id}/export`;
  }

  function handleImportLink(list) {
    window.location.href = `/dashboard/comercial/captacao/${list.id}`;
  }

  return (
    <DashboardLayout activeTab="comercial/captacao">
      <div className={styles.page}>
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <h1 className="page-title">Captação de Leads</h1>
            <p className="page-subtitle">
              Capte leads do Google Maps via Apify ou importe CSV manual.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button className="btn btn-secondary" onClick={() => setShowCSV(true)}>
              Importar CSV
            </button>
            <button className="sigma-btn-primary" onClick={() => setShowFilters(true)}>
              + Nova captação
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className={styles.kpiGrid}>
          <div className={`glass-card ${styles.kpi}`}>
            <span className={styles.kpiLabel}>Listas ativas</span>
            <span className={styles.kpiValue}>{kpis.active}</span>
            <span className={styles.kpiHint}>de {lists.length} totais</span>
          </div>
          <div className={`glass-card ${styles.kpi}`}>
            <span className={styles.kpiLabel}>Leads captados</span>
            <span className={styles.kpiValue}>{kpis.totalLeads}</span>
            <span className={styles.kpiHint}>todas as listas</span>
          </div>
          <div className={`glass-card ${styles.kpi}`}>
            <span className={styles.kpiLabel}>Jobs hoje</span>
            <span className={styles.kpiValue}>{kpis.remaining}</span>
            <span className={styles.kpiHint}>restantes / {maxJobsPerDay}</span>
          </div>
        </div>

        {/* Lista de listas */}
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Carregando listas...
          </div>
        ) : lists.length === 0 ? (
          <div className={`glass-card ${styles.empty}`}>
            <h3>Nenhuma lista ainda</h3>
            <p>Comece criando sua primeira captação no Google Maps ou importando um CSV de leads que você já tenha.</p>
            <button className="sigma-btn-primary" onClick={() => setShowFilters(true)}>
              + Nova captação
            </button>
          </div>
        ) : (
          <div className={`${styles.listsGrid} ${styles.staggerList}`}>
            {lists.map(l => (
              <LeadListCard
                key={l.id}
                list={l}
                onDelete={handleDelete}
                onExport={handleExport}
                onImport={handleImportLink}
              />
            ))}
          </div>
        )}

        {showFilters && <CaptacaoFiltersForm onClose={() => { setShowFilters(false); fetchLists(); }} />}
        {showCSV     && <CSVUploadModal     onClose={() => { setShowCSV(false);     fetchLists(); }} />}

        <ConfirmModal
          open={!!pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          variant="danger"
          title="Excluir lista"
          description="Esta ação é permanente e não pode ser desfeita. Confirme antes de prosseguir."
          warningTitle="Tem certeza que deseja excluir"
          warningHighlight={pendingDelete?.name || ''}
          warningText={pendingDelete
            ? `Os ${pendingDelete.leadsCount || pendingDelete.totalLeads || 0} leads desta lista serão removidos. Os ${pendingDelete.importedCount || 0} leads já importados pro Pipeline permanecem lá.`
            : ''}
          warningCascade="leads · raw_data · filters"
          confirmLabel="Excluir definitivamente"
          cancelLabel="Cancelar"
        />
      </div>
    </DashboardLayout>
  );
}
