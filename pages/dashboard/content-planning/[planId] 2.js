/**
 * pages/dashboard/content-planning/[planId].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor de UM planejamento. 6 tabs:
 *   visao | estrategia | creatives | preview | share | history
 *
 * Auto-save da Visao Geral e Estrategia via debounce. Criativos sao gerenciados
 * em CreativeCard (cada um com seu proprio auto-save).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import DashboardLayout from '../../../components/DashboardLayout';
import { Skeleton } from '../../../components/Skeleton';
import { useNotification } from '../../../context/NotificationContext';
import { useContentPlan } from '../../../hooks/useContentPlan';
import styles from '../../../assets/style/contentPlanning.module.css';

const CreativeCard = dynamic(() => import('../../../components/contentPlanning/CreativeCard'), { ssr: false });
const ShareLinkPanel = dynamic(() => import('../../../components/contentPlanning/ShareLinkPanel'), { ssr: false });
const VersionTimeline = dynamic(() => import('../../../components/contentPlanning/VersionTimeline'), { ssr: false });
const DatePicker = dynamic(() => import('react-datepicker'), { ssr: false });

const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function fmtMonthLabel(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return `${MONTHS_PT[dt.getMonth()]} de ${dt.getFullYear()}`;
}
function dateOrNull(s) {
  if (!s) return null;
  const dt = new Date(typeof s === 'string' ? `${String(s).slice(0, 10)}T00:00:00` : s);
  return isNaN(dt.getTime()) ? null : dt;
}
function dateToYMD(d) {
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const TABS = [
  { id: 'visao',     label: 'Visão Geral' },
  { id: 'creatives', label: 'Criativos' },
  { id: 'review',    label: 'Review' },
  { id: 'share',     label: 'Compartilhar' },
  { id: 'history',   label: 'Histórico' },
];

export default function PlanEditorPage() {
  const router = useRouter();
  const { notify } = useNotification();
  const { planId } = router.query;
  const { plan, loading, refresh, setPlan } = useContentPlan(planId);

  const [statuses, setStatuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('visao');

  // Carrega status + users uma vez
  useEffect(() => {
    fetch('/api/content-planning/statuses').then(r => r.json()).then(d => { if (d.success) setStatuses(d.statuses || []); });
    fetch('/api/users').then(r => r.json()).then(d => { if (d.success) setUsers(d.users || []); }).catch(() => {});
  }, []);

  // Tab via query (?tab=share)
  useEffect(() => {
    const t = router.query.tab;
    if (t && TABS.some(x => x.id === t)) setActiveTab(t);
  }, [router.query.tab]);

  function changeTab(id) {
    setActiveTab(id);
    router.replace({ pathname: router.pathname, query: { ...router.query, tab: id } }, undefined, { shallow: true });
  }

  /* ── Mudanca de status (header) ─────────────────────────── */
  async function changeStatus(statusId) {
    if (!plan) return;
    const status = statuses.find(s => s.id === statusId);
    setPlan({ ...plan, status_id: statusId, status_label: status?.label, status_color: status?.color, status_key: status?.key });
    try {
      const r = await fetch(`/api/content-planning/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId }),
      });
      const d = await r.json();
      if (d.success) notify('Status atualizado', 'success');
      else notify(d.error || 'Erro ao atualizar', 'error');
    } catch { notify('Falha de rede', 'error'); }
  }

  if (loading || !plan) {
    return (
      <DashboardLayout activeTab="content-planning">
        <Skeleton width="40%" height={28} style={{ marginBottom: 16 }} />
        <Skeleton width="100%" height={140} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="content-planning">
      <div className={styles.editorHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <button type="button" className={styles.editorBackBtn} onClick={() => router.push('/dashboard/content-planning')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            Voltar
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 className={styles.editorTitle} title={plan.title}>{plan.title}</h1>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.05em' }}>
              {plan.client_company_name || '—'}
              {plan.month_reference && <span> · {String(plan.month_reference).slice(0, 7)}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            className="sigma-input"
            value={plan.status_id || ''}
            onChange={(e) => changeStatus(e.target.value)}
            style={{ width: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}
          >
            <option value="">Sem status</option>
            {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.editorTabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`${styles.editorTab} ${activeTab === t.id ? styles.editorTabActive : ''}`}
            onClick={() => changeTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'visao' && (
        <TabVisao
          plan={plan}
          onChange={setPlan}
        />
      )}

      {activeTab === 'creatives' && (
        <TabCriativos plan={plan} onRefresh={refresh} setPlan={setPlan} />
      )}

      {activeTab === 'review' && (
        <TabReview plan={plan} onRefresh={refresh} />
      )}

      {activeTab === 'share' && (
        <ShareLinkPanel planId={plan.id} planTitle={plan.title} />
      )}

      {activeTab === 'history' && (
        <VersionTimeline planId={plan.id} onRestored={refresh} />
      )}
    </DashboardLayout>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab: Visão Geral
───────────────────────────────────────────────────────────── */
function TabVisao({ plan, onChange }) {
  const [title, setTitle] = useState(plan.title || '');
  const [monthRefDate, setMonthRefDate] = useState(dateOrNull(plan.month_reference));
  const [objective, setObjective] = useState(plan.objective || '');
  const [centralPromise, setCentralPromise] = useState(plan.central_promise || '');
  const [strategyNotes, setStrategyNotes] = useState(plan.strategy_notes || '');
  const [dueDateD, setDueDateD] = useState(dateOrNull(plan.due_date));
  const [savedAt, setSavedAt] = useState(null);
  const debounceRef = useRef(null);
  const skipFirst = useRef(true);

  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(persist, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, monthRefDate, objective, centralPromise, strategyNotes, dueDateD]);

  async function persist() {
    try {
      const r = await fetch(`/api/content-planning/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          monthReference: monthRefDate ? `${monthRefDate.getFullYear()}-${String(monthRefDate.getMonth() + 1).padStart(2, '0')}-01` : null,
          objective,
          centralPromise,
          strategyNotes,
          dueDate: dueDateD ? dateToYMD(dueDateD) : null,
        }),
      });
      const d = await r.json();
      if (d.success && d.plan) {
        onChange({ ...plan, ...d.plan });
        setSavedAt(Date.now());
      }
    } catch {}
  }

  const total = Number(plan.creative_count || (plan.creatives || []).length || 0);
  const approved = Number(plan.approved_count || 0);
  const rejected = Number(plan.rejected_count || 0);
  const progress = total > 0 ? Math.round((approved / total) * 100) : 0;

  return (
    <div className={styles.editorPanel}>
      {/* Cabeçalho do plano (resumo executivo) */}
      <div className={`glass-card ${styles.visaoSummary}`}>
        <div className={styles.visaoSummaryLeft}>
          <div className={styles.visaoCompanyChip}>
            <CompanyIcon />
            <span>{plan.client_company_name || '—'}</span>
          </div>
          <div className={styles.visaoSummaryTitle}>{plan.title || 'Sem título'}</div>
          <div className={styles.visaoSummaryMeta}>
            <span className={styles.visaoMetaItem}><CalendarIcon /> {fmtMonthLabel(plan.month_reference) || '—'}</span>
            {plan.due_date && (
              <span className={styles.visaoMetaItem}><ClockIcon /> Prazo: {new Date(plan.due_date).toLocaleDateString('pt-BR')}</span>
            )}
          </div>
        </div>
        <div className={styles.visaoSummaryRight}>
          {plan.status_label && (
            <span
              className={styles.visaoStatusPill}
              style={{
                background: `${plan.status_color || '#525252'}1a`,
                border: `1px solid ${plan.status_color || '#525252'}55`,
                color: plan.status_color || 'var(--text-muted)',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
              {plan.status_label}
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className={styles.kpiRow}>
        <div className={`glass-card ${styles.kpiCard}`}>
          <div className={styles.kpiLabel}>Criativos</div>
          <div className={styles.kpiValue}>{total}</div>
          <div className={styles.kpiHint}>peças no planejamento</div>
        </div>
        <div className={`glass-card ${styles.kpiCard}`}>
          <div className={styles.kpiLabel}>Aprovados</div>
          <div className={styles.kpiValue} style={{ color: '#10B981' }}>{approved}</div>
          <div className={styles.kpiHint}>{progress}% do total</div>
        </div>
        <div className={`glass-card ${styles.kpiCard}`}>
          <div className={styles.kpiLabel}>Reprovados / ajustes</div>
          <div className={styles.kpiValue} style={{ color: '#F59E0B' }}>{rejected}</div>
          <div className={styles.kpiHint}>aguardando alteração</div>
        </div>
      </div>

      {/* Form principal */}
      <div className={`glass-card ${styles.visaoForm}`}>
        <div className={styles.visaoFormHeader}>
          <div className={styles.formSectionTitle}>Informações do plano</div>
          <div className={styles.savedHint}>
            {savedAt ? <><CheckIcon /> Salvo automaticamente</> : 'Auto-save ativo'}
          </div>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Título</label>
          <input className="sigma-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
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
            <label className={styles.formLabel}>Data limite de entrega</label>
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

        {/* ── Bloco explicativo dos 3 pilares ───────────────────── */}
        <div className={styles.strategyExplain}>
          <div className={styles.strategyExplainTitle}>
            <BookIcon /> Como preencher os 3 pilares
          </div>
          <div className={styles.strategyExplainGrid}>
            <div className={styles.strategyExplainItem}>
              <div className={styles.strategyExplainLabel}><FlagIcon /> Objetivo do mês</div>
              <div className={styles.strategyExplainText}>
                A meta concreta que o conteúdo precisa entregar — em número, ação ou
                resultado mensurável. <em>Ex: "30 reservas via WhatsApp"</em>.
              </div>
            </div>
            <div className={styles.strategyExplainItem}>
              <div className={styles.strategyExplainLabel}><MapIcon /> Estratégia</div>
              <div className={styles.strategyExplainText}>
                Como o conteúdo vai chegar lá — pilares, formatos, tom de voz, frequência,
                hashtags-padrão. É o "raio-X" do plano para a equipe e a IA seguirem.
              </div>
            </div>
            <div className={styles.strategyExplainItem}>
              <div className={styles.strategyExplainLabel}><TargetIcon /> Promessa central</div>
              <div className={styles.strategyExplainText}>
                Em uma frase: o benefício que o público recebe seguindo o plano. Aparece
                na cabeça do cliente quando ele revisa as peças no link de aprovação.
              </div>
            </div>
          </div>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>
            <FlagIcon /> Objetivo do mês
          </label>
          <textarea className="sigma-input" rows={3} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="O que precisa acontecer este mês..." />
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>
            <MapIcon /> Estratégia do mês
          </label>
          <textarea
            className="sigma-input"
            rows={5}
            value={strategyNotes}
            onChange={(e) => setStrategyNotes(e.target.value)}
            placeholder="Pilares, tom de voz, KPIs, formatos preferenciais, hashtags-padrão, restrições..."
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', lineHeight: 1.55 }}
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>
            <TargetIcon /> Promessa central
          </label>
          <textarea className="sigma-input" rows={3} value={centralPromise} onChange={(e) => setCentralPromise(e.target.value)} placeholder="A grande promessa do mês..." />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Ícones SVG inline da Visão Geral
───────────────────────────────────────────────────────────── */
function CompanyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function FlagIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab: Criativos (lista + add + drag reorder)
───────────────────────────────────────────────────────────── */
function TabCriativos({ plan, setPlan, onRefresh }) {
  const { notify } = useNotification();
  const [creatives, setCreatives] = useState(plan.creatives || []);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // creative | null
  const [pendingUnlock, setPendingUnlock] = useState(null); // creative | null
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => { setCreatives(plan.creatives || []); }, [plan.creatives, plan.id]);

  async function addCreative() {
    try {
      const r = await fetch('/api/content-planning/creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, type: 'post' }),
      });
      const d = await r.json();
      if (d.success) {
        setCreatives(prev => [...prev, d.creative]);
        notify('Criativo adicionado', 'success');
      } else notify(d.error || 'Erro', 'error');
    } catch { notify('Falha de rede', 'error'); }
  }

  function patchCreativeLocal(updated) {
    setCreatives(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  }

  async function confirmDeleteCreative() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    try {
      const r = await fetch(`/api/content-planning/creatives/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) {
        setCreatives(prev => prev.filter(c => c.id !== id));
        notify('Criativo excluído', 'success');
      } else notify(d.error || 'Erro', 'error');
    } catch { notify('Falha de rede', 'error'); }
    finally { setPendingDelete(null); }
  }

  async function confirmUnlock() {
    if (!pendingUnlock) return;
    const id = pendingUnlock.id;
    setUnlocking(true);
    try {
      const r = await fetch(`/api/content-planning/creatives/${id}/reset-decision`, { method: 'POST' });
      const d = await r.json();
      if (d.success && d.creative) {
        setCreatives(prev => prev.map(c => c.id === id ? { ...c, ...d.creative } : c));
        notify('Criativo liberado para edição. Vai aparecer no link de aprovação novamente.', 'success', { duration: 6000 });
      } else {
        notify(d.error || 'Erro ao liberar', 'error');
      }
    } catch { notify('Falha de rede', 'error'); }
    finally {
      setUnlocking(false);
      setPendingUnlock(null);
    }
  }

  /* ── Drag reorder ───────────────────────────────────────── */
  function handleDragStart(e, id) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
  function handleDragEnd() {
    setDragId(null);
    setOverId(null);
  }
  function handleDragOver(e, id) {
    e.preventDefault();
    if (overId !== id) setOverId(id);
  }
  async function handleDrop(e, dropId) {
    e.preventDefault();
    setOverId(null);
    if (!dragId || dragId === dropId) { setDragId(null); return; }
    const fromIdx = creatives.findIndex(c => c.id === dragId);
    const toIdx = creatives.findIndex(c => c.id === dropId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...creatives];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setCreatives(next);
    setDragId(null);

    try {
      const r = await fetch('/api/content-planning/creatives', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, orderedIds: next.map(c => c.id) }),
      });
      const d = await r.json();
      if (!d.success) {
        notify(d.error || 'Erro ao reordenar', 'error');
        onRefresh();
      }
    } catch { notify('Falha de rede', 'error'); onRefresh(); }
  }

  return (
    <div className={styles.editorPanel}>
      {/* Manual de uso — sempre visível no topo */}
      <CreativosManual />

      {creatives.length === 0 ? (
        <div className={styles.emptyCreatives}>
          <div className={styles.emptyCreativesIcon} aria-hidden="true">
            <SparkleIcon />
          </div>
          <div className={styles.emptyCreativesTitle}>Nenhum criativo ainda</div>
          <div className={styles.emptyCreativesText}>
            Clique em <strong style={{ color: 'var(--brand-300)' }}>Adicionar criativo</strong> e dê
            início ao processo. Você poderá enviar mídias, escrever a legenda e organizar a
            ordem do calendário.
          </div>
          <div className={styles.emptyCreativesCta}>
            <button type="button" className={styles.btnPrimary} onClick={addCreative}>
              <PlusIconSm />
              Adicionar primeiro criativo
            </button>
          </div>
        </div>
      ) : (
        creatives.map((c, i) => (
          <CreativeCard
            key={c.id}
            creative={c}
            index={i + 1}
            planId={plan.id}
            clientId={plan.client_id}
            onUpdate={patchCreativeLocal}
            onRequestDelete={(creative) => setPendingDelete(creative)}
            onRequestUnlock={(creative) => setPendingUnlock(creative)}
            dragging={dragId === c.id}
            dragOver={overId === c.id && dragId !== c.id}
            onDragStart={(e) => handleDragStart(e, c.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, c.id)}
            onDrop={(e) => handleDrop(e, c.id)}
          />
        ))
      )}

      {creatives.length > 0 && (
        <button type="button" className={styles.addCreativeBtn} onClick={addCreative}>
          + Adicionar criativo
        </button>
      )}

      {pendingDelete && (
        <CreativeDeleteModal
          creative={pendingDelete}
          index={creatives.findIndex(c => c.id === pendingDelete.id) + 1}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDeleteCreative}
        />
      )}

      {pendingUnlock && (
        <UnlockApprovedModal
          creative={pendingUnlock}
          index={creatives.findIndex(c => c.id === pendingUnlock.id) + 1}
          submitting={unlocking}
          onCancel={() => setPendingUnlock(null)}
          onConfirm={confirmUnlock}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Manual de uso (topo da aba)
───────────────────────────────────────────────────────────── */
function CreativosManual() {
  return (
    <div className={styles.manualCard}>
      <div className={styles.manualIcon} aria-hidden="true">
        <BookIconLg />
      </div>
      <div className={styles.manualBody}>
        <div className={styles.manualTitle}>Manual de uso</div>
        <div className={styles.manualSubtitle}>
          Crie cada peça do calendário com mídia + legenda. Use o gerador de copy
          para acelerar a escrita e organize a ordem arrastando os cards.
        </div>
        <div className={styles.manualSteps}>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>01</span>
            <div className={styles.manualStepText}>
              <strong>Adicione um criativo</strong> e escolha o tipo (Post, Reel, Carrossel ou Story).
              O formato definido valida o aspecto da mídia automaticamente.
            </div>
          </div>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>02</span>
            <div className={styles.manualStepText}>
              <strong>Faça upload da mídia</strong> respeitando o aspecto sugerido. Para carrossel,
              ative o toggle "Múltiplas mídias".
            </div>
          </div>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>03</span>
            <div className={styles.manualStepText}>
              <strong>Escreva a legenda completa</strong> incluindo gancho, CTA e hashtags. Use
              "Importar do Gerador de Copy" para puxar textos prontos.
            </div>
          </div>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>04</span>
            <div className={styles.manualStepText}>
              <strong>Defina data e horário</strong> de publicação. Tudo é salvo
              automaticamente — basta editar e seguir.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Modal de confirmação ao excluir criativo (padrão Icon+Título+Desc)
───────────────────────────────────────────────────────────── */
function CreativeDeleteModal({ creative, index, onCancel, onConfirm }) {
  const [submitting, setSubmitting] = useState(false);
  const captionPreview = (creative.caption || '').trim().slice(0, 90);

  async function handleConfirm() {
    setSubmitting(true);
    await onConfirm();
    setSubmitting(false);
  }

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconWarning}`} aria-hidden="true">
            <TrashIcon />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Excluir criativo</div>
            <div className={styles.modalHeaderDesc}>
              Esta ação é permanente. A peça sairá do calendário e não poderá ser
              recuperada.
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onCancel} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.deleteWarning}>
            <div className={styles.deleteWarningIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className={styles.deleteWarningBody}>
              <div className={styles.deleteWarningTitle}>
                Excluir o criativo <span style={{ color: 'var(--brand-300)' }}>#{String(index).padStart(2, '0')}</span>
                {creative.type ? ` (${creative.type})` : ''}?
              </div>
              <div className={styles.deleteWarningText}>
                {captionPreview ? <>Legenda: "<em>{captionPreview}{creative.caption?.length > 90 ? '…' : ''}</em>"</> : 'Esta peça ainda não tem legenda.'}
              </div>
              <div className={styles.deleteHint}>// remove mídia, legenda e decisões do cliente</div>
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onCancel} disabled={submitting}>Cancelar</button>
          <button type="button" className={styles.btnDanger} onClick={handleConfirm} disabled={submitting} style={{ padding: '8px 14px' }}>
            {submitting ? 'Excluindo...' : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Modal: Liberar criativo aprovado para edição (re-abre p/ cliente)
───────────────────────────────────────────────────────────── */
function UnlockApprovedModal({ creative, index, submitting, onCancel, onConfirm }) {
  const captionPreview = (creative.caption || '').trim().slice(0, 100);
  const dec = creative.client_decision;
  const isApproved = dec === 'approved';
  const isAdjust   = dec === 'adjust';

  // Copy adapta-se à decisão atual
  const decisionLabel = isApproved ? 'Aprovado' : isAdjust ? 'Ajuste pedido' : 'Reprovado';
  const headerTitle = isApproved
    ? 'Editar criativo já aprovado?'
    : 'Liberar para nova revisão?';
  const headerDesc = isApproved
    ? 'Esta peça já foi aprovada pelo cliente. Se você continuar, a aprovação é removida e ela aparece novamente como pendente no link público.'
    : 'Quando você terminar as alterações, o cliente verá a peça novamente como pendente. Útil quando a edição já está pronta para uma nova rodada.';
  const bodyTitle = isApproved
    ? <>Liberar o criativo <span style={{ color: 'var(--brand-300)' }}>#{String(index).padStart(2, '0')}</span> para edição?</>
    : <>Mandar o criativo <span style={{ color: 'var(--brand-300)' }}>#{String(index).padStart(2, '0')}</span> para nova revisão?</>;
  const ctaLabel = submitting
    ? (isApproved ? 'Liberando...' : 'Reabrindo...')
    : (isApproved ? 'Sim, liberar para edição' : 'Sim, reabrir para revisão');

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconWarning}`} aria-hidden="true">
            <UnlockIcon />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>{headerTitle}</div>
            <div className={styles.modalHeaderDesc}>{headerDesc}</div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onCancel} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.deleteWarning}>
            <div className={styles.deleteWarningIcon} style={{ background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.4)', color: '#F59E0B' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className={styles.deleteWarningBody}>
              <div className={styles.deleteWarningTitle}>{bodyTitle}</div>
              <div className={styles.deleteWarningText}>
                {captionPreview ? <>Legenda: "<em>{captionPreview}{(creative.caption || '').length > 100 ? '…' : ''}</em>"<br /><br /></> : null}
                A decisão atual <strong>({decisionLabel})</strong>, a nota e as observações
                do cliente serão limpas. Quem tiver o link aberto verá a peça reaparecer como
                pendente de avaliação.
              </div>
              <div className={styles.deleteHint}>// reseta client_decision · libera para nova revisão</div>
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className={styles.btnPrimary} onClick={onConfirm} disabled={submitting}>
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function UnlockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab: Review (status do feedback do cliente)
───────────────────────────────────────────────────────────── */
function TabReview({ plan, onRefresh }) {
  const creatives = plan.creatives || [];
  const groups = useMemo(() => {
    const buckets = { approved: [], rejected: [], pending: [] };
    creatives.forEach((c, i) => {
      const dec = c.client_decision;
      if (dec === 'approved')                              buckets.approved.push({ c, i });
      else if (dec === 'rejected' || dec === 'adjust')     buckets.rejected.push({ c, i });
      else                                                  buckets.pending.push({ c, i });
    });
    return buckets;
  }, [creatives]);

  const total = creatives.length;
  const decided = total - groups.pending.length;
  const pct = total > 0 ? Math.round((decided / total) * 100) : 0;
  const generalNotes = plan.metadata?.client_general_notes || '';
  const finalizedAt = plan.metadata?.client_finalized_at || null;

  return (
    <div className={styles.editorPanel}>
      {/* Manual */}
      <div className={styles.manualCard}>
        <div className={styles.manualIcon} aria-hidden="true">
          <ClipboardIcon />
        </div>
        <div className={styles.manualBody}>
          <div className={styles.manualTitle}>Review do cliente</div>
          <div className={styles.manualSubtitle}>
            Feedback consolidado do cliente. Aprovados ficam prontos para publicar;
            reprovados precisam de revisão da equipe antes de liberar uma nova rodada
            no link público.
          </div>
        </div>
      </div>

      {/* Resumo (3 KPIs) */}
      <div className={styles.kpiRow}>
        <div className={`glass-card ${styles.kpiCard}`}>
          <div className={styles.kpiLabel}>Aprovados</div>
          <div className={styles.kpiValue} style={{ color: '#10B981' }}>{groups.approved.length}</div>
          <div className={styles.kpiHint}>de {total} criativos</div>
        </div>
        <div className={`glass-card ${styles.kpiCard}`}>
          <div className={styles.kpiLabel}>Reprovados</div>
          <div className={styles.kpiValue} style={{ color: 'var(--brand-400)' }}>{groups.rejected.length}</div>
          <div className={styles.kpiHint}>aguardando ajustes</div>
        </div>
        <div className={`glass-card ${styles.kpiCard}`}>
          <div className={styles.kpiLabel}>Pendentes</div>
          <div className={styles.kpiValue} style={{ color: 'var(--text-muted)' }}>{groups.pending.length}</div>
          <div className={styles.kpiHint}>{pct}% revisado</div>
        </div>
      </div>

      {/* Observações gerais */}
      {generalNotes && (
        <div className="glass-card" style={{ padding: 18 }}>
          <div className={styles.formLabel} style={{ marginBottom: 8 }}>
            <ChatIcon /> Observações gerais do cliente
            {finalizedAt && (
              <span style={{ marginLeft: 8, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                · enviado em {new Date(finalizedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap', padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid var(--border-default)' }}>
            {generalNotes}
          </div>
        </div>
      )}

      {/* Grupos */}
      <ReviewGroup
        title="Reprovados"
        accent="var(--brand-400)"
        empty="Nenhum criativo foi reprovado."
        items={groups.rejected}
        showReason
      />
      <ReviewGroup
        title="Aprovados"
        accent="#10B981"
        empty="Nenhum criativo aprovado ainda."
        items={groups.approved}
      />
      <ReviewGroup
        title="Pendentes"
        accent="var(--text-muted)"
        empty="Todos os criativos foram revisados."
        items={groups.pending}
      />
    </div>
  );
}

function ReviewGroup({ title, accent, empty, items, showReason }) {
  return (
    <div>
      <div className={styles.reviewGroupHeader}>
        <span className={styles.reviewGroupTitle} style={{ color: accent }}>
          <span className={styles.reviewGroupDot} style={{ background: accent }} />
          {title}
        </span>
        <span className={styles.reviewGroupCount}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className={styles.reviewGroupEmpty}>// {empty}</div>
      ) : (
        <div className={styles.reviewGroupGrid}>
          {items.map(({ c, i }) => (
            <ReviewCard key={c.id} creative={c} index={i + 1} accent={accent} showReason={showReason} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ creative, index, accent, showReason }) {
  const url = (creative.media_urls || [])[0] || creative.cover_url || creative.video_url;
  const isVideo = url && /\.(mp4|mov|webm)(\?|$)/i.test(url);
  const captionPreview = (creative.caption || '').trim().slice(0, 140);

  return (
    <div className={styles.reviewCard} style={{ borderColor: `${accent}33` }}>
      <div className={styles.reviewCardThumb}>
        {url ? (
          isVideo
            ? <video src={url} muted loop playsInline />
            : <img src={url} alt="" />
        ) : (
          <div className={styles.reviewCardThumbEmpty}>sem mídia</div>
        )}
        <div className={styles.reviewCardIndex}>#{String(index).padStart(2, '0')}</div>
      </div>
      <div className={styles.reviewCardBody}>
        <div className={styles.reviewCardMeta}>
          <span style={{ color: accent }}>{(creative.type || 'post').toUpperCase()}</span>
          {creative.scheduled_for && (
            <span style={{ color: 'var(--text-muted)' }}>
              · {String(creative.scheduled_for).slice(8, 10)}/{String(creative.scheduled_for).slice(5, 7)}
            </span>
          )}
          {creative.client_rating ? (
            <span style={{ color: '#F59E0B' }}>· {'★'.repeat(creative.client_rating)}</span>
          ) : null}
        </div>
        {captionPreview && (
          <div className={styles.reviewCardCaption}>{captionPreview}{(creative.caption || '').length > 140 ? '…' : ''}</div>
        )}
        {showReason && creative.client_reason && (
          <div className={styles.reviewCardReason}>
            <strong>Motivo:</strong> {creative.client_reason}
          </div>
        )}
        {creative.client_notes && (
          <div className={styles.reviewCardNotes}>
            <strong>Obs:</strong> {creative.client_notes}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Ícones extras
───────────────────────────────────────────────────────────── */
function ClipboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function BookIconLg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" />
      <path d="m5.6 5.6 2.1 2.1" /><path d="m16.3 16.3 2.1 2.1" />
      <path d="m5.6 18.4 2.1-2.1" /><path d="m16.3 7.7 2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PlusIconSm() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
