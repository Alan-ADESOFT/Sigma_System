/**
 * components/contentPlanning/TabClientPlans.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Aba "Planejamentos" usada na ficha do cliente.
 * Lista os planos de UM cliente (filtrados por status), agrupados por mes (DESC).
 *
 * Props:
 *   clientId
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import styles from '../../assets/style/contentPlanning.module.css';
import { useNotification } from '../../context/NotificationContext';

const STATUS_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'in_development', label: 'Em dev' },
  { id: 'client_review', label: 'Aprov. cliente' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'finalized', label: 'Finalizados' },
];

function monthLabel(d) {
  if (!d) return 'Sem mês';
  try {
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch { return 'Sem mês'; }
}

function groupByMonth(plans) {
  const groups = new Map();
  for (const p of plans) {
    const key = p.month_reference ? String(p.month_reference).slice(0, 7) : 'no-month';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  // DESC pelo mes
  return Array.from(groups.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
}

export default function TabClientPlans({ clientId }) {
  const router = useRouter();
  const { notify } = useNotification();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [plansRes, statusesRes] = await Promise.all([
          fetch(`/api/content-planning/plans?clientId=${clientId}&isTemplate=false&limit=100`).then(r => r.json()),
          fetch('/api/content-planning/statuses').then(r => r.json()),
        ]);
        if (cancelled) return;
        if (plansRes.success) setPlans(plansRes.plans || []);
        else notify(plansRes.error || 'Erro ao carregar planos', 'error');
        if (statusesRes.success) setStatuses(statusesRes.statuses || []);
      } catch {
        if (!cancelled) notify('Falha de rede', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (clientId) load();
    return () => { cancelled = true; };
  }, [clientId, notify]);

  const filtered = useMemo(() => {
    if (filter === 'all') return plans;
    return plans.filter(p => p.status_key === filter);
  }, [plans, filter]);

  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  function createNewPlan() {
    router.push(`/dashboard/content-planning?newClient=${clientId}`);
  }

  return (
    <div>
      <div className={styles.clientPlansHeader}>
        <div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Planejamentos do cliente
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {plans.length} {plans.length === 1 ? 'plano' : 'planos'} no total
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={styles.btnPrimary} onClick={createNewPlan}>
            + Novo Plano
          </button>
        </div>
      </div>

      <div className={styles.clientPlansFilters} style={{ marginBottom: 16 }}>
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={filter === f.id ? styles.clientPlansFilterBtnActive : styles.clientPlansFilterBtn}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>// carregando...</div>
      ) : groups.length === 0 ? (
        <div className="glass-card" style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Nenhum planejamento ainda. Clique em <strong style={{ color: 'var(--brand-300)' }}>+ Novo Plano</strong> para criar o primeiro.
        </div>
      ) : (
        groups.map(([key, list]) => (
          <div key={key} style={{ marginBottom: 24 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
              fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: 10,
            }}>
              {key === 'no-month' ? 'Sem mês definido' : monthLabel(`${key}-01`)}
            </div>
            <div className={styles.clientPlansList}>
              {list.map(p => {
                const total = Number(p.creative_count || 0);
                const approved = Number(p.approved_count || 0);
                return (
                  <div
                    key={p.id}
                    className={`glass-card ${styles.clientPlanCard}`}
                    onClick={() => router.push(`/dashboard/content-planning/${p.id}`)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: p.status_color || 'var(--text-muted)',
                      }} />
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                      }}>
                        {p.status_label || 'Sem status'}
                      </span>
                    </div>

                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {p.title}
                    </div>

                    {p.objective && (
                      <div style={{
                        fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--text-secondary)',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {p.objective}
                      </div>
                    )}

                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                      color: 'var(--text-muted)', letterSpacing: '0.04em',
                      display: 'flex', gap: 8,
                    }}>
                      <span>{total} {total === 1 ? 'peca' : 'pecas'}</span>
                      <span>·</span>
                      <span>{approved}/{total} aprov.</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
