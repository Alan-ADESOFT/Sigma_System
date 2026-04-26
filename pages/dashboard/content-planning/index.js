/**
 * pages/dashboard/content-planning/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lista de planejamentos em formato Kanban (drag-and-drop entre status).
 * Inclui KPIs, filtros (mês + busca), modal "Novo Planejamento" limpo e
 * popups de CRUD (info, edit, delete) acionados pelo menu do card.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import DashboardLayout from '../../../components/DashboardLayout';
import ClientSelect from '../../../components/ClientSelect';
import { Skeleton } from '../../../components/Skeleton';
import { useNotification } from '../../../context/NotificationContext';
import { useContentPlanningActivity } from '../../../hooks/useContentPlanningActivity';
import styles from '../../../assets/style/contentPlanning.module.css';

const PlanCard = dynamic(() => import('../../../components/contentPlanning/PlanCard'), { ssr: false });
const PlanModal = dynamic(() => import('../../../components/contentPlanning/PlanModal'), { ssr: false });
const DatePicker = dynamic(() => import('react-datepicker'), { ssr: false });

function monthLabelPT(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function todayMonthFirstDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ContentPlanningKanbanPage() {
  const router = useRouter();
  const { notify } = useNotification();

  // Dados
  const [statuses, setStatuses] = useState([]);
  const [plans, setPlans] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filterMonth, setFilterMonth] = useState(null); // Date | null
  const [search, setSearch] = useState('');

  // Modais
  const [newOpen, setNewOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // { mode: 'info'|'edit'|'delete', planId }

  // Drag state
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const activity = useContentPlanningActivity({ enabled: true });

  /* ── Carregamento inicial ───────────────────────────────── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusesRes, plansRes, clientsRes, usersRes] = await Promise.all([
        fetch('/api/content-planning/statuses').then(r => r.json()),
        fetch('/api/content-planning/plans?isTemplate=false&limit=200').then(r => r.json()),
        fetch('/api/clients').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/users').then(r => r.json()).catch(() => ({ success: false })),
      ]);
      if (statusesRes.success) setStatuses(statusesRes.statuses || []);
      if (plansRes.success) setPlans(plansRes.plans || []);
      if (clientsRes.success) setClients(clientsRes.clients || []);
      if (usersRes.success) setUsers(usersRes.users || []);
    } catch {
      notify('Erro ao carregar planejamentos', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── Pré-seleciona cliente vindo de /clients/[id] ───────── */
  useEffect(() => {
    if (router.query.newClient && !newOpen) setNewOpen(true);
  }, [router.query.newClient, newOpen]);

  /* ── Filtro client-side ─────────────────────────────────── */
  const filtered = useMemo(() => {
    return plans.filter(p => {
      if (filterMonth) {
        const m = p.month_reference ? String(p.month_reference).slice(0, 7) : '';
        const target = `${filterMonth.getFullYear()}-${String(filterMonth.getMonth() + 1).padStart(2, '0')}`;
        if (m !== target) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!(p.title || '').toLowerCase().includes(q) &&
            !(p.client_company_name || '').toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [plans, filterMonth, search]);

  /* ── KPIs ───────────────────────────────────────────────── */
  const kpis = useMemo(() => {
    const total = filtered.length;
    let pending = 0, approved = 0, late = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const p of filtered) {
      if (p.status_key === 'client_review') pending++;
      if (p.status_key === 'approved' || p.status_key === 'finalized') approved++;
      if (p.due_date && !p.status_is_terminal) {
        const d = new Date(p.due_date);
        if (d.getTime() < today.getTime() && p.status_key !== 'finalized') late++;
      }
    }
    return { total, pending, approved, late };
  }, [filtered]);

  /* ── Agrupa por coluna ──────────────────────────────────── */
  const plansByStatus = useMemo(() => {
    const map = new Map(statuses.map(s => [s.id, []]));
    map.set('__no_status__', []);
    for (const p of filtered) {
      const key = p.status_id || '__no_status__';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [filtered, statuses]);

  /* ── Drag and drop ──────────────────────────────────────── */
  function handleDragStart(e, plan) {
    setDraggingId(plan.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', plan.id);
  }
  function handleDragEnd() { setDraggingId(null); setDragOverColumn(null); }
  function handleColumnDragOver(e, statusId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== statusId) setDragOverColumn(statusId);
  }
  function handleColumnDragLeave(e) {
    if (e.currentTarget === e.target) setDragOverColumn(null);
  }
  async function handleColumnDrop(e, status) {
    e.preventDefault();
    setDragOverColumn(null);
    const planId = e.dataTransfer.getData('text/plain');
    if (!planId || !status) return;

    const plan = plans.find(p => p.id === planId);
    if (!plan || plan.status_id === status.id) { setDraggingId(null); return; }

    setPlans(prev => prev.map(p => p.id === planId ? {
      ...p,
      status_id: status.id,
      status_key: status.key,
      status_label: status.label,
      status_color: status.color,
      status_is_terminal: status.is_terminal,
    } : p));
    setDraggingId(null);

    try {
      const r = await fetch(`/api/content-planning/plans/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId: status.id }),
      });
      const d = await r.json();
      if (d.success) notify(`Movido para ${status.label}`, 'success');
      else { notify(d.error || 'Erro ao mover', 'error'); loadAll(); }
    } catch { notify('Falha de rede', 'error'); loadAll(); }
  }

  /* ── Card menu ──────────────────────────────────────────── */
  async function handleCardMenu(planId, action) {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    if (action === 'info' || action === 'edit' || action === 'delete') {
      setActiveModal({ mode: action, planId });
      return;
    }

    if (action === 'clone') {
      try {
        const r = await fetch(`/api/content-planning/plans/${planId}/clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const d = await r.json();
        if (d.success) { notify('Planejamento duplicado', 'success'); loadAll(); }
        else notify(d.error || 'Erro ao duplicar', 'error');
      } catch { notify('Falha de rede', 'error'); }
      return;
    }

    if (action === 'share') {
      router.push(`/dashboard/content-planning/${planId}?tab=share`);
    }
  }

  /* ── Plano ativo no modal ───────────────────────────────── */
  const activePlan = activeModal ? plans.find(p => p.id === activeModal.planId) : null;

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <DashboardLayout activeTab="content-planning">
      <div className={styles.pageContainer}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Planejamento Editorial</h1>
            <div className={styles.pageSubtitle}>
              Gestão de planejamentos mensais por cliente
              {activity.unreadCount > 0 && (
                <span style={{
                  marginLeft: 10,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(255,0,51,0.1)',
                  border: '1px solid var(--border-accent)',
                  color: 'var(--brand-300)',
                  fontSize: '0.55rem',
                  fontWeight: 700,
                }}>
                  {activity.unreadCount} novo{activity.unreadCount === 1 ? '' : 's'} evento{activity.unreadCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
          <div className={styles.pageActions}>
            <button type="button" className={styles.btnPrimary} onClick={() => setNewOpen(true)}>
              <PlusIcon />
              Novo Plano
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className={styles.kpiRow}>
          <div className={`glass-card ${styles.kpiCard}`}>
            <div className={styles.kpiLabel}>Total</div>
            <div className={styles.kpiValue}>{kpis.total}</div>
            <div className={styles.kpiHint}>Planos ativos</div>
          </div>
          <div className={`glass-card ${styles.kpiCard}`}>
            <div className={styles.kpiLabel}>Aguardando aprovação</div>
            <div className={styles.kpiValue} style={{ color: 'var(--warning)' }}>{kpis.pending}</div>
            <div className={styles.kpiHint}>Cliente revisando</div>
          </div>
          <div className={`glass-card ${styles.kpiCard}`}>
            <div className={styles.kpiLabel}>Aprovados</div>
            <div className={styles.kpiValue} style={{ color: 'var(--success)' }}>{kpis.approved}</div>
            <div className={styles.kpiHint}>Prontos para publicar</div>
          </div>
          <div className={`glass-card ${styles.kpiCard}`}>
            <div className={styles.kpiLabel}>Atrasados</div>
            <div className={styles.kpiValue} style={{ color: 'var(--brand-400)' }}>{kpis.late}</div>
            <div className={styles.kpiHint}>Passaram do prazo</div>
          </div>
        </div>

        {/* Filtros */}
        <div className={styles.filtersBar}>
          <FilterField icon={<SearchIcon />} grow>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título ou empresa..."
            />
            {search && (
              <button type="button" className={styles.filterClear} onClick={() => setSearch('')} aria-label="Limpar busca">
                <ClearIcon />
              </button>
            )}
          </FilterField>
          <div className={styles.filterDatepicker}>
            <span className={styles.filterIcon}><CalendarIcon /></span>
            <DatePicker
              selected={filterMonth}
              onChange={(d) => setFilterMonth(d)}
              dateFormat="MMMM 'de' yyyy"
              showMonthYearPicker
              showFullMonthYearPicker
              placeholderText="Filtrar por mês"
              className={styles.filterDatepickerInput}
              popperPlacement="bottom-end"
              isClearable
            />
          </div>
        </div>

        {/* Kanban */}
        {loading ? (
          <div style={{ display: 'flex', gap: 12 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ width: 290 }}>
                <Skeleton width="100%" height={36} style={{ marginBottom: 8 }} />
                <Skeleton width="100%" height={120} style={{ marginBottom: 8 }} />
                <Skeleton width="100%" height={120} />
              </div>
            ))}
          </div>
        ) : statuses.length === 0 ? (
          <div className="glass-card" style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Nenhum status configurado. Recarregue a página para semear os defaults.
          </div>
        ) : (
          <div className={styles.kanbanScroll}>
            <div className={styles.kanbanContainer}>
              {statuses.map(status => {
                const list = plansByStatus.get(status.id) || [];
                const isOver = dragOverColumn === status.id;
                return (
                  <div
                    key={status.id}
                    className={`${styles.kanbanColumn} ${isOver ? styles.kanbanColumnDragOver : ''}`}
                    onDragOver={(e) => handleColumnDragOver(e, status.id)}
                    onDragLeave={handleColumnDragLeave}
                    onDrop={(e) => handleColumnDrop(e, status)}
                  >
                    <div className={styles.columnHeader}>
                      <div className={styles.columnTitle}>
                        <span className={styles.columnDot} style={{ background: status.color }} />
                        {status.label}
                      </div>
                      <span className={styles.columnCount}>{list.length}</span>
                    </div>
                    <div className={styles.columnBody}>
                      {list.length === 0 ? (
                        <div className={styles.columnEmpty}>// vazio</div>
                      ) : (
                        list.map(p => (
                          <PlanCard
                            key={p.id}
                            plan={p}
                            dragging={draggingId === p.id}
                            onOpen={() => router.push(`/dashboard/content-planning/${p.id}`)}
                            onMenu={handleCardMenu}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {newOpen && (
        <NewPlanModal
          clients={clients}
          defaultClientId={typeof router.query.newClient === 'string' ? router.query.newClient : ''}
          onClose={() => setNewOpen(false)}
          onCreated={(plan) => {
            setNewOpen(false);
            setPlans(prev => [plan, ...prev]);
            notify('Planejamento criado', 'success');
            router.push(`/dashboard/content-planning/${plan.id}`);
          }}
        />
      )}

      {activeModal && activePlan && (
        <PlanModal
          mode={activeModal.mode}
          plan={activePlan}
          statuses={statuses}
          users={users}
          onClose={() => setActiveModal(null)}
          onSwitchMode={(mode) => setActiveModal({ ...activeModal, mode })}
          onUpdated={(updated) => {
            setPlans(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
          }}
          onDeleted={() => {
            setPlans(prev => prev.filter(p => p.id !== activeModal.planId));
            setActiveModal(null);
          }}
        />
      )}
    </DashboardLayout>
  );
}

/* ─────────────────────────────────────────────────────────────
   Filter field — input com ícone à esquerda
───────────────────────────────────────────────────────────── */
function FilterField({ icon, grow, children }) {
  return (
    <div className={`${styles.filterInput} ${grow ? styles.filterInputGrow : ''}`}>
      <span className={styles.filterIcon}>{icon}</span>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Modal "Novo Planejamento" — header rich + datepicker plugin
───────────────────────────────────────────────────────────── */
function NewPlanModal({ clients, defaultClientId, onClose, onCreated }) {
  const { notify } = useNotification();
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [title, setTitle] = useState('');
  const [monthRefDate, setMonthRefDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [objective, setObjective] = useState('');
  const [centralPromise, setCentralPromise] = useState('');
  const [dueDateD, setDueDateD] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);

  // Autopreenche o título quando cliente/mês mudam
  useEffect(() => {
    if (titleTouched) return;
    const c = clients.find(c => c.id === clientId);
    if (c && monthRefDate) {
      const ref = `${monthRefDate.getFullYear()}-${String(monthRefDate.getMonth() + 1).padStart(2, '0')}-01`;
      const monthName = monthLabelPT(ref);
      setTitle(`${monthName.charAt(0).toUpperCase() + monthName.slice(1)} — ${c.company_name}`);
    }
  }, [clientId, monthRefDate, clients, titleTouched]);

  function ymd(d) {
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function submit() {
    if (!clientId) return notify('Selecione um cliente', 'error');
    if (!title.trim()) return notify('Título obrigatório', 'error');

    setSubmitting(true);
    try {
      const r = await fetch('/api/content-planning/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          title: title.trim(),
          monthReference: monthRefDate ? `${monthRefDate.getFullYear()}-${String(monthRefDate.getMonth() + 1).padStart(2, '0')}-01` : null,
          objective: objective.trim() || null,
          centralPromise: centralPromise.trim() || null,
          dueDate: dueDateD ? ymd(dueDateD) : null,
        }),
      });
      const d = await r.json();
      if (!d.success) { notify(d.error || 'Erro ao criar', 'error'); setSubmitting(false); return; }

      let createdPlan = d.plan;
      try {
        const full = await fetch(`/api/content-planning/plans/${createdPlan.id}`).then(r => r.json());
        if (full.success) createdPlan = full.plan;
      } catch {}

      onCreated(createdPlan);
    } catch {
      notify('Falha de rede', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalCard} ${styles.modalCardWide}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconBrand}`} aria-hidden="true">
            <PlusIconLg />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Novo planejamento</div>
            <div className={styles.modalHeaderDesc}>
              Defina o cliente, o mês de referência e a estratégia base. Você pode
              ajustar e adicionar criativos depois.
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Cliente *</label>
            <ClientSelect clients={clients} value={clientId} onChange={setClientId} placeholder="Selecione" />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Título *</label>
            <input
              className="sigma-input"
              type="text"
              value={title}
              onChange={(e) => { setTitleTouched(true); setTitle(e.target.value); }}
              placeholder="Ex: Janeiro 2026 — Cliente"
            />
          </div>

          <div className={styles.formGroup}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Mês de referência</label>
              <div className={styles.dpWrap}>
                <span className={styles.dpIcon}><CalendarIcon /></span>
                <DatePicker
                  selected={monthRefDate}
                  onChange={(d) => setMonthRefDate(d)}
                  dateFormat="MMMM 'de' yyyy"
                  showMonthYearPicker
                  showFullMonthYearPicker
                  placeholderText="Selecione o mês"
                  className={styles.dpInput}
                  popperPlacement="bottom-start"
                  isClearable
                />
              </div>
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Data limite</label>
              <div className={styles.dpWrap}>
                <span className={styles.dpIcon}><ClockIcon /></span>
                <DatePicker
                  selected={dueDateD}
                  onChange={(d) => setDueDateD(d)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="dd/mm/aaaa"
                  className={styles.dpInput}
                  popperPlacement="bottom-start"
                  isClearable
                />
              </div>
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionTitle}>Estratégia (opcional)</div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Promessa central</label>
              <textarea className="sigma-input" rows={2} value={centralPromise} onChange={(e) => setCentralPromise(e.target.value)} placeholder="A grande promessa do mês..." />
            </div>
            <div className={styles.formField} style={{ marginTop: 10 }}>
              <label className={styles.formLabel}>Objetivo do mês</label>
              <textarea className="sigma-input" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="O que precisa acontecer este mês..." />
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={submitting}>Cancelar</button>
          <button type="button" className={styles.btnPrimary} onClick={submit} disabled={submitting}>
            {submitting ? 'Criando...' : 'Criar Planejamento'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Icons (SVG inline, sem libs)
───────────────────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PlusIconLg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
