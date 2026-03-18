/**
 * pages/dashboard/form.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Formulário de cadastro de novo cliente de marketing.
 * Alimenta a tabela marketing_clients + seeds as 6 etapas automaticamente.
 * Cria contrato inicial com valor mensal × parcelas + serviços padrão.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';

const DEFAULT_SERVICES = [
  'Planejamento de campanha',
  'Edição de foto',
  'Edição de vídeo',
  'Gerenciamento de rede social',
  'Gerenciamento de tráfego pago',
  'Arte digital',
];

const INITIAL = {
  company_name:         '',
  niche:                '',
  main_product:         '',
  product_description:  '',
  transformation:       '',
  main_problem:         '',
  avg_ticket:           '',
  region:               '',
  comm_objective:       '',
  comm_objective_other: '',
  /* contrato */
  monthly_value:        '',
  num_installments:     '12',
  due_day:              '10',
  start_date:           new Date().toISOString().split('T')[0],
  contract_notes:       '',
};

function Field({ label, hint, required, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{
        display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
        fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-muted)', marginBottom: 6,
      }}>
        {label}{required && <span style={{ color: '#ff0033', marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hint && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 4, opacity: 0.7 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '9px 12px', boxSizing: 'border-box',
  background: 'rgba(17,17,17,0.8)', border: '1px solid var(--border-default)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.82rem',
  fontFamily: 'var(--font-mono)', outline: 'none', transition: 'border-color 0.2s',
};

const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: 80, lineHeight: 1.6 };

function fmtBRL(v) {
  return (parseFloat(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function FormPage() {
  const router  = useRouter();
  const [form,   setForm  ] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error,  setError ] = useState(null);

  /* Serviços — iniciados com os padrão, toggle on/off */
  const [services, setServices] = useState(
    DEFAULT_SERVICES.map((name, i) => ({ id: `svc-${i}`, name, selected: true }))
  );
  const [customService, setCustomService] = useState('');

  function handle(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  function handleValueMask(e) {
    let raw = e.target.value.replace(/\D/g, '');
    if (!raw) { setForm(f => ({ ...f, monthly_value: '' })); return; }
    const cents = parseInt(raw);
    const formatted = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setForm(f => ({ ...f, monthly_value: formatted }));
  }

  function toggleService(i) {
    setServices(s => s.map((svc, j) => j === i ? { ...svc, selected: !svc.selected } : svc));
  }

  function addCustomService() {
    const name = customService.trim();
    if (!name) return;
    setServices(s => [...s, { id: `svc-${Date.now()}`, name, selected: true }]);
    setCustomService('');
  }

  function removeService(i) {
    setServices(s => s.filter((_, j) => j !== i));
  }

  /* Preview do contrato */
  const rawMonthly = parseFloat((form.monthly_value || '0').replace(/\./g, '').replace(',', '.')) || 0;
  const numParcelas = parseInt(form.num_installments) || 0;
  const totalContract = rawMonthly * numParcelas;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.company_name.trim()) { setError('Nome da empresa é obrigatório.'); return; }

    const selectedServices = services.filter(s => s.selected).map(s => ({ id: s.id, name: s.name }));

    setSaving(true);
    setError(null);
    try {
      const res  = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          avg_ticket: rawMonthly > 0 ? fmtBRL(rawMonthly) : '',
          services: selectedServices,
          /* dados do contrato para criação automática */
          contract: rawMonthly > 0 && numParcelas > 0 ? {
            monthly_value:    rawMonthly,
            num_installments: numParcelas,
            due_day:          parseInt(form.due_day) || 10,
            start_date:       form.start_date,
            notes:            form.contract_notes || null,
            services:         selectedServices.map(s => s.name),
          } : null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      router.push(`/dashboard/clients/${json.client.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <DashboardLayout activeTab="form">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
          <Link href="/dashboard/database" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--text-muted)', textDecoration: 'none',
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15,18 9,12 15,6" />
            </svg>
            Base de Dados
          </Link>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>/</span>
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>Novo Cliente</span>
        </div>
        <h1 className="page-title">Cadastrar Cliente</h1>
        <p className="page-subtitle">Preencha os dados base — as 6 etapas são criadas automaticamente</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="glass-card" style={{ padding: '28px 32px', maxWidth: 720 }}>

          {/* Identificação */}
          <div style={{ marginBottom: 28 }}>
            <div className="section-title" style={{ marginBottom: 20 }}>Identificação</div>

            <Field label="Nome da empresa / marca" required>
              <input
                type="text" value={form.company_name} onChange={handle('company_name')}
                placeholder="ex: Studio Fit, Clínica Dra. Ana, Curso X..."
                style={inputStyle}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Nicho de atuação">
                <input
                  type="text" value={form.niche} onChange={handle('niche')}
                  placeholder="ex: Marketing digital, Saúde..."
                  style={inputStyle}
                />
              </Field>
              <Field label="Região / mercado">
                <input
                  type="text" value={form.region} onChange={handle('region')}
                  placeholder="ex: Brasil, São Paulo, Online..."
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', marginBottom: 28 }} />

          {/* Produto */}
          <div style={{ marginBottom: 28 }}>
            <div className="section-title" style={{ marginBottom: 20 }}>Produto / Serviço</div>

            <Field label="Produto ou serviço principal">
              <input
                type="text" value={form.main_product} onChange={handle('main_product')}
                placeholder="ex: Mentoria de gestão financeira, Curso de inglês..."
                style={inputStyle}
              />
            </Field>

            <Field label="O que esse produto faz na prática" hint="Descreva o que o cliente recebe e como funciona">
              <textarea
                value={form.product_description} onChange={handle('product_description')}
                placeholder="Explique de forma objetiva o que o produto entrega..."
                style={textareaStyle}
              />
            </Field>

            <Field label="Transformação entregue" hint="O resultado que o cliente vai sentir — não o produto em si">
              <textarea
                value={form.transformation} onChange={handle('transformation')}
                placeholder="ex: O cliente sai com um plano financeiro claro e consegue economizar R$500/mês..."
                style={{ ...textareaStyle, minHeight: 70 }}
              />
            </Field>

            <Field label="Problema principal que resolve">
              <textarea
                value={form.main_problem} onChange={handle('main_problem')}
                placeholder="ex: Falta de organização financeira que impede a empresa de crescer..."
                style={{ ...textareaStyle, minHeight: 70 }}
              />
            </Field>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', marginBottom: 28 }} />

          {/* Serviços Contratados */}
          <div style={{ marginBottom: 28 }}>
            <div className="section-title" style={{ marginBottom: 20 }}>Serviços Contratados</div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {services.map((svc, i) => (
                <div key={svc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                  borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
                  background: svc.selected ? 'rgba(255,0,51,0.1)' : 'rgba(17,17,17,0.6)',
                  border: svc.selected ? '1px solid rgba(255,0,51,0.4)' : '1px solid var(--border-default)',
                }} onClick={() => toggleService(i)}>
                  <div style={{
                    width: 14, height: 14, borderRadius: 4, flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: svc.selected ? 'rgba(255,0,51,0.25)' : 'transparent',
                    border: svc.selected ? '1.5px solid #ff0033' : '1.5px solid var(--border-default)',
                  }}>
                    {svc.selected && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ff6680" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                    color: svc.selected ? '#ff6680' : 'var(--text-muted)',
                  }}>
                    {svc.name}
                  </span>
                  {!DEFAULT_SERVICES.includes(svc.name) && (
                    <button type="button" onClick={e => { e.stopPropagation(); removeService(i); }} style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                      padding: 0, marginLeft: 2, fontSize: '0.8rem', lineHeight: 1,
                    }}>
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text" value={customService} onChange={e => setCustomService(e.target.value)}
                placeholder="Adicionar serviço personalizado..."
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomService(); } }}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button type="button" onClick={addCustomService} style={{
                padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              }}>
                +
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', marginBottom: 28 }} />

          {/* Comercial */}
          <div style={{ marginBottom: 28 }}>
            <div className="section-title" style={{ marginBottom: 20 }}>Dados Comerciais</div>

            <Field label="Objetivo da comunicação" required>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {[
                  { value: 'sales',     label: 'Gerar Vendas'     },
                  { value: 'leads',     label: 'Gerar Leads'      },
                  { value: 'authority', label: 'Gerar Autoridade' },
                  { value: 'other',     label: 'Outro'            },
                ].map(opt => (
                  <label key={opt.value} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                    borderRadius: 8, cursor: 'pointer',
                    background: form.comm_objective === opt.value ? 'rgba(255,0,51,0.1)' : 'rgba(17,17,17,0.6)',
                    border: form.comm_objective === opt.value ? '1px solid rgba(255,0,51,0.4)' : '1px solid var(--border-default)',
                    transition: 'all 0.2s',
                  }}>
                    <input
                      type="radio" name="comm_objective" value={opt.value}
                      checked={form.comm_objective === opt.value}
                      onChange={handle('comm_objective')}
                      style={{ display: 'none' }}
                    />
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                      border: form.comm_objective === opt.value ? '3px solid #ff0033' : '2px solid var(--border-default)',
                      background: form.comm_objective === opt.value ? 'rgba(255,0,51,0.2)' : 'transparent',
                    }} />
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                      color: form.comm_objective === opt.value ? '#ff6680' : 'var(--text-muted)',
                    }}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            {form.comm_objective === 'other' && (
              <Field label="Especifique o objetivo">
                <input
                  type="text" value={form.comm_objective_other} onChange={handle('comm_objective_other')}
                  placeholder="Descreva o objetivo..."
                  style={inputStyle}
                />
              </Field>
            )}
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', marginBottom: 28 }} />

          {/* Contrato Financeiro */}
          <div style={{ marginBottom: 28 }}>
            <div className="section-title" style={{ marginBottom: 20 }}>Contrato Financeiro</div>
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 18,
              background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'rgba(165,180,252,0.75)' }}>
                Defina o valor mensal e a quantidade de parcelas. As parcelas e datas de vencimento serão geradas automaticamente.
                Deixe vazio para cadastrar o contrato depois.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              <Field label="Valor Mensal (R$)">
                <input
                  value={form.monthly_value} onChange={handleValueMask}
                  placeholder="0,00"
                  style={inputStyle}
                />
              </Field>
              <Field label="Quantidade de Parcelas">
                <input
                  type="number" min="1" max="120" value={form.num_installments}
                  onChange={e => setForm(f => ({ ...f, num_installments: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
              <Field label="Dia de Vencimento">
                <input
                  type="number" min="1" max="31" value={form.due_day}
                  onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
              <Field label="Data de Início">
                <input
                  type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="Observações do contrato">
              <textarea
                value={form.contract_notes} onChange={handle('contract_notes')}
                rows={2} placeholder="Informações adicionais sobre o contrato..."
                style={{ ...textareaStyle, minHeight: 50 }}
              />
            </Field>

            {rawMonthly > 0 && numParcelas > 0 && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginTop: 4,
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#22c55e' }}>
                  {numParcelas}x de {fmtBRL(rawMonthly)} = {fmtBRL(totalContract)}
                  {` · vence dia ${form.due_day} · início ${form.start_date}`}
                </span>
              </div>
            )}
          </div>

          {/* Erro */}
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 20,
              background: 'rgba(255,26,77,0.08)', border: '1px solid rgba(255,26,77,0.25)',
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ff6680',
            }}>
              {error}
            </div>
          )}

          {/* Ações */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                background: saving ? 'rgba(255,0,51,0.3)' : 'rgba(255,0,51,0.15)',
                color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
                fontWeight: 600, letterSpacing: '0.04em',
                outline: '1px solid rgba(255,0,51,0.3)',
              }}
            >
              {saving ? 'Cadastrando...' : 'Cadastrar Cliente →'}
            </button>
            <Link href="/dashboard/database" style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
              color: 'var(--text-muted)', textDecoration: 'none',
            }}>
              Cancelar
            </Link>
          </div>

          {/* Nota */}
          <div style={{ marginTop: 20, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              As 6 etapas são criadas automaticamente:&nbsp;
              Diagnóstico · Concorrentes · Público-Alvo · Avatar · Posicionamento · Oferta
            </span>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
}
