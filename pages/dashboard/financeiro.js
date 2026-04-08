/**
 * pages/dashboard/financeiro.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Painel Financeiro Global:
 *   - KPIs consolidados
 *   - Dashboard com gráficos (Entrada×Despesa, Lucro×Tempo, Top clientes)
 *   - Tabela de parcelas de clientes
 *   - Tabela de custos/ganhos da empresa
 *   - Filtros por mês, ano, cliente, status
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import { useNotification } from '../../context/NotificationContext';
import { Skeleton, SkeletonCard, SkeletonTable } from '../../components/Skeleton';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

/* ── Helpers ── */
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
  return d.split('T')[0].slice(0, 7);
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

const CHART_COLORS = ['#ff0033', '#ff6680', '#22c55e', '#f97316', '#6366f1', '#a78bfa'];

/* ── Components ── */
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

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
      letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5,
    }}>
      {children}
    </div>
  );
}

const INP = {
  width: '100%', padding: '8px 11px', boxSizing: 'border-box',
  background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)', outline: 'none',
};

const SEL = {
  padding: '7px 10px', background: 'rgba(10,10,10,0.8)',
  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7,
  color: 'var(--text-primary)', fontSize: '0.72rem',
  fontFamily: 'var(--font-mono)', outline: 'none', cursor: 'pointer',
};

const tooltipStyle = {
  contentStyle: {
    background: 'rgba(10,10,10,0.95)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
  },
  labelStyle: { color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem' },
};

/* ── Tabs ── */
const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'parcelas',  label: 'Parcelas' },
  { key: 'empresa',   label: 'Custos & Ganhos' },
];

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function FinanceiroDashboard() {
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState('dashboard');

  /* Parcelas data */
  const [installments, setInstallments] = useState([]);
  const [loadingInst,  setLoadingInst ] = useState(true);

  /* Company finances data */
  const [companyRecords, setCompanyRecords] = useState([]);
  const [loadingComp,    setLoadingComp   ] = useState(true);

  const [error, setError] = useState(null);

  /* Filtros */
  const [filterClient, setFilterClient] = useState('');
  const [filterMonth,  setFilterMonth ] = useState('');
  const [filterYear,   setFilterYear  ] = useState(String(new Date().getFullYear()));
  const [filterStatus, setFilterStatus] = useState('all');

  /* Company filters */
  const [compPeriod,     setCompPeriod    ] = useState('this_year');
  const [compDateFrom,   setCompDateFrom  ] = useState('');
  const [compDateTo,     setCompDateTo    ] = useState('');
  const [compTypeFilter, setCompTypeFilter] = useState('');
  const [compCatFilter,  setCompCatFilter ] = useState('');

  /* Categories */
  const [categories, setCategories] = useState([]);

  /* Form for company finances */
  const [showCompForm, setShowCompForm] = useState(false);
  const [editingComp,  setEditingComp ] = useState(null);
  const [compForm, setCompForm] = useState({
    type: 'expense', category_id: '', description: '', value: '', date: new Date().toISOString().split('T')[0], notes: '',
  });
  const [savingComp, setSavingComp] = useState(false);

  async function loadInstallments() {
    setLoadingInst(true);
    try {
      console.log('[INFO][Frontend:Financeiro] Buscando parcelas', { endpoint: '/api/financeiro' });
      const j = await fetch('/api/financeiro').then(r => r.json());
      if (!j.success) throw new Error(j.error);
      console.log('[SUCESSO][Frontend:Financeiro] Parcelas carregadas', { total: (j.installments || []).length });
      setInstallments(j.installments || []);
    } catch (e) {
      console.error('[ERRO][Frontend:Financeiro] Falha ao carregar parcelas', { error: e.message });
      notify('Erro ao carregar parcelas', 'error');
      setError(e.message);
    }
    finally { setLoadingInst(false); }
  }

  async function loadCompany() {
    setLoadingComp(true);
    try {
      const params = new URLSearchParams();
      if (compPeriod && compPeriod !== 'custom') params.set('period', compPeriod);
      if (compPeriod === 'custom') {
        if (compDateFrom) params.set('dateFrom', compDateFrom);
        if (compDateTo) params.set('dateTo', compDateTo);
      }
      if (!compPeriod) {
        if (filterYear) params.set('year', filterYear);
      }
      if (compTypeFilter) params.set('type', compTypeFilter);
      if (compCatFilter) params.set('categoryId', compCatFilter);
      console.log('[INFO][Frontend:Financeiro] Buscando registros da empresa', { endpoint: '/api/financeiro/company' });
      const j = await fetch(`/api/financeiro/company?${params}`).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      console.log('[SUCESSO][Frontend:Financeiro] Registros da empresa carregados', { total: (j.records || []).length });
      setCompanyRecords(j.records || []);
    } catch (e) {
      console.error('[ERRO][Frontend:Financeiro] Falha ao carregar registros da empresa', { error: e.message });
      notify('Erro ao carregar registros financeiros', 'error');
      setError(e.message);
    }
    finally { setLoadingComp(false); }
  }

  async function loadCategories() {
    try {
      const j = await fetch('/api/finance-categories').then(r => r.json());
      if (j.success) setCategories(j.categories || []);
    } catch (e) {
      console.error('[ERRO][Frontend:Financeiro] Falha ao carregar categorias', { error: e.message });
    }
  }

  useEffect(() => { loadInstallments(); loadCategories(); }, []);
  useEffect(() => { loadCompany(); }, [compPeriod, compDateFrom, compDateTo, compTypeFilter, compCatFilter, filterYear]);

  /* Toggle installment */
  async function toggleInst(inst) {
    const newStatus = inst.status === 'paid' ? 'pending' : 'paid';
    try {
      console.log('[INFO][Frontend:Financeiro] Alterando status da parcela', { installmentId: inst.id, clientId: inst.client_id, newStatus });
      const j = await fetch('/api/financeiro', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: inst.id, clientId: inst.client_id, status: newStatus }),
      }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      console.log('[SUCESSO][Frontend:Financeiro] Status da parcela atualizado', { installmentId: inst.id, newStatus });
      notify(newStatus === 'paid' ? 'Parcela marcada como paga' : 'Parcela marcada como pendente', 'success');
      setInstallments(p => p.map(i => i.id === inst.id ? { ...i, ...j.installment } : i));
    } catch (e) {
      console.error('[ERRO][Frontend:Financeiro] Falha ao alterar status da parcela', { error: e.message });
      notify('Erro ao alterar status da parcela', 'error');
    }
  }

  /* Company finance CRUD */
  function handleCompValueMask(e) {
    let raw = e.target.value.replace(/\D/g, '');
    if (!raw) { setCompForm(f => ({ ...f, value: '' })); return; }
    const cents = parseInt(raw);
    const formatted = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setCompForm(f => ({ ...f, value: formatted }));
  }

  function openNewCompForm() {
    setCompForm({ type: 'expense', category_id: '', description: '', value: '', date: new Date().toISOString().split('T')[0], notes: '' });
    setEditingComp(null);
    setShowCompForm(true);
  }

  function openEditCompForm(rec) {
    setCompForm({
      type: rec.type,
      category_id: rec.category_id || '',
      description: rec.description,
      value: parseFloat(rec.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      date: rec.date ? rec.date.split('T')[0] : '',
      notes: rec.notes || '',
    });
    setEditingComp(rec.id);
    setShowCompForm(true);
  }

  async function handleSaveComp(e) {
    e.preventDefault();
    const rawVal = parseFloat((compForm.value || '0').replace(/\./g, '').replace(',', '.')) || 0;
    if (!rawVal || !compForm.description || !compForm.date) {
      notify('Descrição, valor e data são obrigatórios.', 'error');
      return;
    }
    setSavingComp(true);
    try {
      const payload = { type: compForm.type, category_id: compForm.category_id || null, description: compForm.description, value: rawVal, date: compForm.date, notes: compForm.notes };
      if (editingComp) payload.id = editingComp;
      const method = editingComp ? 'PUT' : 'POST';
      console.log('[INFO][Frontend:Financeiro] Salvando registro financeiro', { method, payload });
      const res = await fetch('/api/financeiro/company', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      console.log('[SUCESSO][Frontend:Financeiro] Registro financeiro salvo', { id: j.record?.id, method });
      notify(editingComp ? 'Registro atualizado com sucesso' : 'Registro criado com sucesso', 'success');
      if (editingComp) {
        setCompanyRecords(p => p.map(r => r.id === editingComp ? j.record : r));
      } else {
        setCompanyRecords(p => [j.record, ...p]);
      }
      setShowCompForm(false);
      setEditingComp(null);
    } catch (err) {
      console.error('[ERRO][Frontend:Financeiro] Falha ao salvar registro financeiro', { error: err.message });
      notify('Erro ao salvar registro financeiro', 'error');
    }
    finally { setSavingComp(false); }
  }

  async function handleDeleteComp(id) {
    if (!confirm('Excluir este registro?')) return;
    try {
      console.log('[INFO][Frontend:Financeiro] Excluindo registro financeiro', { id });
      const res = await fetch('/api/financeiro/company', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      console.log('[SUCESSO][Frontend:Financeiro] Registro financeiro excluído', { id });
      notify('Registro excluído com sucesso', 'success');
      setCompanyRecords(p => p.filter(r => r.id !== id));
    } catch (err) {
      console.error('[ERRO][Frontend:Financeiro] Falha ao excluir registro financeiro', { error: err.message });
      notify('Erro ao excluir registro financeiro', 'error');
    }
  }

  /* ── Computed data ── */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);

  /* KPIs from installments */
  const instKpis = useMemo(() => {
    const paidAll   = installments.filter(i => i.status === 'paid');
    const paidMonth = paidAll.filter(i => i.paid_at && i.paid_at.startsWith(thisMonth));
    const pending   = installments.filter(i => i.status !== 'paid');
    const overdue   = pending.filter(i => new Date(i.due_date) < today);
    const contracts = new Set(installments.map(i => i.contract_id));
    return {
      fatMes:     paidMonth.reduce((s, i) => s + parseFloat(i.value), 0),
      arrecadado: paidAll.reduce((s, i) => s + parseFloat(i.value), 0),
      aReceber:   pending.reduce((s, i) => s + parseFloat(i.value), 0),
      contratos:  contracts.size,
      atrasadas:  overdue.length,
    };
  }, [installments]);

  /* Company KPIs */
  const compKpis = useMemo(() => {
    const inc = companyRecords.filter(r => r.type === 'income').reduce((s, r) => s + parseFloat(r.value), 0);
    const exp = companyRecords.filter(r => r.type === 'expense').reduce((s, r) => s + parseFloat(r.value), 0);
    return { income: inc, expense: exp, profit: inc - exp };
  }, [companyRecords]);

  /* Chart: Entrada × Despesa por mês */
  const chartEntradaDespesa = useMemo(() => {
    const map = {};
    // Income from paid installments
    installments.filter(i => i.status === 'paid' && i.paid_at).forEach(i => {
      const mk = i.paid_at.slice(0, 7);
      if (!map[mk]) map[mk] = { month: mk, entrada: 0, despesa: 0 };
      map[mk].entrada += parseFloat(i.value);
    });
    // Company income
    companyRecords.filter(r => r.type === 'income').forEach(r => {
      const mk = r.date.split('T')[0].slice(0, 7);
      if (!map[mk]) map[mk] = { month: mk, entrada: 0, despesa: 0 };
      map[mk].entrada += parseFloat(r.value);
    });
    // Company expenses
    companyRecords.filter(r => r.type === 'expense').forEach(r => {
      const mk = r.date.split('T')[0].slice(0, 7);
      if (!map[mk]) map[mk] = { month: mk, entrada: 0, despesa: 0 };
      map[mk].despesa += parseFloat(r.value);
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [installments, companyRecords]);

  /* Chart: Lucro × Tempo */
  const chartLucro = useMemo(() => {
    return chartEntradaDespesa.map(d => ({
      month: d.month,
      lucro: d.entrada - d.despesa,
    }));
  }, [chartEntradaDespesa]);

  /* Chart: Top clientes por valor pago */
  const chartTopClients = useMemo(() => {
    const map = {};
    installments.filter(i => i.status === 'paid').forEach(i => {
      if (!map[i.client_id]) map[i.client_id] = { name: i.company_name, value: 0 };
      map[i.client_id].value += parseFloat(i.value);
    });
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [installments]);

  /* Filtros para tab parcelas */
  const months = useMemo(() => {
    const keys = [...new Set(installments.map(i => monthKey(i.due_date)))].sort().reverse();
    return keys;
  }, [installments]);

  const clientNames = useMemo(() => {
    const map = {};
    installments.forEach(i => { map[i.client_id] = i.company_name; });
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [installments]);

  const filtered = useMemo(() => {
    return installments.filter(inst => {
      if (filterClient && inst.client_id !== filterClient) return false;
      if (filterMonth  && monthKey(inst.due_date) !== filterMonth) return false;
      if (filterStatus !== 'all' && effectiveStatus(inst) !== filterStatus) return false;
      return true;
    });
  }, [installments, filterClient, filterMonth, filterStatus]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(inst => {
      const k = monthKey(inst.due_date);
      if (!map[k]) map[k] = [];
      map[k].push(inst);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  /* Years available */
  const years = useMemo(() => {
    const s = new Set();
    installments.forEach(i => { if (i.due_date) s.add(i.due_date.split('T')[0].slice(0, 4)); });
    companyRecords.forEach(r => { if (r.date) s.add(r.date.split('T')[0].slice(0, 4)); });
    s.add(String(new Date().getFullYear()));
    return [...s].sort().reverse();
  }, [installments, companyRecords]);

  const loading = loadingInst || loadingComp;

  return (
    <DashboardLayout activeTab="financeiro">
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title">Financeiro</h1>
        <p className="page-subtitle">Visão consolidada de receitas, despesas e contratos.</p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 7, marginBottom: 16, background: 'rgba(255,26,77,0.08)', border: '1px solid rgba(255,26,77,0.25)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#ff6680' }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '8px 16px', borderRadius: '6px 6px 0 0', cursor: 'pointer',
            border: 'none', borderBottom: activeTab === t.key ? '2px solid #ff0033' : '2px solid transparent',
            background: activeTab === t.key ? 'rgba(255,0,51,0.06)' : 'transparent',
            color: activeTab === t.key ? '#ff6680' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
            transition: 'all 0.2s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="glass-card" style={{ padding: '16px 20px', flex: 1, minWidth: 140 }}>
                <Skeleton width="60%" height={18} style={{ marginBottom: 8 }} />
                <Skeleton width="40%" height={10} />
              </div>
            ))}
          </div>
          <SkeletonCard lines={5} style={{ marginBottom: 16 }} />
          <SkeletonTable rows={6} cols={5} />
        </div>
      )}

      {/* ═══ TAB: DASHBOARD ═══ */}
      {!loading && activeTab === 'dashboard' && (
        <div>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <KpiCard label="Faturado este mês" value={fmtBRL(instKpis.fatMes)} color="#22c55e" />
            <KpiCard label="Total arrecadado" value={fmtBRL(instKpis.arrecadado)} />
            <KpiCard label="A receber" value={fmtBRL(instKpis.aReceber)} color="#f97316" />
            <KpiCard label="Despesas (ano)" value={fmtBRL(compKpis.expense)} color="#ff6680" />
            <KpiCard label="Lucro (ano)" value={fmtBRL(instKpis.arrecadado + compKpis.income - compKpis.expense)}
              color={instKpis.arrecadado + compKpis.income - compKpis.expense >= 0 ? '#22c55e' : '#ff6680'} />
          </div>

          {/* Filtro de ano */}
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>Ano:</span>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={SEL}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Gráficos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Entrada × Despesa */}
            <div className="glass-card" style={{ padding: '18px 16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
                Entrada x Despesa
              </div>
              {chartEntradaDespesa.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartEntradaDespesa}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip {...tooltipStyle} formatter={(v) => fmtBRL(v)} labelFormatter={monthLabel} />
                    <Bar dataKey="entrada" name="Entrada" fill="#22c55e" radius={[4,4,0,0]} />
                    <Bar dataKey="despesa" name="Despesa" fill="#ff0033" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  Sem dados para exibir
                </div>
              )}
            </div>

            {/* Lucro × Tempo */}
            <div className="glass-card" style={{ padding: '18px 16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
                Lucro x Tempo
              </div>
              {chartLucro.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartLucro}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip {...tooltipStyle} formatter={(v) => fmtBRL(v)} labelFormatter={monthLabel} />
                    <Line type="monotone" dataKey="lucro" name="Lucro" stroke="#ff0033" strokeWidth={2} dot={{ fill: '#ff0033', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  Sem dados para exibir
                </div>
              )}
            </div>

            {/* Top Clientes */}
            <div className="glass-card" style={{ padding: '18px 16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
                Top Clientes (Valor Pago)
              </div>
              {chartTopClients.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartTopClients} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontFamily: 'var(--font-mono)' }} width={120} />
                    <Tooltip {...tooltipStyle} formatter={(v) => fmtBRL(v)} />
                    <Bar dataKey="value" name="Total pago" fill="#ff0033" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  Sem dados para exibir
                </div>
              )}
            </div>

            {/* Distribuição despesas por categoria */}
            <div className="glass-card" style={{ padding: '18px 16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
                Despesas por Categoria
              </div>
              {(() => {
                const catMap = {};
                const catColors = {};
                companyRecords.filter(r => r.type === 'expense').forEach(r => {
                  const cat = r.category_name || r.category || 'Outros';
                  catMap[cat] = (catMap[cat] || 0) + parseFloat(r.value);
                  if (r.category_color) catColors[cat] = r.category_color;
                });
                const data = Object.entries(catMap).map(([name, value]) => ({ name, value, color: catColors[name] })).sort((a, b) => b.value - a.value);
                if (data.length === 0) return (
                  <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    Sem despesas cadastradas
                  </div>
                );
                return (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 0.5 }}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem' }}
                      >
                        {data.map((d, i) => <Cell key={i} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} formatter={(v) => fmtBRL(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>

          {/* Mini KPIs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <KpiCard label="Contratos ativos" value={instKpis.contratos} />
            <KpiCard label="Parcelas atrasadas" value={instKpis.atrasadas} color={instKpis.atrasadas > 0 ? '#f97316' : 'var(--text-muted)'} />
          </div>
        </div>
      )}

      {/* ═══ TAB: PARCELAS ═══ */}
      {!loading && activeTab === 'parcelas' && (
        <div>
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
                  Limpar filtros x
                </button>
              )}
              <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                {filtered.length} parcela{filtered.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Tabela agrupada por mês */}
          {grouped.length === 0 ? (
            <div className="glass-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Nenhuma parcela encontrada.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {grouped.map(([month, insts]) => {
                const mPaid    = insts.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.value), 0);
                const mPending = insts.filter(i => i.status !== 'paid').reduce((s, i) => s + parseFloat(i.value), 0);
                return (
                  <div key={month}>
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
                                    #{inst.installment_number}
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
        </div>
      )}

      {/* ═══ TAB: CUSTOS & GANHOS DA EMPRESA ═══ */}
      {!loading && activeTab === 'empresa' && (
        <div>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <KpiCard label="Receitas (extras)" value={fmtBRL(compKpis.income)} color="#22c55e" />
            <KpiCard label="Despesas" value={fmtBRL(compKpis.expense)} color="#ff6680" />
            <KpiCard label="Balanço" value={fmtBRL(compKpis.profit)}
              color={compKpis.profit >= 0 ? '#22c55e' : '#ff6680'} />
          </div>

          {/* Filtros */}
          <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={compPeriod} onChange={e => setCompPeriod(e.target.value)} style={SEL}>
                <option value="7d">Ultimos 7 dias</option>
                <option value="30d">Ultimos 30 dias</option>
                <option value="90d">Ultimos 90 dias</option>
                <option value="this_month">Este mes</option>
                <option value="last_month">Mes passado</option>
                <option value="this_year">Este ano</option>
                <option value="custom">Personalizado</option>
              </select>
              {compPeriod === 'custom' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>De:</span>
                    <input type="date" value={compDateFrom} onChange={e => setCompDateFrom(e.target.value)} style={{ ...INP, width: 140 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Ate:</span>
                    <input type="date" value={compDateTo} onChange={e => setCompDateTo(e.target.value)} style={{ ...INP, width: 140 }} />
                  </div>
                </>
              )}
              <select value={compTypeFilter} onChange={e => setCompTypeFilter(e.target.value)} style={SEL}>
                <option value="">Todos os tipos</option>
                <option value="income">Entradas</option>
                <option value="expense">Saidas</option>
              </select>
              <select value={compCatFilter} onChange={e => setCompCatFilter(e.target.value)} style={SEL}>
                <option value="">Todas as categorias</option>
                {(() => {
                  const fixed = categories.filter(c => c.type === 'fixed');
                  const variable = categories.filter(c => c.type === 'variable');
                  const opts = [];
                  if (fixed.length > 0) {
                    opts.push(<optgroup key="fixed" label="Fixos">{fixed.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>);
                  }
                  if (variable.length > 0) {
                    opts.push(<optgroup key="variable" label="Variaveis">{variable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>);
                  }
                  return opts;
                })()}
              </select>
              {(compPeriod !== 'this_year' || compTypeFilter || compCatFilter) && (
                <button onClick={() => { setCompPeriod('this_year'); setCompTypeFilter(''); setCompCatFilter(''); setCompDateFrom(''); setCompDateTo(''); }} style={{
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
                  color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                }}>
                  Limpar filtros x
                </button>
              )}
              {compCatFilter && (() => {
                const cat = categories.find(c => c.id === compCatFilter);
                if (!cat) return null;
                return (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 20,
                    fontSize: '0.6rem', fontFamily: 'var(--font-mono)', fontWeight: 600,
                    background: `${cat.color}20`, border: `1px solid ${cat.color}`,
                    color: cat.color,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color }} />
                    {cat.name}
                  </span>
                );
              })()}
              <div style={{ marginLeft: 'auto' }}>
                {!showCompForm && (
                  <button onClick={openNewCompForm} style={{
                    padding: '7px 16px', borderRadius: 7, cursor: 'pointer',
                    border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.09)',
                    color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
                  }}>
                    + Adicionar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Formulário */}
          {showCompForm && (
            <div className="glass-card" style={{ padding: '20px 22px', marginBottom: 20 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                {editingComp ? 'Editar Registro' : 'Novo Registro'}
              </div>
              <form onSubmit={handleSaveComp}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', marginBottom: 12 }}>
                  <div>
                    <SectionLabel>Tipo</SectionLabel>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[{ v: 'expense', l: 'Despesa' }, { v: 'income', l: 'Receita' }].map(o => (
                        <button key={o.v} type="button" onClick={() => setCompForm(f => ({ ...f, type: o.v, category_id: o.v === 'income' ? '' : f.category_id }))} style={{
                          padding: '7px 14px', borderRadius: 6, cursor: 'pointer', flex: 1,
                          background: compForm.type === o.v ? (o.v === 'expense' ? 'rgba(255,26,77,0.1)' : 'rgba(34,197,94,0.1)') : 'rgba(17,17,17,0.6)',
                          border: compForm.type === o.v ? (o.v === 'expense' ? '1px solid rgba(255,26,77,0.4)' : '1px solid rgba(34,197,94,0.4)') : '1px solid var(--border-default)',
                          color: compForm.type === o.v ? (o.v === 'expense' ? '#ff6680' : '#22c55e') : 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
                        }}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {compForm.type === 'expense' && (
                    <div>
                      <SectionLabel>Categoria</SectionLabel>
                      {categories.length > 0 ? (
                        <select value={compForm.category_id} onChange={e => setCompForm(f => ({ ...f, category_id: e.target.value }))} style={{ ...SEL, width: '100%' }}>
                          <option value="">Sem categoria</option>
                          {(() => {
                            const fixed = categories.filter(c => c.type === 'fixed');
                            const variable = categories.filter(c => c.type === 'variable');
                            const opts = [];
                            if (fixed.length > 0) opts.push(<optgroup key="fixed" label="Fixos">{fixed.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>);
                            if (variable.length > 0) opts.push(<optgroup key="variable" label="Variaveis">{variable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>);
                            return opts;
                          })()}
                        </select>
                      ) : (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', padding: '8px 0' }}>
                          <Link href="/dashboard/settings/financeiro" style={{ color: 'var(--brand-400)', textDecoration: 'underline' }}>
                            Configure suas categorias em Config. Financeiro
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ gridColumn: '1/-1' }}>
                    <SectionLabel>Descrição</SectionLabel>
                    <input value={compForm.description} onChange={e => setCompForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Descrição do lançamento..." style={INP} />
                  </div>
                  <div>
                    <SectionLabel>Valor (R$)</SectionLabel>
                    <input value={compForm.value} onChange={handleCompValueMask} placeholder="0,00" style={INP} />
                  </div>
                  <div>
                    <SectionLabel>Data</SectionLabel>
                    <input type="date" value={compForm.date}
                      onChange={e => setCompForm(f => ({ ...f, date: e.target.value }))} style={INP} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <SectionLabel>Observações</SectionLabel>
                    <input value={compForm.notes} onChange={e => setCompForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Opcional..." style={INP} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" disabled={savingComp} style={{
                    padding: '8px 18px', borderRadius: 7, cursor: savingComp ? 'not-allowed' : 'pointer',
                    border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.09)',
                    color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
                  }}>
                    {savingComp ? 'Salvando...' : editingComp ? 'Atualizar' : 'Salvar'}
                  </button>
                  <button type="button" onClick={() => { setShowCompForm(false); setEditingComp(null); }} style={{
                    padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.06)', background: 'transparent',
                    color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                  }}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tabela */}
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {['Tipo', 'Categoria', 'Descrição', 'Valor', 'Data', ''].map(h => (
                      <th key={h} style={{
                        padding: '9px 14px', textAlign: h === '' ? 'right' : 'left',
                        fontFamily: 'var(--font-mono)', fontSize: '0.57rem', color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {companyRecords.map(rec => (
                    <tr key={rec.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                          fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
                          letterSpacing: '0.05em', textTransform: 'uppercase',
                          background: rec.type === 'income' ? 'rgba(34,197,94,0.08)' : 'rgba(255,26,77,0.08)',
                          border: rec.type === 'income' ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,26,77,0.25)',
                          color: rec.type === 'income' ? '#22c55e' : '#ff6680',
                        }}>
                          {rec.type === 'income' ? 'Receita' : 'Despesa'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {rec.category_name || rec.category ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '2px 8px', borderRadius: 20,
                            fontSize: '0.6rem', fontFamily: 'var(--font-mono)', fontWeight: 600,
                            background: rec.category_color ? `${rec.category_color}20` : 'rgba(99,102,241,0.1)',
                            border: `1px solid ${rec.category_color || 'rgba(99,102,241,0.3)'}`,
                            color: rec.category_color || '#6366f1',
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: rec.category_color || '#6366f1' }} />
                            {rec.category_name || rec.category}
                          </span>
                        ) : (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {rec.description}
                        {rec.notes && (
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>{rec.notes}</div>
                        )}
                      </td>
                      <td style={{
                        padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600,
                        color: rec.type === 'income' ? '#22c55e' : '#ff6680',
                      }}>
                        {rec.type === 'expense' ? '- ' : '+ '}{fmtBRL(rec.value)}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDate(rec.date)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button onClick={() => openEditCompForm(rec)} style={{
                            padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                          }}>
                            Editar
                          </button>
                          <button onClick={() => handleDeleteComp(rec.id)} style={{
                            padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                            border: '1px solid rgba(255,26,77,0.2)', background: 'transparent',
                            color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                          }}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {companyRecords.length === 0 && (
                <div style={{ padding: '32px 18px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  Nenhum registro encontrado. Clique em "+ Adicionar" para lançar custos ou receitas.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
