/**
 * pages/dashboard/atas/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Atas Semanais — documento vivo.
 *   • Pastas (esquerda) organizam as atas.
 *   • Lista de atas da pasta selecionada.
 *   • Editor: cabeçalho + reuniões da semana (auto) + afazeres (grid).
 *   • "Distribuir" → afazeres viram tarefas reais do time; status fica AO VIVO.
 *   • Atalhos: colar texto → IA estrutura, carregar afazeres da semana anterior.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';
import { useAuth } from '../../../hooks/useAuth';

/* ── Helpers ── */
function mondayOf(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return '';
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function currentMonday() { return mondayOf(new Date().toISOString().slice(0, 10)); }
function fmtDate(d) {
  if (!d) return '';
  const s = String(d).split('T')[0];
  const [y, m, day] = s.split('-');
  return `${day}/${m}`;
}
function uid() { return 'af_' + Math.random().toString(36).slice(2, 10); }

const STATUS_BADGE = {
  done:        { label: 'Feito',     color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  in_progress: { label: 'Em progr.', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  overdue:     { label: 'Atrasada',  color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  pending:     { label: 'Pendente',  color: '#a3a3a3', bg: 'rgba(163,163,163,0.1)' },
};

const COLORS = ['#6366F1', '#ff0033', '#f97316', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899', '#facc15'];

const inp = {
  padding: '7px 10px', boxSizing: 'border-box', width: '100%',
  background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem',
  fontFamily: 'var(--font-mono)', outline: 'none',
};
const lbl = { fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' };
const btnGhost = { padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' };
const btnRed = { padding: '7px 14px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.1)', color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600 };

export default function AtasPage() {
  const { user } = useAuth();
  const { notify } = useNotification();

  const [folders, setFolders] = useState([]);
  const [atas, setAtas] = useState([]);
  const [activeFolder, setActiveFolder] = useState('all'); // 'all' | 'none' | folderId
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [categories, setCategories] = useState([]);

  const [openAta, setOpenAta] = useState(null); // a ata completa em edição
  const [weekMeetings, setWeekMeetings] = useState([]);
  const [saving, setSaving] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [structuring, setStructuring] = useState(false);

  /* ── Loaders ── */
  const loadFolders = useCallback(async () => {
    try { const j = await fetch('/api/ata-folders').then(r => r.json()); if (j.success) setFolders(j.folders || []); } catch {}
  }, []);
  const loadAtas = useCallback(async () => {
    try {
      const q = activeFolder === 'all' ? '' : `?folderId=${activeFolder}`;
      const j = await fetch(`/api/atas${q}`).then(r => r.json());
      if (j.success) setAtas(j.atas || []);
    } catch {} finally { setLoading(false); }
  }, [activeFolder]);

  useEffect(() => {
    loadFolders();
    (async () => {
      try { const j = await fetch('/api/tasks/users-search').then(r => r.json()); if (j.success) setUsers(j.users || []); } catch {}
      try { const j = await fetch('/api/clients').then(r => r.json()); if (j.success) setClients(j.clients || []); } catch {}
      try { const j = await fetch('/api/task-categories').then(r => r.json()); if (j.success) setCategories(j.categories || []); } catch {}
    })();
  }, [loadFolders]);
  useEffect(() => { loadAtas(); }, [loadAtas]);

  // reuniões da semana quando abre uma ata com reference_week
  useEffect(() => {
    if (!openAta?.reference_week) { setWeekMeetings([]); return; }
    fetch(`/api/atas/week-meetings?week=${openAta.reference_week}`).then(r => r.json())
      .then(j => { if (j.success) setWeekMeetings(j.meetings || []); }).catch(() => {});
  }, [openAta?.reference_week]);

  /* ── Folder ops ── */
  async function createFolder() {
    const name = prompt('Nome da pasta (ex: Junho 2026):');
    if (!name || !name.trim()) return;
    const color = COLORS[folders.length % COLORS.length];
    const j = await fetch('/api/ata-folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), color }) }).then(r => r.json());
    if (j.success) { notify('Pasta criada', 'success'); loadFolders(); } else notify(j.error || 'Erro', 'error');
  }
  async function deleteFolder(f) {
    if (!confirm(`Excluir a pasta "${f.name}"? As atas dentro dela ficam sem pasta.`)) return;
    const j = await fetch(`/api/ata-folders/${f.id}`, { method: 'DELETE' }).then(r => r.json());
    if (j.success) { notify('Pasta excluída', 'success'); if (activeFolder === f.id) setActiveFolder('all'); loadFolders(); loadAtas(); }
  }

  /* ── Ata ops ── */
  async function newAta() {
    const ref = currentMonday();
    const payload = {
      title: `Ata semanal — ${fmtDate(ref)}`,
      reference_week: ref,
      folder_id: (activeFolder !== 'all' && activeFolder !== 'none') ? activeFolder : null,
      afazeres: [],
    };
    const j = await fetch('/api/atas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json());
    if (j.success) { await openAtaById(j.ata.id); loadAtas(); } else notify(j.error || 'Erro ao criar', 'error');
  }
  async function openAtaById(id) {
    const j = await fetch(`/api/atas/${id}`).then(r => r.json());
    if (j.success) setOpenAta(j.ata);
    else notify(j.error || 'Erro ao abrir', 'error');
  }
  async function deleteAta(a) {
    if (!confirm(`Excluir a ata "${a.title}"? As tarefas já distribuídas continuam (só perdem o vínculo com a ata).`)) return;
    const j = await fetch(`/api/atas/${a.id}`, { method: 'DELETE' }).then(r => r.json());
    if (j.success) { notify('Ata excluída', 'success'); loadAtas(); }
  }

  function setField(k, v) { setOpenAta(p => ({ ...p, [k]: v })); }
  function updateAfazer(id, patch) { setOpenAta(p => ({ ...p, afazeres: p.afazeres.map(a => a.id === id ? { ...a, ...patch } : a) })); }
  function addAfazer() { setOpenAta(p => ({ ...p, afazeres: [...(p.afazeres || []), { id: uid(), client_id: null, category_id: null, description: '', assigned_to: null, due_date: null, next_week: false, task_id: null }] })); }
  function removeAfazer(id) { setOpenAta(p => ({ ...p, afazeres: p.afazeres.filter(a => a.id !== id) })); }

  async function saveAta(silent) {
    if (!openAta) return;
    setSaving(true);
    try {
      const j = await fetch(`/api/atas/${openAta.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(openAta) }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      setOpenAta(o => ({ ...o, ...j.ata, afazeres: o.afazeres })); // preserva afazeres locais (com task_status)
      if (!silent) notify('Ata salva', 'success');
      loadAtas();
    } catch (e) { notify('Erro ao salvar: ' + e.message, 'error'); } finally { setSaving(false); }
  }

  async function distribute() {
    if (!openAta) return;
    const pend = (openAta.afazeres || []).filter(a => a.description?.trim() && a.assigned_to && !a.next_week && !a.task_id);
    if (pend.length === 0) { notify('Nenhum afazer novo pra distribuir (precisa de descrição + responsável, e não estar como "próxima semana").', 'warning'); return; }
    if (!confirm(`Distribuir ${pend.length} afazer(es) como tarefas reais do time?`)) return;
    setDistributing(true);
    try {
      await saveAta(true); // garante que o rascunho está salvo
      const j = await fetch(`/api/atas/${openAta.id}/distribute`, { method: 'POST' }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      notify(`${j.distributed} afazer(es) viraram tarefas do time`, 'success');
      await openAtaById(openAta.id); // recarrega com status ao vivo
      loadAtas();
    } catch (e) { notify('Erro ao distribuir: ' + e.message, 'error'); } finally { setDistributing(false); }
  }

  async function structureFromText() {
    if (!pasteText.trim()) return;
    setStructuring(true);
    try {
      const j = await fetch('/api/atas/structure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: pasteText, referenceWeek: openAta?.reference_week }) }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      const novos = (j.afazeres || []).map(a => ({ ...a, id: uid(), task_id: null }));
      setOpenAta(p => ({ ...p, afazeres: [...(p.afazeres || []), ...novos] }));
      notify(`${novos.length} afazer(es) estruturados pela IA`, 'success');
      if (j.warnings?.length) notify(`${j.warnings.length} aviso(s) da IA — confira os responsáveis`, 'info');
      setPasteOpen(false); setPasteText('');
    } catch (e) { notify('Erro na IA: ' + e.message, 'error'); } finally { setStructuring(false); }
  }

  async function loadCarryover() {
    try {
      const j = await fetch('/api/atas/carryover').then(r => r.json());
      if (!j.success) throw new Error(j.error);
      if (!j.afazeres?.length) { notify('Nada em aberto na semana anterior', 'info'); return; }
      const novos = j.afazeres.map(a => ({ ...a, id: uid(), task_id: null }));
      setOpenAta(p => ({ ...p, afazeres: [...(p.afazeres || []), ...novos] }));
      notify(`${novos.length} afazer(es) carregados da semana anterior`, 'success');
    } catch (e) { notify('Erro ao carregar: ' + e.message, 'error'); }
  }

  const clientName = useCallback((id) => clients.find(c => c.id === id)?.company_name || '', [clients]);

  /* ── Render: lista de afazeres agrupada por cliente (no editor) ── */
  const afazerGroups = useMemo(() => {
    if (!openAta) return [];
    const map = new Map();
    for (const a of (openAta.afazeres || [])) {
      const key = a.client_id || '__none';
      if (!map.has(key)) map.set(key, { key, name: a.client_id ? clientName(a.client_id) : 'Internas / Sem cliente', items: [] });
      map.get(key).items.push(a);
    }
    return Array.from(map.values());
  }, [openAta, clientName]);

  return (
    <DashboardLayout activeTab="atas">
      {!openAta ? (
        /* ═══ LISTA ═══ */
        <div>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 className="page-title">Atas Semanais</h1>
              <p className="page-subtitle">Crie a ata, os afazeres viram tarefas do time e o status aparece sozinho.</p>
            </div>
            <button style={btnRed} onClick={newAta}>+ Nova ata</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
            {/* Pastas */}
            <div className="glass-card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={lbl}>Pastas</span>
                <button style={{ ...btnGhost, padding: '2px 8px', fontSize: '0.6rem' }} onClick={createFolder}>+ nova</button>
              </div>
              {[{ id: 'all', name: 'Todas', color: '#737373' }, { id: 'none', name: 'Sem pasta', color: '#525252' }].map(f => (
                <FolderRow key={f.id} f={f} active={activeFolder === f.id} onClick={() => setActiveFolder(f.id)} />
              ))}
              {folders.map(f => (
                <FolderRow key={f.id} f={f} active={activeFolder === f.id} onClick={() => setActiveFolder(f.id)} onDelete={() => deleteFolder(f)} count={f.ata_count} />
              ))}
            </div>

            {/* Lista de atas */}
            <div>
              {loading ? (
                <div className="glass-card" style={{ padding: 28, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>carregando...</div>
              ) : atas.length === 0 ? (
                <div className="glass-card" style={{ padding: 36, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Nenhuma ata aqui. Clique em "+ Nova ata" pra começar.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {atas.map(a => (
                    <div key={a.id} className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => openAtaById(a.id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>{a.title}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {a.reference_week && <span>semana de {fmtDate(a.reference_week)}</span>}
                          <span>· {a.afazer_count || 0} afazer(es)</span>
                          {a.folder_name && <span>· {a.folder_name}</span>}
                        </div>
                      </div>
                      <span style={{ padding: '2px 9px', borderRadius: 20, fontFamily: 'var(--font-mono)', fontSize: '0.56rem', fontWeight: 600, textTransform: 'uppercase',
                        background: a.status === 'distributed' ? 'rgba(34,197,94,0.1)' : 'rgba(163,163,163,0.1)',
                        color: a.status === 'distributed' ? '#22c55e' : '#a3a3a3' }}>
                        {a.status === 'distributed' ? 'Distribuída' : 'Rascunho'}
                      </span>
                      <button style={{ ...btnGhost, padding: '4px 8px', fontSize: '0.58rem' }} onClick={(e) => { e.stopPropagation(); deleteAta(a); }}>excluir</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ═══ EDITOR ═══ */
        <div>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button style={btnGhost} onClick={() => { setOpenAta(null); loadAtas(); }}>← voltar</button>
            <input value={openAta.title || ''} onChange={e => setField('title', e.target.value)} style={{ ...inp, flex: 1, minWidth: 200, fontSize: '0.9rem', fontWeight: 700 }} />
            <button style={btnGhost} onClick={() => saveAta(false)} disabled={saving}>{saving ? 'salvando...' : 'Salvar'}</button>
            <button style={btnRed} onClick={distribute} disabled={distributing}>{distributing ? 'distribuindo...' : 'Distribuir afazeres'}</button>
          </div>

          {/* Cabeçalho */}
          <div className="glass-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div><label style={lbl}>Semana de referência (seg)</label>
                <input type="date" value={openAta.reference_week || ''} onChange={e => setField('reference_week', mondayOf(e.target.value))} style={inp} /></div>
              <div><label style={lbl}>Semana Nº</label>
                <input type="number" value={openAta.week_number || ''} onChange={e => setField('week_number', e.target.value ? parseInt(e.target.value) : null)} style={inp} /></div>
              <div><label style={lbl}>Data da reunião</label>
                <input type="date" value={openAta.meeting_date ? String(openAta.meeting_date).split('T')[0] : ''} onChange={e => setField('meeting_date', e.target.value || null)} style={inp} /></div>
              <div><label style={lbl}>Hora</label>
                <input value={openAta.meeting_time || ''} placeholder="14h30" onChange={e => setField('meeting_time', e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Responsável</label>
                <input value={openAta.responsible || ''} onChange={e => setField('responsible', e.target.value)} style={inp} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Participantes (separados por vírgula)</label>
                <input value={(openAta.participants || []).join(', ')} onChange={e => setField('participants', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} style={inp} /></div>
            </div>
          </div>

          {/* Reuniões da semana (auto) */}
          <div className="glass-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Reuniões da semana <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(do Calendário)</span></div>
            {weekMeetings.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Nenhuma reunião cadastrada nessa semana.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {weekMeetings.map(m => (
                  <div key={m.id} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                    {fmtDate(m.meeting_date)} {String(m.start_time || '').slice(0, 5)} · <b>{m.title}</b>{m.client_name ? ` · ${m.client_name}` : ''}{(m.participants || []).length ? ` · ${(m.participants || []).join(', ')}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Afazeres */}
          <div className="glass-card" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Afazeres da semana</div>
              <button style={btnGhost} onClick={addAfazer}>+ linha</button>
              <button style={btnGhost} onClick={() => setPasteOpen(true)}>Colar texto → IA</button>
              <button style={btnGhost} onClick={loadCarryover}>Carregar semana anterior</button>
            </div>

            {pasteOpen && (
              <div style={{ marginBottom: 12, padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                <label style={lbl}>Cole o texto cru dos afazeres (como você escreve hoje) — a IA quebra em linhas</label>
                <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={6} style={{ ...inp, resize: 'vertical' }} placeholder={'Ex:\nBENTIVI\nEditar vídeo - Rodrigo - Quarta\nFollow up - Alan - Segunda'} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={btnRed} onClick={structureFromText} disabled={structuring}>{structuring ? 'estruturando...' : 'Estruturar com IA'}</button>
                  <button style={btnGhost} onClick={() => { setPasteOpen(false); setPasteText(''); }}>cancelar</button>
                </div>
              </div>
            )}

            {(openAta.afazeres || []).length === 0 ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', padding: '8px 0' }}>Sem afazeres ainda. Adicione linhas, cole texto pra IA estruturar, ou carregue da semana anterior.</div>
            ) : (
              afazerGroups.map(g => (
                <div key={g.key} style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4, marginBottom: 6 }}>
                    {g.name} <span style={{ color: 'var(--text-muted)' }}>· {g.items.length}</span>
                  </div>
                  {g.items.map(a => (
                    <AfazerRow key={a.id} a={a} users={users} clients={clients}
                      onChange={(patch) => updateAfazer(a.id, patch)} onRemove={() => removeAfazer(a.id)} />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

/* ── Sub-componentes ── */
function FolderRow({ f, active, onClick, onDelete, count }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: active ? 'rgba(255,0,51,0.06)' : 'transparent', marginBottom: 2 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color || '#737373', flexShrink: 0 }} />
      <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: active ? '#ff6680' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
      {count != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--text-muted)' }}>{count}</span>}
      {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1 }}>×</button>}
    </div>
  );
}

function AfazerRow({ a, users, clients, onChange, onRemove }) {
  const badge = a.task_status ? STATUS_BADGE[a.task_status] : null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px 110px 80px 70px 24px', gap: 6, alignItems: 'center', padding: '4px 0' }}>
      <input value={a.description || ''} placeholder="Descrição do afazer" onChange={e => onChange({ description: e.target.value })} style={inp} />
      <select value={a.client_id || ''} onChange={e => onChange({ client_id: e.target.value || null })} style={inp}>
        <option value="">Sem cliente</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
      </select>
      <select value={a.assigned_to || ''} onChange={e => onChange({ assigned_to: e.target.value || null })} style={inp}>
        <option value="">Responsável</option>
        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <input type="date" value={a.due_date ? String(a.due_date).split('T')[0] : ''} onChange={e => onChange({ due_date: e.target.value || null })} style={inp} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--text-muted)', cursor: 'pointer' }} title="Próxima semana (não distribui agora; entra no carryover)">
        <input type="checkbox" checked={!!a.next_week} onChange={e => onChange({ next_week: e.target.checked })} style={{ accentColor: 'var(--brand-500)' }} /> próx.
      </label>
      <div style={{ textAlign: 'center' }}>
        {badge ? (
          <span style={{ padding: '2px 6px', borderRadius: 12, fontFamily: 'var(--font-mono)', fontSize: '0.5rem', fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.label}</span>
        ) : a.task_id ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)' }}>—</span>
        ) : (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)' }} title="Vira tarefa ao distribuir">novo</span>
        )}
      </div>
      <button onClick={onRemove} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}>×</button>
    </div>
  );
}
