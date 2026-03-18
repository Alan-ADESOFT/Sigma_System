/**
 * pages/dashboard/clients/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Clientes — listagem com paginação, filtros e ações.
 * "Novo Cliente" abre popup inline com campos básicos.
 * Colunas: Empresa · Contato · Status · Ticket · Serviços · Cadastro · Ações
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DashboardLayout from '../../../components/DashboardLayout';

/* ─────────────────────────────────────────────────────────
   Constantes
───────────────────────────────────────────────────────── */
const PER_PAGE = 10;

const STATUS_CFG = {
  active:   { label: 'Ativo',   bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.25)',  color: '#22c55e' },
  inactive: { label: 'Inativo', bg: 'rgba(82,82,82,0.12)',  border: 'rgba(82,82,82,0.3)',    color: '#525252' },
};

/* ── Ticket helpers ── */
function parseTicket(raw) {
  if (!raw) return 0;
  const clean = String(raw)
    .replace(/R\$\s*/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

function formatBRL(val) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

/* ─────────────────────────────────────────────────────────
   Atoms
───────────────────────────────────────────────────────── */
function Avatar({ src, name, size = 30 }) {
  const [err, setErr] = useState(false);
  const ini = (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  if (src && !err) {
    return <img src={src} onError={() => setErr(true)} alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
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

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status];
  if (!cfg) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase', color: cfg.color,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function ActionBtn({ title, onClick, color = 'var(--text-muted)', children }) {
  const [hov, setHov] = useState(false);
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
        background: hov ? 'rgba(255,255,255,0.05)' : 'transparent',
        color: hov ? color : 'var(--text-muted)', transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────
   Modal — Novo Cliente (campos básicos)
───────────────────────────────────────────────────────── */
const INP_STYLE = {
  width: '100%', padding: '8px 10px', boxSizing: 'border-box',
  background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.8rem',
  fontFamily: 'var(--font-mono)', outline: 'none',
};

function Lbl({ children, req }) {
  return (
    <label style={{
      display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
    }}>
      {children}{req && <span style={{ color: '#ff0033', marginLeft: 3 }}>*</span>}
    </label>
  );
}

const FREQ_OPTS = [
  { value: 'monthly',    label: 'Mensal'     },
  { value: 'quarterly',  label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral'  },
  { value: 'annual',     label: 'Anual'      },
  { value: 'one_time',   label: 'Único'      },
];

function numInstallments(freq, months) {
  const map = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, one_time: 9999 };
  if (freq === 'one_time') return 1;
  return Math.ceil(months / (map[freq] || 1));
}

/* ── Phone mask ── */
function maskPhone(v) {
  let d = v.replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

/* ── BRL live mask ── */
function applyBRLMask(v) {
  const d = v.replace(/\D/g, '');
  if (!d) return '';
  return (parseInt(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Field error label ── */
function FieldErr({ msg }) {
  if (!msg) return null;
  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#ff6680', marginTop: 3 }}>{msg}</div>;
}

const FREQ_LABELS_MAP = { monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual', one_time: 'Único' };

const DEFAULT_SERVICES = [
  'Planejamento de campanha',
  'Edição de foto',
  'Edição de vídeo',
  'Gerenciamento de rede social',
  'Gerenciamento de tráfego pago',
  'Arte digital',
];

function AddClientModal({ onClose }) {
  const router  = useRouter();
  const [tab,   setTab  ] = useState(0);
  const [done,  setDone ] = useState([false, false]); // tabs 0,1 completed

  const [info, setInfo] = useState({
    company_name: '', niche: '', email: '', phone: '', region: '', status: 'active', inactive_reason: '',
  });
  const [services, setServices] = useState(() =>
    DEFAULT_SERVICES.map((name, i) => ({ id: i, name, selected: true }))
  );
  const [customSvc, setCustomSvc] = useState('');
  const [fin, setFin] = useState({
    contract_value: '', frequency: 'monthly', period_months: '12', due_day: '10', start_date: '',
  });

  const [errs,   setErrs  ] = useState({});
  const [saving, setSaving] = useState(false);
  const [error,  setError ] = useState(null);

  function setInfoField(f, v) { setInfo(p => ({ ...p, [f]: v })); setErrs(e => ({ ...e, [f]: undefined })); setError(null); }
  function setFinField(f, v)  { setFin(p => ({ ...p, [f]: v })); setErrs(e => ({ ...e, [f]: undefined })); }

  /* Services */
  const toggleSvc   = i => setServices(s => s.map((x, j) => j === i ? { ...x, selected: !x.selected } : x));
  const rmCustomSvc = i => setServices(s => s.filter((_, j) => j !== i));
  function addCustomSvc() {
    const name = customSvc.trim();
    if (!name) return;
    setServices(s => [...s, { id: Date.now(), name, selected: true }]);
    setCustomSvc('');
  }

  /* Tab 0 validation */
  function validateTab0() {
    const e = {};
    if (!info.company_name.trim()) e.company_name = 'Nome da empresa é obrigatório.';
    if (info.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email)) e.email = 'E-mail inválido.';
    const day = parseInt(info.phone?.replace(/\D/g, '') || '');
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  /* Tab 2 validation */
  function validateTab2() {
    const val = parseTicket(fin.contract_value);
    const e = {};
    if (val > 0 && !fin.start_date) e.start_date = 'Informe a data de início.';
    if (!val && fin.start_date)     e.contract_value = 'Informe o valor do contrato.';
    const day = parseInt(fin.due_day);
    if (val > 0 && (isNaN(day) || day < 1 || day > 31)) e.due_day = 'Dia inválido (1-31).';
    const months = parseInt(fin.period_months);
    if (val > 0 && fin.frequency !== 'one_time' && (isNaN(months) || months < 1)) e.period_months = 'Período inválido.';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  function goNext() {
    if (tab === 0) { if (!validateTab0()) return; setDone(d => { const n=[...d]; n[0]=true; return n; }); }
    setTab(t => t + 1);
  }

  function goToTab(i) {
    if (i > tab && tab === 0 && !validateTab0()) return;
    setTab(i);
  }

  async function submit() {
    if (!validateTab2()) return;
    setSaving(true); setError(null);
    try {
      const selectedServices = services.filter(s => s.selected).map(s => ({ id: s.id, name: s.name }));
      const cRes  = await fetch('/api/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...info,
          services: selectedServices,
          extra_data: info.inactive_reason ? { inactive_reason: info.inactive_reason } : null,
        }),
      });
      const cJson = await cRes.json();
      if (!cJson.success) throw new Error(cJson.error);
      const clientId = cJson.client.id;

      const val = parseTicket(fin.contract_value);
      if (val > 0 && fin.start_date) {
        await fetch(`/api/clients/${clientId}/contracts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contract_value: val,
            frequency:      fin.frequency,
            period_months:  parseInt(fin.period_months) || 12,
            due_day:        parseInt(fin.due_day) || 10,
            start_date:     fin.start_date,
          }),
        });
      }

      onClose();
      router.push(`/dashboard/clients/${clientId}`);
    } catch (err) { setError(err.message); setSaving(false); }
  }

  const TABS_LBL = ['Informações', 'Serviços', 'Valores'];

  const valNum    = parseTicket(fin.contract_value);
  const nParcels  = numInstallments(fin.frequency, parseInt(fin.period_months) || 12);
  const perParcel = valNum > 0 && nParcels > 0 ? valNum / nParcels : 0;

  const inpErr = (field) => errs[field]
    ? { ...INP_STYLE, border: '1px solid rgba(255,26,77,0.5)' }
    : INP_STYLE;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-card"
        style={{ width: '100%', maxWidth: 680, padding: 0, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 0', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Novo Cliente
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Preencha as informações passo a passo
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Step bar ── */}
        <div style={{ display: 'flex', padding: '14px 28px 0', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
          {TABS_LBL.map((lbl, i) => {
            const active = tab === i;
            const completed = i === 0 ? done[0] : i === 1 ? done[1] : false;
            return (
              <button key={lbl} onClick={() => goToTab(i)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', border: 'none', cursor: 'pointer', background: 'transparent',
                borderBottom: active ? '2px solid #ff0033' : '2px solid transparent',
                color: active ? '#ff6680' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: active ? 600 : 400,
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: '50%', fontSize: '0.58rem', fontWeight: 700,
                  background: active ? 'rgba(255,0,51,0.18)' : completed ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#ff6680' : completed ? '#22c55e' : 'var(--text-muted)',
                  border: active ? '1px solid rgba(255,0,51,0.3)' : completed ? '1px solid rgba(34,197,94,0.25)' : '1px solid transparent',
                }}>
                  {completed && !active ? '✓' : i + 1}
                </span>
                {lbl}
              </button>
            );
          })}
        </div>

        {/* ── Conteúdo ── */}
        <div style={{ padding: '22px 28px', overflowY: 'auto', flex: 1 }}>

          {/* Tab 0 — Informações */}
          {tab === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <Lbl req>Empresa / Marca</Lbl>
                <input value={info.company_name}
                  onChange={e => setInfoField('company_name', e.target.value)}
                  placeholder="ex: Studio Fit, Clínica Ana, Marca X..."
                  style={inpErr('company_name')} autoFocus />
                <FieldErr msg={errs.company_name} />
              </div>
              <div>
                <Lbl>Nicho</Lbl>
                <input value={info.niche} onChange={e => setInfoField('niche', e.target.value)}
                  placeholder="Fitness, Saúde, Moda..." style={INP_STYLE} />
              </div>
              <div>
                <Lbl>Região</Lbl>
                <input value={info.region} onChange={e => setInfoField('region', e.target.value)}
                  placeholder="Brasil, SP, RJ..." style={INP_STYLE} />
              </div>
              <div>
                <Lbl>E-mail</Lbl>
                <input type="email" value={info.email}
                  onChange={e => setInfoField('email', e.target.value)}
                  placeholder="contato@empresa.com" style={inpErr('email')} />
                <FieldErr msg={errs.email} />
              </div>
              <div>
                <Lbl>Telefone</Lbl>
                <input value={info.phone}
                  onChange={e => setInfoField('phone', maskPhone(e.target.value))}
                  placeholder="(11) 99999-9999" style={INP_STYLE} inputMode="numeric" />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Lbl>Status</Lbl>
                <select value={info.status} onChange={e => setInfoField('status', e.target.value)} style={INP_STYLE}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
              {info.status === 'inactive' && (
                <div style={{ gridColumn: '1/-1' }}>
                  <Lbl>Motivo da Inativação</Lbl>
                  <input
                    value={info.inactive_reason}
                    onChange={e => setInfoField('inactive_reason', e.target.value)}
                    placeholder="Descreva o motivo da inativação..."
                    style={INP_STYLE}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tab 1 — Serviços */}
          {tab === 1 && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
                Serviços Contratados
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {services.map((sv, i) => (
                  <button key={sv.id} onClick={() => toggleSvc(i)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                    border: sv.selected ? '1px solid rgba(255,0,51,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    background: sv.selected ? 'rgba(255,0,51,0.1)' : 'rgba(255,255,255,0.02)',
                    color: sv.selected ? '#ff6680' : 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: sv.selected ? 600 : 400,
                    transition: 'all 0.15s',
                  }}>
                    {sv.selected && <span style={{ fontSize: '0.55rem' }}>✓</span>}
                    {sv.name}
                    {!DEFAULT_SERVICES.includes(sv.name) && (
                      <span onClick={e => { e.stopPropagation(); rmCustomSvc(i); }} style={{ marginLeft: 2, opacity: 0.6, fontSize: '0.75rem', lineHeight: 1 }}>×</span>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={customSvc}
                  onChange={e => setCustomSvc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSvc())}
                  placeholder="Adicionar serviço personalizado..."
                  style={{ ...INP_STYLE, flex: 1 }}
                />
                <button onClick={addCustomSvc} style={{
                  padding: '8px 14px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: '1px solid rgba(255,0,51,0.25)', background: 'rgba(255,0,51,0.06)',
                  color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
                }}>
                  + Adicionar
                </button>
              </div>
              <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                {services.filter(s => s.selected).length} serviço(s) selecionado(s)
              </div>
            </div>
          )}

          {/* Tab 2 — Valores */}
          {tab === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Info box */}
              <div style={{
                padding: '12px 14px', borderRadius: 7,
                background: 'rgba(255,185,0,0.04)', border: '1px solid rgba(255,185,0,0.12)',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'rgba(255,185,0,0.7)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'rgba(255,185,0,0.9)', display: 'block', marginBottom: 3 }}>ℹ Como funciona o financeiro</strong>
                  Ao cadastrar um contrato, todas as parcelas são geradas automaticamente com base na frequência e duração.
                  Cada parcela pode ser marcada como <strong>Pago</strong> manualmente. Parcelas não pagas após o vencimento são
                  sinalizadas como <strong>Atrasadas</strong> automaticamente. Esta aba é opcional — o contrato pode ser criado depois.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <Lbl>Valor do Contrato (R$)</Lbl>
                  <input
                    value={fin.contract_value}
                    onChange={e => setFinField('contract_value', applyBRLMask(e.target.value))}
                    placeholder="0,00" inputMode="numeric"
                    style={inpErr('contract_value')}
                  />
                  <FieldErr msg={errs.contract_value} />
                </div>
                <div>
                  <Lbl>Frequência</Lbl>
                  <select value={fin.frequency} onChange={e => setFinField('frequency', e.target.value)} style={INP_STYLE}>
                    {FREQ_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <Lbl>Duração (meses)</Lbl>
                  <input type="number" min="1" max="120" value={fin.period_months}
                    onChange={e => setFinField('period_months', e.target.value)}
                    style={inpErr('period_months')} disabled={fin.frequency === 'one_time'} />
                  <FieldErr msg={errs.period_months} />
                </div>
                <div>
                  <Lbl>Dia de Vencimento</Lbl>
                  <input type="number" min="1" max="31" value={fin.due_day}
                    onChange={e => setFinField('due_day', e.target.value)}
                    style={inpErr('due_day')} />
                  <FieldErr msg={errs.due_day} />
                </div>
                <div>
                  <Lbl>Data de Início</Lbl>
                  <input type="date" value={fin.start_date}
                    onChange={e => setFinField('start_date', e.target.value)}
                    style={inpErr('start_date')} />
                  <FieldErr msg={errs.start_date} />
                </div>
              </div>

              {/* Preview de parcelas */}
              {valNum > 0 && (
                <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'rgba(34,197,94,0.6)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Prévia das parcelas
                  </div>
                  <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: '#22c55e' }}>{nParcels}×</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)' }}>parcelas</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatBRL(perParcel)}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)' }}>por parcela · {FREQ_LABELS_MAP[fin.frequency]}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: '#f97316' }}>{formatBRL(valNum)}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)' }}>total do contrato</div>
                    </div>
                  </div>
                  {fin.start_date && (
                    <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                      Primeira parcela: dia {fin.due_day} · a partir de {new Date(fin.start_date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Erro global */}
          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 6, marginTop: 12, background: 'rgba(255,26,77,0.08)', border: '1px solid rgba(255,26,77,0.25)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#ff6680' }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 28px 22px', borderTop: '1px solid rgba(255,255,255,0.04)', flexShrink: 0,
        }}>
          <button
            onClick={() => tab > 0 ? setTab(t => t - 1) : onClose()}
            style={{
              padding: '9px 16px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
            }}
          >
            {tab === 0 ? 'Cancelar' : '← Anterior'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: i === tab ? 20 : 6, height: 6, borderRadius: 3,
                background: i === tab ? '#ff0033' : done[i] ? '#22c55e' : 'rgba(255,255,255,0.1)',
                transition: 'all 0.2s',
              }} />
            ))}
          </div>

          {tab < 2 ? (
            <button onClick={goNext} style={{
              padding: '9px 20px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.1)',
              color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
            }}>
              Próximo →
            </button>
          ) : (
            <button onClick={submit} disabled={saving} style={{
              padding: '9px 22px', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.1)',
              color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
            }}>
              {saving ? 'Cadastrando...' : 'Cadastrar →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Modal de edição rápida
───────────────────────────────────────────────────────── */
function EditModal({ client, onClose, onSave }) {
  const [form, setForm] = useState({
    company_name:    client.company_name    || '',
    niche:           client.niche           || '',
    email:           client.email           || '',
    phone:           client.phone           || '',
    avg_ticket:      client.avg_ticket      || '',
    region:          client.region          || '',
    status:          client.status === 'inactive' ? 'inactive' : 'active',
    inactive_reason: client.extra_data?.inactive_reason || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError ] = useState(null);

  function h(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })); }

  function handleTicketBlur() {
    const num = parseTicket(form.avg_ticket);
    if (num > 0) setForm(p => ({ ...p, avg_ticket: formatBRL(num) }));
  }
  function handleTicketFocus() {
    const num = parseTicket(form.avg_ticket);
    if (num > 0) setForm(p => ({ ...p, avg_ticket: String(num) }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.company_name.trim()) { setError('Nome obrigatório.'); return; }
    setSaving(true); setError(null);
    try {
      // Preserve existing extra_data and update inactive_reason
      const existingExtra = client.extra_data || {};
      const extra_data = form.inactive_reason
        ? { ...existingExtra, inactive_reason: form.inactive_reason }
        : existingExtra.inactive_reason
          ? { ...existingExtra } // keep old reason even when reactivated
          : existingExtra;
      const { inactive_reason, ...formWithoutReason } = form;
      const res  = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formWithoutReason, extra_data }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSave(json.client);
    } catch (err) { setError(err.message); setSaving(false); }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxWidth: 520, padding: '26px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>Editar Cliente</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>{client.company_name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <Lbl req>Empresa</Lbl>
              <input value={form.company_name} onChange={h('company_name')} style={INP_STYLE} />
            </div>
            <div>
              <Lbl>Nicho</Lbl>
              <input value={form.niche} onChange={h('niche')} placeholder="ex: Saúde, Moda..." style={INP_STYLE} />
            </div>
            <div>
              <Lbl>E-mail</Lbl>
              <input type="email" value={form.email} onChange={h('email')} placeholder="contato@empresa.com" style={INP_STYLE} />
            </div>
            <div>
              <Lbl>Telefone</Lbl>
              <input value={form.phone} onChange={h('phone')} placeholder="(11) 99999-9999" style={INP_STYLE} />
            </div>
            <div>
              <Lbl>Ticket Médio</Lbl>
              <input
                value={form.avg_ticket} onChange={h('avg_ticket')}
                onBlur={handleTicketBlur} onFocus={handleTicketFocus}
                placeholder="R$ 997,00" style={INP_STYLE}
              />
            </div>
            <div>
              <Lbl>Região</Lbl>
              <input value={form.region} onChange={h('region')} placeholder="Brasil, SP..." style={INP_STYLE} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Lbl>Status</Lbl>
              <select value={form.status} onChange={h('status')} style={INP_STYLE}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
            {form.status === 'inactive' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Lbl>Motivo da Inativação</Lbl>
                <input
                  value={form.inactive_reason}
                  onChange={h('inactive_reason')}
                  placeholder="Descreva o motivo da inativação..."
                  style={INP_STYLE}
                />
              </div>
            )}
            {form.status === 'active' && (client.extra_data?.inactive_reason || form.inactive_reason) && (
              <div style={{ gridColumn: '1 / -1', padding: '8px 12px', borderRadius: 6, background: 'rgba(255,185,0,0.06)', border: '1px solid rgba(255,185,0,0.18)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'rgba(255,185,0,0.7)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Motivo de inativação anterior</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'rgba(255,185,0,0.9)' }}>
                  {form.inactive_reason || client.extra_data?.inactive_reason}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: '7px 10px', borderRadius: 6, marginBottom: 12, background: 'rgba(255,26,77,0.08)', border: '1px solid rgba(255,26,77,0.25)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#ff6680' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={saving} style={{
              padding: '8px 20px', borderRadius: 6, border: '1px solid rgba(255,0,51,0.3)',
              background: 'rgba(255,0,51,0.1)', color: '#ff6680',
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={onClose} style={{
              padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)',
              background: 'transparent', color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem', cursor: 'pointer',
            }}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Modal de confirmação de exclusão
───────────────────────────────────────────────────────── */
function DeleteConfirm({ client, onClose, onConfirm, deleting }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-card"
        style={{ width: '100%', maxWidth: 360, padding: '28px 30px', textAlign: 'center' }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', margin: '0 auto 14px', background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff1a4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3,6 5,6 21,6" /><path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Excluir Cliente
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 22 }}>
          Tem certeza que deseja excluir<br />
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{client?.company_name}</span>?<br />
          Todas as etapas vinculadas serão removidas.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onConfirm} disabled={deleting} style={{
            padding: '8px 20px', borderRadius: 6, background: 'rgba(255,0,51,0.1)',
            border: '1px solid rgba(255,0,51,0.3)', color: '#ff6680',
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
            cursor: deleting ? 'not-allowed' : 'pointer',
          }}>
            {deleting ? 'Excluindo...' : 'Confirmar'}
          </button>
          <button onClick={onClose} style={{
            padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)',
            background: 'transparent', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem', cursor: 'pointer',
          }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Linha da tabela
───────────────────────────────────────────────────────── */
function ClientRow({ client, onEdit, onDelete, isOdd }) {
  const router   = useRouter();
  const services = Array.isArray(client.services) ? client.services : [];
  const ticket   = parseTicket(client.avg_ticket);

  return (
    <tr style={{ background: isOdd ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
      {/* Empresa */}
      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Avatar src={client.logo_url} name={client.company_name} size={30} />
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 1 }}>
              {client.company_name}
            </div>
            {client.niche && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                {client.niche}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Contato */}
      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
        {client.email && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 1 }}>
            {client.email}
          </div>
        )}
        {client.phone && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
            {client.phone}
          </div>
        )}
        {!client.email && !client.phone && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#333' }}>—</span>
        )}
      </td>

      {/* Status */}
      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
        <StatusBadge status={client.status === 'inactive' ? 'inactive' : 'active'} />
      </td>

      {/* Ticket */}
      <td style={{ padding: '10px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        {ticket > 0 ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#22c55e', fontWeight: 600 }}>
            {formatBRL(ticket)}
          </span>
        ) : (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#333' }}>—</span>
        )}
      </td>

      {/* Serviços */}
      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
        {services.length === 0 ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#333' }}>—</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {services.slice(0, 2).map((sv, i) => (
              <span key={i} style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.58rem', padding: '2px 6px', borderRadius: 4,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                color: 'var(--text-muted)', whiteSpace: 'nowrap',
              }}>
                {sv.name || sv}
              </span>
            ))}
            {services.length > 2 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)' }}>
                +{services.length - 2}
              </span>
            )}
          </div>
        )}
      </td>

      {/* Cadastro */}
      <td style={{ padding: '10px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          {formatDate(client.created_at)}
        </span>
      </td>

      {/* Ações */}
      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          <ActionBtn title="Ver cliente" color="#3b82f6" onClick={() => router.push(`/dashboard/clients/${client.id}`)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </ActionBtn>
          <ActionBtn title="Editar" color="#f97316" onClick={() => onEdit(client)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </ActionBtn>
          <ActionBtn title="Excluir" color="#ff1a4d" onClick={() => onDelete(client)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,6 5,6 21,6" /><path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
            </svg>
          </ActionBtn>
        </div>
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────
   Paginação
───────────────────────────────────────────────────────── */
function NavBtn({ disabled, onClick, children }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      background: 'transparent', color: disabled ? 'rgba(82,82,82,0.4)' : 'var(--text-muted)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </button>
  );
}

function Pagination({ current, total, onChange }) {
  if (total <= 1) return null;
  const pages = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', padding: '12px 14px 0' }}>
      <NavBtn disabled={current === 1} onClick={() => onChange(current - 1)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6" /></svg>
      </NavBtn>
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: p === current ? 'rgba(255,0,51,0.12)' : 'transparent',
          color: p === current ? '#ff6680' : 'var(--text-muted)',
          fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: p === current ? 700 : 400,
          outline: p === current ? '1px solid rgba(255,0,51,0.25)' : 'none',
        }}>{p}</button>
      ))}
      <NavBtn disabled={current === total} onClick={() => onChange(current + 1)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6" /></svg>
      </NavBtn>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Página
───────────────────────────────────────────────────────── */
export default function ClientsPage() {
  const [clients,     setClients    ] = useState([]);
  const [loading,     setLoading    ] = useState(true);
  const [error,       setError      ] = useState(null);
  const [search,      setSearch     ] = useState('');
  const [statusF,     setStatusF    ] = useState('');
  const [page,        setPage       ] = useState(1);
  const [showAdd,     setShowAdd    ] = useState(false);
  const [editTarget,  setEditTarget ] = useState(null);
  const [deleteTarget,setDeleteTarget] = useState(null);
  const [deleting,    setDeleting   ] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/clients');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setClients(json.clients);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = clients.filter(c => {
      const matchSearch = !q ||
        c.company_name?.toLowerCase().includes(q) ||
        c.niche?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q);
      const matchStatus = !statusF || c.status === statusF;
      return matchSearch && matchStatus;
    });
    // Inactive clients always at the bottom
    return list.sort((a, b) => {
      const aInactive = a.status === 'inactive' ? 1 : 0;
      const bInactive = b.status === 'inactive' ? 1 : 0;
      return aInactive - bInactive;
    });
  }, [clients, search, statusF]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [search, statusF]);

  const stats = useMemo(() => {
    const active   = clients.filter(c => c.status !== 'inactive');
    const inactive = clients.filter(c => c.status === 'inactive');
    const valorTotal = active.reduce((acc, c) => acc + parseTicket(c.avg_ticket), 0);
    return { total: clients.length, active: active.length, inactive: inactive.length, valorTotal };
  }, [clients]);

  function handleSaved(updated) {
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
    setEditTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/clients/${deleteTarget.id}`, { method: 'DELETE' });
      setClients(prev => prev.filter(c => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { alert('Erro ao excluir: ' + err.message); }
    finally { setDeleting(false); }
  }

  const thStyle = {
    padding: '10px 14px', textAlign: 'left',
    fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
    letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)',
    borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
  };

  const inpStyle = {
    padding: '7px 11px', boxSizing: 'border-box',
    background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.75rem',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  return (
    <DashboardLayout activeTab="clients">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title">Clientes</h1>
            <p className="page-subtitle">Gestão de clientes cadastrados</p>
          </div>
          <button onClick={() => setShowAdd(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 8,
            background: 'rgba(255,0,51,0.1)', border: '1px solid rgba(255,0,51,0.3)',
            color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
            fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novo Cliente
          </button>
        </div>
      </div>

      {/* KPIs */}
      {!loading && clients.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total',       value: stats.total,                        color: 'var(--text-primary)' },
            { label: 'Ativos',      value: stats.active,                       color: '#22c55e' },
            { label: 'Inativos',    value: stats.inactive,                     color: '#525252' },
            { label: 'Valor Total', value: formatBRL(stats.valorTotal),        color: '#f97316', small: true },
          ].map(s => (
            <div key={s.label} className="glass-card" style={{ padding: '12px 16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: s.small ? '0.88rem' : '1.3rem', fontWeight: 700, color: s.color }}>
                {s.value}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 2 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Buscar empresa, nicho, email..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inpStyle, width: '100%', paddingLeft: 30 }} />
        </div>

        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inpStyle, minWidth: 130 }}>
          <option value="">Todos</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>

        {(search || statusF) && (
          <button onClick={() => { setSearch(''); setStatusF(''); }} style={{
            padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)',
            background: 'transparent', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem', cursor: 'pointer',
          }}>
            Limpar
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>// carregando clientes...</div>
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="glass-card" style={{ padding: 18, borderColor: 'rgba(255,26,77,0.3)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ff6680' }}>// erro: {error}</span>
        </div>
      )}

      {/* Tabela */}
      {!loading && !error && (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {paginated.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: clients.length === 0 ? 12 : 0 }}>
                {clients.length === 0 ? '// nenhum cliente cadastrado' : '// nenhum resultado para os filtros aplicados'}
              </div>
              {clients.length === 0 && (
                <button onClick={() => setShowAdd(true)} style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#ff6680',
                  background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(255,102,128,0.3)',
                }}>
                  Cadastrar primeiro cliente →
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Empresa</th>
                      <th style={thStyle}>Contato</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Ticket</th>
                      <th style={thStyle}>Serviços</th>
                      <th style={thStyle}>Cadastro</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((client, i) => (
                      <ClientRow
                        key={client.id}
                        client={client}
                        isOdd={i % 2 !== 0}
                        onEdit={setEditTarget}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap', gap: 8,
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
                  {filtered.length !== clients.length && ` de ${clients.length}`}
                  {' · '}página {page} de {totalPages}
                </span>
                <Pagination current={page} total={totalPages} onChange={setPage} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal novo cliente */}
      {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onCreate={c => setClients(p => [c, ...p])} />}

      {/* Modal edição */}
      {editTarget && <EditModal client={editTarget} onClose={() => setEditTarget(null)} onSave={handleSaved} />}

      {/* Modal exclusão */}
      {deleteTarget && <DeleteConfirm client={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} deleting={deleting} />}
    </DashboardLayout>
  );
}
