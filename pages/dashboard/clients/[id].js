/**
 * pages/dashboard/clients/[id].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Info Cliente — 7 abas reorganizadas:
 *   Informações · Base de Dados · Afazeres · Anexos · Financeiro · Observações · Respostas
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DashboardLayout from '../../../components/DashboardLayout';
import StageModal from '../../../components/StageModal';

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const TABS = [
  { key: 'info',       label: 'Informações',   icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { key: 'database',   label: 'Base de Dados', icon: 'M4 7h16M4 12h16M4 17h7' },
  { key: 'afazeres',   label: 'Afazeres',      icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { key: 'anexos',     label: 'Anexos',        icon: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' },
  { key: 'financeiro', label: 'Financeiro',    icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { key: 'observacoes',label: 'Observações',   icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' },
  { key: 'respostas',  label: 'Respostas',     icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
];

const STAGES_META = [
  { key: 'diagnosis',   index: 1, label: 'Diagnóstico do Negócio',  desc: 'Base estratégica — dados do formulário + interpretação.' },
  { key: 'competitors', index: 2, label: 'Análise de Concorrentes',  desc: 'Mapeamento de concorrentes e lacunas do mercado.' },
  { key: 'audience',    index: 3, label: 'Público-Alvo',            desc: 'Perfil demográfico, psicográfico e comportamental.' },
  { key: 'avatar',      index: 4, label: 'Construção do Avatar',    desc: 'Avatar completo com dores, desejos e objeções.' },
  { key: 'positioning', index: 5, label: 'Posicionamento da Marca', desc: 'Declaração de posicionamento e vantagem competitiva.' },
  { key: 'offer',       index: 6, label: 'Definição da Oferta',     desc: 'Referências de oferta, anúncios e landing page.' },
];

const STATUS_CFG = {
  pending:     { label: 'Pendente',     color: '#525252', bg: 'rgba(82,82,82,0.12)',   border: 'rgba(82,82,82,0.3)'   },
  in_progress: { label: 'Em andamento', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
  done:        { label: 'Concluído',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)'  },
};

/* ═══════════════════════════════════════════════════════════
   ATOMS
═══════════════════════════════════════════════════════════ */
function Avatar({ src, name, size = 56 }) {
  const [err, setErr] = useState(false);
  const ini = (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  if (src && !err) {
    return (
      <img src={src} onError={() => setErr(true)} alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(255,0,51,0.1)', border: '1px solid rgba(255,0,51,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontSize: Math.round(size * 0.35), fontWeight: 700, color: '#ff6680',
    }}>
      {ini || '?'}
    </div>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
      borderRadius: 20, background: c.bg, border: `1px solid ${c.border}`,
      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase', color: c.color,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.color }} />
      {c.label}
    </span>
  );
}

function TabIcon({ d }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
      letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700,
        color: 'var(--text-secondary)', letterSpacing: '0.04em',
      }}>
        {children}
      </div>
      {action}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '22px 0' }} />;
}

function PlaceholderTab({ label }) {
  return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
        // {label} — em breve
      </div>
    </div>
  );
}

const INP = {
  width: '100%', padding: '8px 11px', boxSizing: 'border-box',
  background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.8rem',
  fontFamily: 'var(--font-mono)', outline: 'none',
};

/* ═══════════════════════════════════════════════════════════
   TAB: INFORMAÇÕES GERAIS
═══════════════════════════════════════════════════════════ */
function TabInfo({ client, onSave }) {
  const [form, setForm] = useState({
    company_name:  client.company_name  || '',
    niche:         client.niche         || '',
    email:         client.email         || '',
    phone:         client.phone         || '',
    avg_ticket:    client.avg_ticket    || '',
    region:        client.region        || '',
    main_product:  client.main_product  || '',
    status:        client.status        || 'active',
    logo_url:      client.logo_url      || '',
  });
  const [links,    setLinks   ] = useState(client.important_links || []);
  const [services, setServices] = useState(client.services        || []);
  const [saving,   setSaving  ] = useState(false);
  const [saved,    setSaved   ] = useState(false);
  const [err,      setErr     ] = useState(null);
  const [uploading,setUploading] = useState(false);
  const fileRef = useRef(null);

  function h(f) { return e => { setForm(p => ({ ...p, [f]: e.target.value })); setSaved(false); }; }

  /* ── Logo upload ── */
  async function handleLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert('Imagem máxima: 3 MB'); return; }
    setUploading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res  = await fetch('/api/clients/upload-logo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, base64, mimeType: file.type }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setForm(p => ({ ...p, logo_url: json.url }));
      setSaved(false);
    } catch (e) { alert('Erro ao fazer upload: ' + e.message); }
    finally { setUploading(false); }
  }

  /* ── Links importantes ── */
  function addLink()           { setLinks(l => [...l, { label: '', url: '' }]); }
  function removeLink(i)       { setLinks(l => l.filter((_, j) => j !== i)); }
  function updateLink(i, f, v) { setLinks(l => l.map((x, j) => j === i ? { ...x, [f]: v } : x)); }

  /* ── Serviços ── */
  function addService()          { setServices(s => [...s, { id: Date.now().toString(), name: '' }]); }
  function removeService(i)      { setServices(s => s.filter((_, j) => j !== i)); }
  function updateService(i, v)   { setServices(s => s.map((x, j) => j === i ? { ...x, name: v } : x)); }

  async function handleSave() {
    setSaving(true); setErr(null);
    try {
      const res  = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, important_links: links, services }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSave(json.client);
      setSaved(true);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 780 }}>

      {/* ── Logo ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
        <Avatar src={form.logo_url} name={form.company_name} size={72} />
        <div>
          <Label>Logo do negócio</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleLogoFile}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '6px 14px', borderRadius: 6, cursor: uploading ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
            }}
          >
            {uploading ? 'Enviando...' : form.logo_url ? 'Trocar logo' : 'Escolher imagem'}
          </button>
          {form.logo_url && (
            <button
              onClick={() => { setForm(p => ({ ...p, logo_url: '' })); setSaved(false); }}
              style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.62rem' }}
            >
              remover
            </button>
          )}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 4 }}>
            JPG, PNG, WEBP · máx 3 MB
          </div>
        </div>
      </div>

      <Divider />

      {/* ── Identificação ── */}
      <SectionTitle>Identificação</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div>
          <Label>Empresa / Marca *</Label>
          <input value={form.company_name} onChange={h('company_name')} style={INP} />
        </div>
        <div>
          <Label>Nicho</Label>
          <input value={form.niche} onChange={h('niche')} placeholder="ex: Fitness, Saúde..." style={INP} />
        </div>
        <div>
          <Label>E-mail</Label>
          <input type="email" value={form.email} onChange={h('email')} placeholder="contato@empresa.com" style={INP} />
        </div>
        <div>
          <Label>Telefone</Label>
          <input value={form.phone} onChange={h('phone')} placeholder="(11) 99999-9999" style={INP} />
        </div>
        <div>
          <Label>Região / Mercado</Label>
          <input value={form.region} onChange={h('region')} placeholder="Brasil, Online..." style={INP} />
        </div>
        <div>
          <Label>Ticket Médio</Label>
          <input value={form.avg_ticket} onChange={h('avg_ticket')} placeholder="R$ 997" style={INP} />
        </div>
      </div>

      <Divider />

      {/* ── Produto / Status ── */}
      <SectionTitle>Produto & Status</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 20 }}>
        <div>
          <Label>Produto / Serviço principal</Label>
          <input value={form.main_product} onChange={h('main_product')} placeholder="Mentoria, Curso, Consultoria..." style={INP} />
        </div>
        <div>
          <Label>Status</Label>
          <select value={form.status} onChange={h('status')} style={{ ...INP, width: 'auto', minWidth: 120 }}>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>
      </div>

      <Divider />

      {/* ── Links importantes ── */}
      <SectionTitle
        action={
          <button onClick={addLink} style={{
            padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
            border: '1px solid rgba(255,0,51,0.2)', background: 'rgba(255,0,51,0.05)',
            color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
          }}>
            + Link
          </button>
        }
      >
        Links Importantes
      </SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {links.length === 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', padding: '12px 0' }}>
            Nenhum link adicionado. Clique em "+ Link" para adicionar.
          </div>
        )}
        {links.map((lk, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="Rótulo (ex: Site, Instagram...)"
              value={lk.label}
              onChange={e => updateLink(i, 'label', e.target.value)}
              style={{ ...INP, flex: '0 0 180px', width: 180 }}
            />
            <input
              placeholder="https://..."
              value={lk.url}
              onChange={e => updateLink(i, 'url', e.target.value)}
              style={{ ...INP, flex: 1 }}
            />
            <button onClick={() => removeLink(i)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
              fontSize: '1rem', padding: '0 4px', flexShrink: 0,
            }}>×</button>
          </div>
        ))}
      </div>

      <Divider />

      {/* ── Serviços Fechados ── */}
      <SectionTitle
        action={
          <button onClick={addService} style={{
            padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
            border: '1px solid rgba(255,0,51,0.2)', background: 'rgba(255,0,51,0.05)',
            color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
          }}>
            + Serviço
          </button>
        }
      >
        Serviços Fechados
      </SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {services.length === 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', padding: '12px 0' }}>
            Nenhum serviço cadastrado.
          </div>
        )}
        {services.map((sv, i) => (
          <div key={sv.id || i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="Nome do serviço..."
              value={sv.name}
              onChange={e => updateService(i, e.target.value)}
              style={{ ...INP, flex: 1 }}
            />
            <button onClick={() => removeService(i)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
              fontSize: '1rem', padding: '0 4px', flexShrink: 0,
            }}>×</button>
          </div>
        ))}
      </div>

      {/* ── Erro + Salvar ── */}
      {err && (
        <div style={{
          padding: '8px 12px', borderRadius: 7, marginBottom: 14,
          background: 'rgba(255,26,77,0.08)', border: '1px solid rgba(255,26,77,0.25)',
          fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#ff6680',
        }}>
          {err}
        </div>
      )}
      <button onClick={handleSave} disabled={saving} style={{
        padding: '9px 24px', borderRadius: 7,
        border: saved ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,0,51,0.3)',
        background: saved ? 'rgba(34,197,94,0.08)' : 'rgba(255,0,51,0.1)',
        color: saved ? '#22c55e' : '#ff6680',
        fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600,
        cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: '0.04em',
      }}>
        {saving ? 'Salvando...' : saved ? '✓ Salvo' : 'Salvar alterações'}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: BASE DE DADOS — grade com as 6 etapas
═══════════════════════════════════════════════════════════ */
function TabDatabase({ client, stages, onStageUpdated }) {
  const [openMeta, setOpenMeta] = useState(null);

  function getStage(key) { return stages.find(s => s.stage_key === key) || null; }

  const doneCount = stages.filter(s => s.status === 'done').length;
  const progress  = Math.round((doneCount / STAGES_META.length) * 100);

  return (
    <div>
      {/* Barra de progresso */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, transition: 'width 0.4s ease',
            width: `${progress}%`,
            background: progress === 100
              ? 'linear-gradient(90deg,#22c55e,#16a34a)'
              : 'linear-gradient(90deg,#ff0033,#ff6680)',
          }} />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          {doneCount}/{STAGES_META.length} · {progress}%
        </span>
      </div>

      {/* Grade */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))', gap: 10 }}>
        {STAGES_META.map(meta => {
          const stage  = getStage(meta.key);
          const status = stage?.status || 'pending';
          const c      = STATUS_CFG[status];
          const hasNotes = !!stage?.notes;

          return (
            <div
              key={meta.key}
              onClick={() => setOpenMeta(meta)}
              className="glass-card glass-card-hover"
              style={{ padding: '15px 17px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{
                    width: 27, height: 27, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: status === 'done' ? 'rgba(34,197,94,0.1)' : 'rgba(255,0,51,0.06)',
                    border: status === 'done' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,0,51,0.12)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700,
                    color: status === 'done' ? '#22c55e' : '#ff6680',
                  }}>
                    {String(meta.index).padStart(2, '0')}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {meta.label}
                  </span>
                </div>
                <StatusBadge status={status} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 9 }}>
                {meta.desc}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: hasNotes ? '#22c55e' : '#525252' }}>
                  {hasNotes ? '● notas salvas' : '○ sem notas'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'rgba(255,102,128,0.5)' }}>
                  Abrir →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {openMeta && (
        <StageModal
          meta={openMeta}
          stage={getStage(openMeta.key)}
          clientId={client.id}
          onClose={() => setOpenMeta(null)}
          onSaved={(updated) => onStageUpdated(openMeta.key, updated)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: ANEXOS
═══════════════════════════════════════════════════════════ */
function TabAnexos({ clientId }) {
  const [attachments, setAttachments] = useState([]);
  const [loading,     setLoading    ] = useState(true);
  const [form,        setForm       ] = useState({ title: '', description: '' });
  const [file,        setFile       ] = useState(null);
  const [uploading,   setUploading  ] = useState(false);
  const [uploadErr,   setUploadErr  ] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/attachments`)
      .then(r => r.json())
      .then(j => { if (j.success) setAttachments(j.attachments); })
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!form.title.trim()) { setUploadErr('Título é obrigatório'); return; }
    if (!file) { setUploadErr('Selecione um arquivo'); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadErr('Arquivo máximo: 10 MB'); return; }
    setUploading(true); setUploadErr(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res  = await fetch(`/api/clients/${clientId}/attachments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, description: form.description, fileName: file.name, base64, mimeType: file.type }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setAttachments(p => [json.attachment, ...p]);
      setForm({ title: '', description: '' });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) { setUploadErr(e.message); }
    finally { setUploading(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Remover este anexo?')) return;
    try {
      await fetch(`/api/clients/${clientId}/attachments?attachmentId=${id}`, { method: 'DELETE' });
      setAttachments(p => p.filter(a => a.id !== id));
    } catch (e) { alert(e.message); }
  }

  function fileIcon(mime = '') {
    if (mime.startsWith('image/')) return '🖼';
    if (mime.includes('pdf'))      return '📄';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    return '📎';
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Formulário de upload */}
      <div className="glass-card" style={{ padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Novo Anexo
        </div>
        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Título *</Label>
              <input value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))}
                placeholder="Ex: Contrato, Briefing..." style={INP} />
            </div>
            <div>
              <Label>Arquivo *</Label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={fileRef} type="file" onChange={e => setFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }} />
                <button type="button" onClick={() => fileRef.current?.click()} style={{
                  flex: 1, padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,10,10,0.8)',
                  color: file ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textAlign: 'left',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {file ? file.name : 'Escolher arquivo...'}
                </button>
                {file && (
                  <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', flexShrink: 0 }}>
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <input value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))}
              placeholder="Breve descrição opcional..." style={INP} />
          </div>
          {uploadErr && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#ff6680' }}>{uploadErr}</div>
          )}
          <div>
            <button type="submit" disabled={uploading} style={{
              padding: '8px 20px', borderRadius: 7, cursor: uploading ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(255,0,51,0.3)', background: 'rgba(255,0,51,0.1)',
              color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
            }}>
              {uploading ? 'Enviando...' : 'Adicionar Anexo'}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de anexos */}
      {loading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Carregando...</div>}
      {!loading && attachments.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', padding: '20px 0' }}>
          Nenhum anexo adicionado.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {attachments.map(a => (
          <div key={a.id} className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: '1.3rem', flexShrink: 0 }}>{fileIcon(a.mime_type)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                {a.title}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>{a.file_name}</span>
                {a.file_size > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>{formatSize(a.file_size)}</span>}
                {a.description && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>— {a.description}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <a href={a.file_url} target="_blank" rel="noopener noreferrer" style={{
                padding: '4px 10px', borderRadius: 5, textDecoration: 'none',
                border: '1px solid rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.06)',
                color: '#60a5fa', fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Abrir
              </a>
              <button onClick={() => handleDelete(a.id)} style={{
                padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                border: '1px solid rgba(255,26,77,0.2)', background: 'rgba(255,26,77,0.05)',
                color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
              }}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: OBSERVAÇÕES — múltiplas com editar/deletar
═══════════════════════════════════════════════════════════ */
function TabObservacoes({ clientId }) {
  const [observations, setObservations] = useState([]);
  const [loading,      setLoading     ] = useState(true);
  const [newText,      setNewText     ] = useState('');
  const [adding,       setAdding      ] = useState(false);
  const [editingId,    setEditingId   ] = useState(null);
  const [editText,     setEditText    ] = useState('');
  const [savingEdit,   setSavingEdit  ] = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/observations`)
      .then(r => r.json())
      .then(j => { if (j.success) setObservations(j.observations); })
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleAdd() {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      const res  = await fetch(`/api/clients/${clientId}/observations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setObservations(p => [json.observation, ...p]);
      setNewText('');
    } catch (e) { alert(e.message); }
    finally { setAdding(false); }
  }

  async function handleEdit(id) {
    if (!editText.trim()) return;
    setSavingEdit(true);
    try {
      const res  = await fetch(`/api/clients/${clientId}/observations`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observationId: id, text: editText }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setObservations(p => p.map(o => o.id === id ? json.observation : o));
      setEditingId(null);
    } catch (e) { alert(e.message); }
    finally { setSavingEdit(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta observação?')) return;
    try {
      await fetch(`/api/clients/${clientId}/observations?observationId=${id}`, { method: 'DELETE' });
      setObservations(p => p.filter(o => o.id !== id));
    } catch (e) { alert(e.message); }
  }

  function startEdit(obs) {
    setEditingId(obs.id);
    setEditText(obs.text);
  }

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Nova observação */}
      <div className="glass-card" style={{ padding: '16px 18px', marginBottom: 18 }}>
        <Label>Nova observação</Label>
        <textarea
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(); }}
          rows={3}
          placeholder="Escreva uma observação... (⌘Enter para salvar)"
          style={{
            ...INP, resize: 'vertical', lineHeight: 1.6, marginBottom: 10,
          }}
        />
        <button onClick={handleAdd} disabled={adding || !newText.trim()} style={{
          padding: '7px 18px', borderRadius: 6, cursor: (adding || !newText.trim()) ? 'not-allowed' : 'pointer',
          border: '1px solid rgba(255,0,51,0.3)', background: 'rgba(255,0,51,0.1)',
          color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
          opacity: !newText.trim() ? 0.5 : 1,
        }}>
          {adding ? 'Salvando...' : 'Adicionar'}
        </button>
      </div>

      {/* Lista */}
      {loading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Carregando...</div>}
      {!loading && observations.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', padding: '12px 0' }}>
          Nenhuma observação ainda.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {observations.map(obs => (
          <div key={obs.id} className="glass-card" style={{ padding: '14px 16px' }}>
            {editingId === obs.id ? (
              <div>
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={3}
                  style={{ ...INP, resize: 'vertical', lineHeight: 1.6, marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleEdit(obs.id)} disabled={savingEdit} style={{
                    padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
                    color: '#22c55e', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                  }}>
                    {savingEdit ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => setEditingId(null)} style={{
                    padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.06)', background: 'transparent',
                    color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                  }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                  {obs.text}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)' }}>
                    {new Date(obs.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {obs.updated_at !== obs.created_at && ' (editado)'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(obs)} style={{
                      padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
                      color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                    }}>
                      Editar
                    </button>
                    <button onClick={() => handleDelete(obs.id)} style={{
                      padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                      border: '1px solid rgba(255,26,77,0.2)', background: 'rgba(255,26,77,0.04)',
                      color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                    }}>
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: FINANCEIRO
═══════════════════════════════════════════════════════════ */
const FREQ_LABELS = {
  monthly:    'Mensal',
  quarterly:  'Trimestral',
  semiannual: 'Semestral',
  annual:     'Anual',
  one_time:   'Pagamento único',
};
const FREQ_OPTS = [
  { value: 'monthly',    label: 'Mensal'           },
  { value: 'quarterly',  label: 'Trimestral'       },
  { value: 'semiannual', label: 'Semestral'        },
  { value: 'annual',     label: 'Anual'            },
  { value: 'one_time',   label: 'Pagamento único'  },
];

function fmtBRL(v) {
  const n = parseFloat(v) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function numInstallments(frequency, periodMonths) {
  const freqMap = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, one_time: 9999 };
  const fm = freqMap[frequency] ?? 1;
  return frequency === 'one_time' ? 1 : Math.ceil(parseInt(periodMonths || 12) / fm);
}

function TabFinanceiro({ clientId }) {
  const [contract,     setContract    ] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [loading,      setLoading     ] = useState(true);
  const [showForm,     setShowForm    ] = useState(false);
  const [saving,       setSaving      ] = useState(false);
  const [form, setForm] = useState({
    contract_value: '', frequency: 'monthly', period_months: '12',
    due_day: '10', start_date: '', notes: '',
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);

  function effectiveStatus(inst) {
    if (inst.status === 'paid') return 'paid';
    if (new Date(inst.due_date) < today) return 'overdue';
    return 'pending';
  }

  const instStatusCfg = {
    paid:    { label: 'Pago',      color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)'  },
    overdue: { label: 'Atrasado',  color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
    pending: { label: 'Pendente',  color: '#525252', bg: 'rgba(82,82,82,0.1)',    border: 'rgba(82,82,82,0.25)'   },
  };

  async function load() {
    setLoading(true);
    try {
      const j = await fetch(`/api/clients/${clientId}/contracts`).then(r => r.json());
      if (j.success) { setContract(j.contract); setInstallments(j.installments || []); }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [clientId]);

  async function handleCreateContract(e) {
    e.preventDefault();
    if (!form.contract_value || !form.start_date) return alert('Valor e data de início são obrigatórios.');
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/contracts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_value: parseFloat(form.contract_value.replace(/[^\d,]/g, '').replace(',', '.')),
          frequency:      form.frequency,
          period_months:  parseInt(form.period_months) || 12,
          due_day:        parseInt(form.due_day) || 10,
          start_date:     form.start_date,
          notes:          form.notes || null,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setContract(j.contract);
      setInstallments(j.installments || []);
      setShowForm(false);
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function toggleInstallment(inst) {
    const newStatus = inst.status === 'paid' ? 'pending' : 'paid';
    try {
      const res = await fetch(`/api/clients/${clientId}/installments`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: inst.id, status: newStatus }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setInstallments(p => p.map(i => i.id === inst.id ? j.installment : i));
    } catch (err) { alert(err.message); }
  }

  function handleValueMask(e) {
    let raw = e.target.value.replace(/\D/g, '');
    if (!raw) { setForm(f => ({ ...f, contract_value: '' })); return; }
    const cents = parseInt(raw);
    const formatted = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setForm(f => ({ ...f, contract_value: formatted }));
  }

  if (loading) return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '40px 0' }}>
      // carregando...
    </div>
  );

  /* ── Info box (sempre visível) ── */
  const InfoBox = () => (
    <div style={{
      padding: '12px 16px', borderRadius: 8, marginBottom: 22,
      background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)',
      maxWidth: 760,
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'rgba(165,180,252,0.75)', lineHeight: 1.75 }}>
        <strong style={{ color: 'rgba(165,180,252,0.95)', display: 'block', marginBottom: 4 }}>ℹ Como funciona o Financeiro</strong>
        Ao criar um contrato, <strong>todas as parcelas são geradas automaticamente</strong> com base na frequência e duração definidas.
        Cada parcela aparece aqui e pode ser marcada como <strong>Pago</strong> individualmente.
        Parcelas com vencimento no passado e ainda não pagas são exibidas como <strong style={{ color: '#f97316' }}>Atrasadas</strong> automaticamente —
        sem necessidade de ação manual. Para um relatório completo de todos os clientes, acesse <strong>Financeiro</strong> no menu lateral.
      </div>
    </div>
  );

  /* ── KPIs ── */
  const totalPaid    = installments.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.value), 0);
  const totalPending = installments.filter(i => i.status !== 'paid').reduce((s, i) => s + parseFloat(i.value), 0);
  const totalContract = contract ? parseFloat(contract.contract_value) : 0;
  const paidCount    = installments.filter(i => i.status === 'paid').length;

  const nextDue = installments
    .filter(i => i.status !== 'paid')
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];

  /* ── Sem contrato ── */
  if (!contract && !showForm) return (
    <div style={{ maxWidth: 760 }}>
      <InfoBox />
      <div className="glass-card" style={{ padding: '36px 28px', textAlign: 'center' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
          <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 20 }}>
          Nenhum contrato cadastrado para este cliente.
        </div>
        <button onClick={() => setShowForm(true)} style={{
          padding: '9px 22px', borderRadius: 7, cursor: 'pointer',
          border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.09)',
          color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
        }}>
          Cadastrar Contrato
        </button>
      </div>
    </div>
  );

  /* ── Formulário de criação ── */
  if (!contract && showForm) {
    const nParc = numInstallments(form.frequency, form.period_months);
    const rawVal = parseFloat(form.contract_value.replace(/\./g, '').replace(',', '.')) || 0;
    const perParc = nParc > 0 ? rawVal / nParc : 0;

    return (
      <div style={{ maxWidth: 760 }}>
        <InfoBox />
        <div className="glass-card" style={{ padding: '22px 24px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>
            Cadastrar Contrato
          </div>
          <form onSubmit={handleCreateContract}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Valor do Contrato (R$)</Label>
                <input value={form.contract_value} onChange={handleValueMask} placeholder="0,00"
                  style={INP} />
              </div>
              <div>
                <Label>Frequência</Label>
                <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                  style={{ ...INP }}>
                  {FREQ_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Período (meses)</Label>
                <input type="number" min="1" max="120" value={form.period_months}
                  onChange={e => setForm(f => ({ ...f, period_months: e.target.value }))}
                  style={INP} disabled={form.frequency === 'one_time'} />
              </div>
              <div>
                <Label>Dia de Vencimento</Label>
                <input type="number" min="1" max="31" value={form.due_day}
                  onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))}
                  style={INP} />
              </div>
              <div>
                <Label>Data de Início</Label>
                <input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  style={INP} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Observações</Label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} style={{ ...INP, resize: 'vertical' }} />
              </div>
            </div>

            {rawVal > 0 && form.start_date && (
              <div style={{
                padding: '10px 14px', marginBottom: 16, borderRadius: 7,
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#22c55e' }}>
                  {nParc}× {fmtBRL(perParc)} = {fmtBRL(rawVal)}
                  {form.frequency !== 'one_time' && ` · vence dia ${form.due_day} · ${FREQ_LABELS[form.frequency]}`}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{
                padding: '8px 20px', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer',
                border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.09)',
                color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
              }}>
                {saving ? 'Salvando...' : 'Salvar Contrato'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{
                padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.06)', background: 'transparent',
                color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ── Contrato existente ── */
  const kpiStyle = {
    card: { padding: '14px 18px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', flex: 1, minWidth: 120 },
    val:  { fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 },
    lbl:  { fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <InfoBox />
      {/* Resumo do contrato */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Contrato Ativo
          </div>
          <span style={{
            padding: '2px 9px', borderRadius: 20, fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            background: contract.status === 'active' ? 'rgba(34,197,94,0.08)' : 'rgba(82,82,82,0.1)',
            border: contract.status === 'active' ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(82,82,82,0.25)',
            color: contract.status === 'active' ? '#22c55e' : '#525252',
          }}>
            {contract.status === 'active' ? 'Ativo' : contract.status === 'completed' ? 'Concluído' : 'Cancelado'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            ['Valor Total',   fmtBRL(contract.contract_value)],
            ['Frequência',    FREQ_LABELS[contract.frequency] || contract.frequency],
            ['Período',       `${contract.period_months} meses`],
            ['Dia Vencimento',`Dia ${contract.due_day}`],
            ['Início',        fmtDate(contract.start_date ? contract.start_date.split('T')[0] : null)],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{l}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
        {contract.notes && (
          <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10 }}>
            {contract.notes}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={kpiStyle.card}>
          <div style={{ ...kpiStyle.val, color: '#22c55e' }}>{fmtBRL(totalPaid)}</div>
          <div style={kpiStyle.lbl}>Total Arrecadado</div>
        </div>
        <div style={kpiStyle.card}>
          <div style={{ ...kpiStyle.val, color: '#f97316' }}>{fmtBRL(totalPending)}</div>
          <div style={kpiStyle.lbl}>A Receber</div>
        </div>
        <div style={kpiStyle.card}>
          <div style={kpiStyle.val}>{fmtBRL(totalContract)}</div>
          <div style={kpiStyle.lbl}>Total Contrato</div>
        </div>
        <div style={kpiStyle.card}>
          <div style={{ ...kpiStyle.val, fontSize: '0.85rem' }}>
            {paidCount}/{installments.length}
          </div>
          <div style={kpiStyle.lbl}>Parcelas Pagas</div>
        </div>
        <div style={kpiStyle.card}>
          <div style={{ ...kpiStyle.val, fontSize: '0.82rem' }}>
            {nextDue ? fmtDate(nextDue.due_date.split('T')[0]) : '—'}
          </div>
          <div style={kpiStyle.lbl}>Próximo Vencimento</div>
        </div>
      </div>

      {/* Tabela de parcelas */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Parcelas
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {['#', 'Vencimento', 'Valor', 'Status', 'Pago em', ''].map(h => (
                  <th key={h} style={{
                    padding: '9px 14px', textAlign: h === '' ? 'right' : 'left',
                    fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {installments.map(inst => {
                const eff = effectiveStatus(inst);
                const cfg = instStatusCfg[eff];
                return (
                  <tr key={inst.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {inst.installment_number}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {fmtDate(inst.due_date.split('T')[0])}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>
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
                        <button onClick={() => toggleInstallment(inst)} style={{
                          padding: '4px 11px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
                          border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
                          color: '#22c55e', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
                        }}>
                          Marcar Pago
                        </button>
                      ) : (
                        <button onClick={() => toggleInstallment(inst)} style={{
                          padding: '4px 11px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
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
          {installments.length === 0 && (
            <div style={{ padding: '24px 18px', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Nenhuma parcela gerada.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════════════════ */
export default function ClientInfoPage() {
  const router       = useRouter();
  const { id }       = router.query;
  const [activeTab,  setActiveTab ] = useState('info');
  const [client,     setClient    ] = useState(null);
  const [stages,     setStages    ] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [error,      setError     ] = useState(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const [cRes, sRes] = await Promise.all([
        fetch(`/api/clients/${id}`),
        fetch(`/api/clients/${id}/stages`),
      ]);
      const cJson = await cRes.json();
      const sJson = await sRes.json();
      if (!cJson.success) throw new Error(cJson.error || 'Cliente não encontrado');
      setClient(cJson.client);
      setStages(sJson.success ? sJson.stages : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function handleStageUpdated(key, updated) {
    setStages(p => p.map(s => s.stage_key === key ? { ...s, ...updated } : s));
  }

  const doneCount = stages.filter(s => s.status === 'done').length;
  const progress  = stages.length > 0 ? Math.round((doneCount / STAGES_META.length) * 100) : 0;

  if (loading) return (
    <DashboardLayout activeTab="clients">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', padding: 40 }}>
        // carregando...
      </div>
    </DashboardLayout>
  );

  if (error) return (
    <DashboardLayout activeTab="clients">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ff6680', padding: 40 }}>
        // erro: {error}
      </div>
    </DashboardLayout>
  );

  if (!client) return null;

  const clientStatus = client.status === 'active' ? 'done' : client.status === 'inactive' ? 'pending' : 'in_progress';

  return (
    <DashboardLayout activeTab="clients">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Link href="/dashboard/clients" style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: 'var(--text-muted)', textDecoration: 'none',
          fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15,18 9,12 15,6" />
          </svg>
          Clientes
        </Link>
        <span style={{ color: '#2a2a2a', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>/</span>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
          {client.company_name}
        </span>
      </div>

      {/* Header do cliente */}
      <div className="glass-card" style={{ padding: '18px 22px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Avatar src={client.logo_url} name={client.company_name} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 3 }}>
              <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {client.company_name}
              </h1>
              <StatusBadge status={clientStatus} />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {client.niche  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{client.niche}</span>}
              {client.region && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{client.region}</span>}
              {client.email  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{client.email}</span>}
              {client.phone  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{client.phone}</span>}
            </div>
          </div>
          {/* Pipeline progress */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: progress === 100 ? '#22c55e' : 'var(--text-primary)' }}>
              {progress}%
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              pipeline
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.04)',
        marginBottom: 24, overflowX: 'auto', gap: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 15px', border: 'none', cursor: 'pointer', background: 'transparent',
                flexShrink: 0,
                borderBottom: active ? '2px solid #ff0033' : '2px solid transparent',
                color: active ? '#ff6680' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: active ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              <TabIcon d={tab.icon} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div>
        {activeTab === 'info'       && <TabInfo client={client} onSave={setClient} />}
        {activeTab === 'database'   && (
          <TabDatabase client={client} stages={stages} onStageUpdated={handleStageUpdated} />
        )}
        {activeTab === 'afazeres'   && <PlaceholderTab label="Afazeres" />}
        {activeTab === 'anexos'     && <TabAnexos clientId={client.id} />}
        {activeTab === 'financeiro' && <TabFinanceiro clientId={client.id} />}
        {activeTab === 'observacoes'&& <TabObservacoes clientId={client.id} />}
        {activeTab === 'respostas'  && <PlaceholderTab label="Respostas" />}
      </div>
    </DashboardLayout>
  );
}
