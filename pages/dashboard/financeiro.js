/**
 * pages/dashboard/financeiro.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Painel Financeiro Global — visão consolidada de todos os contratos e parcelas
 * de todos os clientes do tenant.
 *
 * KPIs: Faturado este mês · A Receber · Total Arrecadado · Contratos Ativos ·
 *        Parcelas Atrasadas
 * Tabela: filtros por cliente / mês / status · toggle pago/pendente inline
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';

/* ─────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────── */
function fmtBRL(v) {
  return (parseFloat(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '—';
  const s = d.split('T')[0];
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}

function monthKey(d) {
  if (!d) return '';
  return d.split('T')[0].slice(0, 7); // "YYYY-MM"
}

function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${names[parseInt(m) - 1]} ${y}`;
}

function effectiveStatus(inst) {
  if (inst.status === 'paid') return 'paid';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (new Date(inst.due_date) < today) return 'overdue';
  return 'pending';
}

const STATUS_CFG = {
  paid:    { label: 'Pago',     color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)'  },
  overdue: { label: 'Atrasado', color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
  pending: { label: 'Pendente', color: '#525252', bg: 'rgba(82,82,82,0.1)',    border: 'rgba(82,82,82,0.25)'   },
};

const FREQ_LABELS = {
  monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral',
  annual: 'Anual', one_time: 'Único',
};

/* ─────────────────────────────────────────────────────────
   KPI Card
───────────────────────────────────────────────────────── */
function KpiCard({ label, value, color, sub }) {
  return (
    <div className="glass-card" style={{ padding: '16px 20px', flex: 1, minWidth: 140 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700,
        color: color || 'var(--text-primary)', marginBottom: 3,
      }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Avatar inline
───────────────────────────────────────────────────────── */
function Avatar({ src, name, size = 26 }) {
  const [err, setErr] = useState(false);
  const ini = (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  if (src && !err) return <img src={src} onError={() => setErr(true)} alt={name}
    style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(255,0,51,0.1)', border: '1px solid rgba(255,0,51,0.18)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontSize: Math.round(size * 0.36), fontWeight: 700, color: '#ff6680',
    }}>
      {ini || '?'}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   PÁGINA PRINCIPAL
───────────────────────────────────────────────────────── */
export default function FinanceiroDashboard() {
  const [installments, setInstallments] = useState([]);
  const [loading,      setLoading      ] = useState(true);
  const [error,        setError        ] = useState(null);

  /* Filtros */
  const [filterClient, setFilterClient] = useState('');
  const [filterMonth,  setFilterMonth  ] = useState('');
  const [filterStatus, setFilterStatus ] = useState('all');

  async function load() {
    setLoading(true);
    try {
      const j = await fetch('/api/financeiro').then(r => r.json());
      if (!j.success) throw new Error(j.error);
      setInstallments(j.installments || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  /* Toggle pago/pendente */
  async function toggleInst(inst) {
    const newStatus = inst.status === 'paid' ? 'pending' : 'paid';
    try {
      const j = await fetch('/api/financeiro', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: inst.id, clientId: inst.client_id, status: newStatus }),
      }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      setInstallments(p => p.map(i => i.id === inst.id ? { ...i, ...j.installment } : i));
    } catch (e) { alert(e.message); }
  }

  /* KPIs */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);

  const kpis = useMemo(() => {
    const paidAll   = installments.filter(i => i.status === 'paid');
    const paidMonth = paidAll.filter(i => i.paid_at && i.paid_at.startsWith(thisMonth));
    const pending   = installments.filter(i => i.status !== 'paid');
    const overdue   = pending.filter(i => new Date(i.due_date) < today);
    const contracts = new Set(installments.map(i => i.contract_id));

    return {
      fatMes:    paidMonth.reduce((s, i) => s + parseFloat(i.value), 0),
      arrecadado:paidAll.reduce((s, i) => s + parseFloat(i.value), 0),
      aReceber:  pending.reduce((s, i) => s + parseFloat(i.value), 0),
      contratos: contracts.size,
      atrasadas: overdue.length,
    };
  }, [installments]);

  /* Meses disponíveis para filtro */
  const months = useMemo(() => {
    const keys = [...new Set(installments.map(i => monthKey(i.due_date)))].sort().reverse();
    return keys;
  }, [installments]);

  /* Clientes disponíveis para filtro */
  const clientNames = useMemo(() => {
    const map = {};
    installments.forEach(i => { map[i.client_id] = i.company_name; });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [installments]);

  /* Filtrados */
  const filtered = useMemo(() => {
    return installments.filter(inst => {
      if (filterClient && inst.client_id !== filterClient) return false;
      if (filterMonth  && monthKey(inst.due_date) !== filterMonth) return false;
      if (filterStatus !== 'all' && effectiveStatus(inst) !== filterStatus) return false;
      return true;
    });
  }, [installments, filterClient, filterMonth, filterStatus]);

  /* Agrupados por mês (para a tabela) */
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(inst => {
      const k = monthKey(inst.due_date);
      if (!map[k]) map[k] = [];
      map[k].push(inst);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const SEL = {
    padding: '7px 10px', background: 'rgba(10,10,10,0.8)',
    border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7,
    color: 'var(--text-primary)', fontSize: '0.72rem',
    fontFamily: 'var(--font-mono)', outline: 'none', cursor: 'pointer',
  };

  return (
    <DashboardLayout activeTab="financeiro">
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: 4 }}>
          Financeiro
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>
          Visão consolidada de todos os contratos e parcelas dos clientes.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 7, marginBottom: 20, background: 'rgba(255,26,77,0.08)', border: '1px solid rgba(255,26,77,0.25)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#ff6680' }}>
          Erro: {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <KpiCard label="Faturado este mês" value={fmtBRL(kpis.fatMes)} color="#22c55e" />
        <KpiCard label="Total arrecadado" value={fmtBRL(kpis.arrecadado)} color="var(--text-primary)" />
        <KpiCard label="A receber" value={fmtBRL(kpis.aReceber)} color="#f97316" />
        <KpiCard label="Contratos ativos" value={kpis.contratos} color="var(--text-primary)" />
        <KpiCard label="Parcelas atrasadas" value={kpis.atrasadas} color={kpis.atrasadas > 0 ? '#f97316' : 'var(--text-muted)'} />
      </div>

      {/* Filtros */}
      <div className="glass-card" style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={SEL}>
            <option value="">Todos os clientes</option>
            {clientNames.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={SEL}>
            <option value="">Todos os meses</option>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={SEL}>
            <option value="all">Todos os status</option>
            <option value="paid">Pago</option>
            <option value="pending">Pendente</option>
            <option value="overdue">Atrasado</option>
          </select>
          {(filterClient || filterMonth || filterStatus !== 'all') && (
            <button onClick={() => { setFilterClient(''); setFilterMonth(''); setFilterStatus('all'); }} style={{
              padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
            }}>
              Limpar filtros ×
            </button>
          )}
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            {filtered.length} parcela{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Tabela agrupada por mês */}
      {loading ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '32px 0' }}>
          // carregando...
        </div>
      ) : grouped.length === 0 ? (
        <div className="glass-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Nenhuma parcela encontrada.{' '}
            <Link href="/dashboard/clients" style={{ color: '#ff6680', textDecoration: 'none' }}>
              Cadastrar cliente →
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(([month, insts]) => {
            const mPaid    = insts.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.value), 0);
            const mPending = insts.filter(i => i.status !== 'paid').reduce((s, i) => s + parseFloat(i.value), 0);

            return (
              <div key={month}>
                {/* Month header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {monthLabel(month)}
                  </div>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#22c55e' }}>
                    {fmtBRL(mPaid)} pago
                  </span>
                  {mPending > 0 && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#f97316' }}>
                      · {fmtBRL(mPending)} a receber
                    </span>
                  )}
                </div>

                {/* Table */}
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {['Cliente', 'Parcela', 'Vencimento', 'Valor', 'Status', 'Pago em', ''].map(h => (
                            <th key={h} style={{
                              padding: '9px 14px', textAlign: h === '' ? 'right' : 'left',
                              fontFamily: 'var(--font-mono)', fontSize: '0.57rem', color: 'var(--text-muted)',
                              textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, whiteSpace: 'nowrap',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {insts.map(inst => {
                          const eff = effectiveStatus(inst);
                          const cfg = STATUS_CFG[eff];
                          return (
                            <tr key={inst.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <Link href={`/dashboard/clients/${inst.client_id}`} style={{ textDecoration: 'none' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Avatar src={inst.logo_url} name={inst.company_name} />
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                      {inst.company_name}
                                    </span>
                                  </div>
                                </Link>
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                #{inst.installment_number} · {FREQ_LABELS[inst.frequency] || inst.frequency}
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {fmtDate(inst.due_date)}
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                {fmtBRL(inst.value)}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{
                                  display: 'inline-block', padding: '2px 9px', borderRadius: 20,
                                  fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
                                  letterSpacing: '0.05em', textTransform: 'uppercase',
                                  background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                                }}>
                                  {cfg.label}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {inst.paid_at ? new Date(inst.paid_at).toLocaleDateString('pt-BR') : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                {inst.status !== 'paid' ? (
                                  <button onClick={() => toggleInst(inst)} style={{
                                    padding: '4px 12px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
                                    border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
                                    color: '#22c55e', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
                                  }}>
                                    Marcar Pago
                                  </button>
                                ) : (
                                  <button onClick={() => toggleInst(inst)} style={{
                                    padding: '4px 12px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
                                    border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
                                    color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                                  }}>
                                    Desfazer
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
