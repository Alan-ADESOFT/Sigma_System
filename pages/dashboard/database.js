/**
 * pages/dashboard/database.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Base de Dados — visão geral do pipeline por cliente.
 * Clicar em um cliente abre popup com seus 6 cards de etapa.
 * Clicar em uma etapa abre o StageModal (editor + agente).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import StageModal from '../../components/StageModal';

const STAGES_META = [
  { key: 'diagnosis',   index: 1, label: 'Diagnóstico do Negócio',  desc: 'Base estratégica — dados do formulário + interpretação.' },
  { key: 'competitors', index: 2, label: 'Análise de Concorrentes',  desc: 'Mapeamento de concorrentes e lacunas do mercado.' },
  { key: 'audience',    index: 3, label: 'Público-Alvo',            desc: 'Perfil demográfico, psicográfico e comportamental.' },
  { key: 'avatar',      index: 4, label: 'Construção do Avatar',    desc: 'Avatar completo com dores, desejos e objeções.' },
  { key: 'positioning', index: 5, label: 'Posicionamento da Marca', desc: 'Declaração de posicionamento e vantagem competitiva.' },
  { key: 'offer',       index: 6, label: 'Definição da Oferta',     desc: 'Referências de oferta, anúncios e landing page.' },
];

const STATUS_COLORS = {
  pending:     { bg: 'rgba(82,82,82,0.15)',   border: 'rgba(82,82,82,0.35)',   dot: '#525252',  label: 'Pendente'     },
  in_progress: { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)', dot: '#f97316',  label: 'Em andamento' },
  done:        { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)',  dot: '#22c55e',  label: 'Concluído'    },
};

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function Avatar({ src, name, size = 32 }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return <img src={src} onError={() => setErr(true)} alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(255,0,51,0.1)', border: '1px solid rgba(255,0,51,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontSize: size * 0.35, fontWeight: 700, color: '#ff6680',
    }}>
      {initials(name)}
    </div>
  );
}

/* ── Card de cliente — abre popup ao clicar ── */
function ClientCard({ client, onOpenStages, onDelete }) {
  const stages    = client.stages || [];
  const doneCount = stages.filter(s => s.status === 'done').length;
  const progress  = Math.round((doneCount / STAGES_META.length) * 100);

  function getStageStatus(key) {
    const s = stages.find(s => s.stage_key === key);
    return s ? s.status : 'pending';
  }

  return (
    <div
      className="glass-card glass-card-hover"
      onClick={() => onOpenStages(client)}
      style={{ padding: '18px 22px', marginBottom: 8, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11 }}>
        <Avatar src={client.logo_url} name={client.company_name} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {client.company_name}
            </span>
            {client.niche && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                {client.niche}
              </span>
            )}
          </div>
          {client.region && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
              {client.region}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: progress === 100 ? '#22c55e' : 'var(--text-primary)' }}>
              {progress}%
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)' }}>
              {doneCount}/{STAGES_META.length}
            </div>
          </div>
          {/* Botão Info — navega para página do cliente (não propaga click do card) */}
          <Link
            href={`/dashboard/clients/${client.id}`}
            onClick={e => e.stopPropagation()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 6, textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)',
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,0,51,0.25)'; e.currentTarget.style.color = '#ff6680'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Info
          </Link>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2, transition: 'width 0.4s ease', width: `${progress}%`,
          background: progress === 100 ? 'linear-gradient(90deg,#22c55e,#16a34a)' : 'linear-gradient(90deg,#ff0033,#ff6680)',
        }} />
      </div>

      {/* Chips de etapas */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {STAGES_META.map(stage => {
          const status = getStageStatus(stage.key);
          const c      = STATUS_COLORS[status] || STATUS_COLORS.pending;
          return (
            <div key={stage.key} title={stage.label} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 7px', borderRadius: 5,
              background: c.bg, border: `1px solid ${c.border}`,
              fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: c.dot,
            }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
              {`D${stage.index}`}
            </div>
          );
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)' }}>
            {new Date(client.created_at).toLocaleDateString('pt-BR')}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDelete(client.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff1a4d'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            remover
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Popup de etapas do cliente ── */
function ClientStagesPopup({ client, onClose, onStageUpdated }) {
  const [openMeta, setOpenMeta] = useState(null);
  const stages    = client.stages || [];
  const doneCount = stages.filter(s => s.status === 'done').length;
  const progress  = Math.round((doneCount / STAGES_META.length) * 100);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape' && !openMeta) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, openMeta]);

  function getStage(key) { return stages.find(s => s.stage_key === key) || null; }

  const STATUS_CFG = {
    pending:     { label: 'Pendente',     color: '#525252', bg: 'rgba(82,82,82,0.12)',   border: 'rgba(82,82,82,0.3)'   },
    in_progress: { label: 'Em andamento', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
    done:        { label: 'Concluído',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)'  },
  };

  return (
    <>
      {/* Backdrop do popup */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 780,
            background: 'linear-gradient(145deg, rgba(12,12,12,0.99), rgba(6,6,6,0.99))',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, overflow: 'hidden',
          }}
        >
          {/* Header do popup */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar src={client.logo_url} name={client.company_name} size={36} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {client.company_name}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  {doneCount}/{STAGES_META.length} etapas concluídas · {progress}% do pipeline
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link href={`/dashboard/clients/${client.id}?tab=database`} style={{
                padding: '5px 12px', borderRadius: 6, textDecoration: 'none',
                border: '1px solid rgba(255,0,51,0.25)', background: 'rgba(255,0,51,0.06)',
                color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
              }}>
                Ver info completa
              </Link>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Barra de progresso */}
          <div style={{ padding: '12px 22px 0' }}>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, transition: 'width 0.4s ease', width: `${progress}%`,
                background: progress === 100 ? 'linear-gradient(90deg,#22c55e,#16a34a)' : 'linear-gradient(90deg,#ff0033,#ff6680)',
              }} />
            </div>
          </div>

          {/* Grade de etapas */}
          <div style={{ padding: '16px 22px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {STAGES_META.map(meta => {
              const stage  = getStage(meta.key);
              const status = stage?.status || 'pending';
              const c      = STATUS_CFG[status];
              const hasNotes = !!stage?.notes;

              return (
                <div
                  key={meta.key}
                  onClick={() => setOpenMeta(meta)}
                  style={{
                    padding: '13px 15px', borderRadius: 10, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.05)',
                    background: 'rgba(255,255,255,0.02)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,0,51,0.2)'; e.currentTarget.style.background = 'rgba(255,0,51,0.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: status === 'done' ? 'rgba(34,197,94,0.1)' : 'rgba(255,0,51,0.06)',
                        border: status === 'done' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,0,51,0.1)',
                        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
                        color: status === 'done' ? '#22c55e' : '#ff6680',
                      }}>
                        {String(meta.index).padStart(2, '0')}
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {meta.label}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.56rem', fontWeight: 600,
                      padding: '1px 6px', borderRadius: 20,
                      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
                    }}>
                      {c.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: hasNotes ? '#22c55e' : '#525252' }}>
                      {hasNotes ? '● notas' : '○ sem notas'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'rgba(255,102,128,0.5)' }}>
                      Abrir →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stage modal (sobreposto ao popup) */}
      {openMeta && (
        <StageModal
          meta={openMeta}
          stage={getStage(openMeta.key)}
          clientId={client.id}
          onClose={() => setOpenMeta(null)}
          onSaved={(updated) => onStageUpdated(client.id, openMeta.key, updated)}
        />
      )}
    </>
  );
}

/* ── Página ── */
export default function DatabasePage() {
  const [clients,        setClients       ] = useState([]);
  const [loading,        setLoading       ] = useState(true);
  const [error,          setError         ] = useState(null);
  const [search,         setSearch        ] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/clients');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const withStages = await Promise.all(
        json.clients.map(async c => {
          try {
            const r = await fetch(`/api/clients/${c.id}/stages`);
            const j = await r.json();
            return { ...c, stages: j.success ? j.stages : [] };
          } catch { return { ...c, stages: [] }; }
        })
      );
      setClients(withStages);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id) {
    if (!confirm('Remover cliente e etapas?')) return;
    try {
      await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      setClients(p => p.filter(c => c.id !== id));
      if (selectedClient?.id === id) setSelectedClient(null);
    } catch (err) { alert(err.message); }
  }

  function handleStageUpdated(clientId, stageKey, updated) {
    setClients(prev => prev.map(c =>
      c.id !== clientId ? c : {
        ...c,
        stages: c.stages.map(s => s.stage_key === stageKey ? { ...s, ...updated } : s),
      }
    ));
    // Atualiza selectedClient também
    setSelectedClient(prev => {
      if (!prev || prev.id !== clientId) return prev;
      return {
        ...prev,
        stages: prev.stages.map(s => s.stage_key === stageKey ? { ...s, ...updated } : s),
      };
    });
  }

  const filtered = clients.filter(c =>
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.niche?.toLowerCase().includes(search.toLowerCase())
  );

  const totalDone   = clients.reduce((acc, c) => acc + (c.stages || []).filter(s => s.status === 'done').length, 0);
  const totalStages = clients.length * STAGES_META.length;

  return (
    <DashboardLayout activeTab="database">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title">Base de Dados</h1>
            <p className="page-subtitle">Pipeline de marketing — clique em um cliente para ver as etapas</p>
          </div>
          <Link href="/dashboard/form" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', borderRadius: 8,
            background: 'rgba(255,0,51,0.1)', border: '1px solid rgba(255,0,51,0.3)',
            color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
            fontWeight: 600, letterSpacing: '0.04em', textDecoration: 'none',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novo Cliente
          </Link>
        </div>
      </div>

      {/* KPIs */}
      {clients.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Clientes',          value: clients.length,          color: 'var(--text-primary)' },
            { label: 'Etapas Concluídas', value: totalDone,               color: '#22c55e' },
            { label: 'Pendentes',         value: totalStages - totalDone, color: '#f97316' },
          ].map(s => (
            <div key={s.label} className="glass-card" style={{ padding: '12px 16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 2 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Busca */}
      {clients.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <input
            type="text" placeholder="Buscar cliente..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', maxWidth: 340, padding: '7px 12px',
              background: 'rgba(17,17,17,0.8)', border: '1px solid var(--border-default)',
              borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.78rem',
              fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Estados */}
      {loading && (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>// carregando...</span>
        </div>
      )}
      {error && (
        <div className="glass-card" style={{ padding: 18, borderColor: 'rgba(255,26,77,0.3)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ff6680' }}>// erro: {error}</span>
        </div>
      )}
      {!loading && !error && clients.length === 0 && (
        <div className="glass-card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            // nenhum cliente cadastrado
          </div>
          <Link href="/dashboard/form" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#ff6680', textDecoration: 'none', borderBottom: '1px solid rgba(255,102,128,0.3)' }}>
            Cadastrar primeiro cliente →
          </Link>
        </div>
      )}

      {!loading && !error && filtered.map(c => (
        <ClientCard key={c.id} client={c} onOpenStages={setSelectedClient} onDelete={handleDelete} />
      ))}

      {!loading && !error && clients.length > 0 && filtered.length === 0 && (
        <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            // sem resultados para "{search}"
          </span>
        </div>
      )}

      {/* Popup de etapas */}
      {selectedClient && (
        <ClientStagesPopup
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onStageUpdated={handleStageUpdated}
        />
      )}
    </DashboardLayout>
  );
}
