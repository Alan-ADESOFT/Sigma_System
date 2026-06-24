/**
 * pages/dashboard/atas/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Atas Semanais — documento vivo.
 *   • Lista filtrada por MÊS (data de emissão) — sem pastas.
 *   • Editor: cabeçalho (semana de referência automática) + reuniões da semana
 *     (com botão de adicionar) + afazeres (grid).
 *   • AUTOSAVE: salva sozinho ao editar (sem botão salvar).
 *   • "Distribuir" 1x → afazeres viram tarefas reais; depois, cada novo afazer é
 *     distribuído AUTOMATICAMENTE ao salvar. Status fica ao vivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';
import { useAuth } from '../../../hooks/useAuth';
import ConfirmModal from '../../../components/comercial/ConfirmModal';
import TaskDetailModal from '../../../components/TaskDetailModal';

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
const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function monthLabel(ym) {
  if (!ym || ym === 'all') return 'Todas';
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1] || '?'} ${y}`;
}
function uid() { return 'af_' + Math.random().toString(36).slice(2, 10); }

const STATUS_BADGE = {
  done:        { label: 'Feito',     color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  in_progress: { label: 'Em progr.', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  overdue:     { label: 'Atrasada',  color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  pending:     { label: 'Pendente',  color: '#a3a3a3', bg: 'rgba(163,163,163,0.1)' },
};

const inp = {
  padding: '7px 10px', boxSizing: 'border-box', width: '100%',
  background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem',
  fontFamily: 'var(--font-mono)', outline: 'none',
};
const lbl = { fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' };
const btnGhost = { padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' };
const btnRed = { padding: '7px 14px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(255,0,51,0.35)', background: 'rgba(255,0,51,0.1)', color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600 };
const grpHeader = { fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4, marginBottom: 6 };

/* Cabeçalho de seção no estilo "ata oficial" (00 · IDENTIFICAÇÃO). */
function SectionTitle({ num, children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: '#ff6680', letterSpacing: '0.06em' }}>{num}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,0,51,0.28), rgba(255,255,255,0.04))' }} />
      {right}
    </div>
  );
}

export default function AtasPage() {
  const { user } = useAuth();
  const { notify } = useNotification();

  const [atas, setAtas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM | 'all'

  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [categories, setCategories] = useState([]);

  const [openAta, setOpenAta] = useState(null);
  const [weekMeetings, setWeekMeetings] = useState([]);
  const [distributing, setDistributing] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [structuring, setStructuring] = useState(false);
  const [deletingAta, setDeletingAta] = useState(null);
  const [meetingForm, setMeetingForm] = useState(null);   // null | { title, meeting_date, start_time }
  const [savingState, setSavingState] = useState('idle');  // idle | saving | saved
  const [selectedTaskId, setSelectedTaskId] = useState(null); // afazer distribuído → abre TaskDetailModal

  const dirtyRef = useRef(false);
  const saveTimerRef = useRef(null);
  const savingRef = useRef(false);

  /* ── Loaders ── */
  const loadAtas = useCallback(async () => {
    try { const j = await fetch('/api/atas').then(r => r.json()); if (j.success) setAtas(j.atas || []); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadAtas();
    (async () => {
      try { const j = await fetch('/api/tasks/users-search').then(r => r.json()); if (j.success) setUsers(j.users || []); } catch {}
      try { const j = await fetch('/api/clients').then(r => r.json()); if (j.success) setClients(j.clients || []); } catch {}
      try { const j = await fetch('/api/task-categories').then(r => r.json()); if (j.success) setCategories(j.categories || []); } catch {}
    })();
  }, [loadAtas]);

  const loadWeekMeetings = useCallback(async (week) => {
    if (!week) { setWeekMeetings([]); return; }
    try { const j = await fetch(`/api/atas/week-meetings?week=${week}`).then(r => r.json()); if (j.success) setWeekMeetings(j.meetings || []); } catch {}
  }, []);
  useEffect(() => { loadWeekMeetings(openAta?.reference_week); }, [openAta?.reference_week, loadWeekMeetings]);

  /* ── Filtro por mês (data de emissão = semana de referência) ── */
  const availableMonths = useMemo(() => {
    const set = new Set();
    atas.forEach(a => { const m = String(a.reference_week || a.created_at || '').slice(0, 7); if (m) set.add(m); });
    set.add(new Date().toISOString().slice(0, 7));
    return [...set].sort().reverse();
  }, [atas]);
  const filteredAtas = useMemo(() => {
    if (filterMonth === 'all') return atas;
    return atas.filter(a => String(a.reference_week || a.created_at || '').slice(0, 7) === filterMonth);
  }, [atas, filterMonth]);

  /* ── Ata ops ── */
  async function newAta() {
    const ref = currentMonday();
    const payload = { title: `Ata semanal — ${fmtDate(ref)}`, reference_week: ref, afazeres: [] };
    const j = await fetch('/api/atas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json());
    if (j.success) { await openAtaById(j.ata.id); loadAtas(); } else notify(j.error || 'Erro ao criar', 'error');
  }
  async function openAtaById(id) {
    const j = await fetch(`/api/atas/${id}`).then(r => r.json());
    if (j.success) { dirtyRef.current = false; setSavingState('idle'); setOpenAta(j.ata); }
    else notify(j.error || 'Erro ao abrir', 'error');
  }
  function closeAta() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Save silencioso (sem reabrir/auto-distribuir) pra não perder edição pendente.
    if (dirtyRef.current && openAta) {
      const snap = openAta;
      dirtyRef.current = false;
      fetch(`/api/atas/${snap.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snap) }).catch(() => {});
    }
    setOpenAta(null);
    loadAtas();
  }
  async function confirmDeleteAta() {
    const a = deletingAta;
    if (!a) return;
    const j = await fetch(`/api/atas/${a.id}`, { method: 'DELETE' }).then(r => r.json());
    if (j.success) { notify('Ata excluída', 'success'); setDeletingAta(null); loadAtas(); }
    else notify(j.error || 'Erro ao excluir', 'error');
  }

  /* ── Edição (marca dirty → autosave) ── */
  function touch(updater) { dirtyRef.current = true; setOpenAta(updater); }
  function setField(k, v) { touch(p => ({ ...p, [k]: v })); }
  function updateAfazer(id, patch) { touch(p => ({ ...p, afazeres: (p.afazeres || []).map(a => a.id === id ? { ...a, ...patch } : a) })); }
  function addAfazer() { touch(p => ({ ...p, afazeres: [...(p.afazeres || []), { id: uid(), client_id: null, category_id: null, description: '', assigned_to: null, due_date: null, next_week: false, task_id: null }] })); }
  function removeAfazer(id) { touch(p => ({ ...p, afazeres: (p.afazeres || []).filter(a => a.id !== id) })); }

  /* ── Autosave (debounce) ── */
  useEffect(() => {
    if (!openAta || !dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { persistAta(); }, 900);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAta]);

  async function persistAta() {
    if (savingRef.current) { dirtyRef.current = true; return; } // serializa: um save por vez
    const snap = openAta;
    if (!snap) return;
    savingRef.current = true;
    dirtyRef.current = false;
    setSavingState('saving');
    try {
      const j = await fetch(`/api/atas/${snap.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snap) }).then(r => r.json());
      if (!j.success) throw new Error(j.error);

      // Auto-distribuição: ata já distribuída → novos afazeres viram tarefas sozinhos.
      if (snap.status === 'distributed') {
        const pend = (snap.afazeres || []).filter(a => a.description?.trim() && a.assigned_to && !a.next_week && !a.task_id);
        if (pend.length) {
          const d = await fetch(`/api/atas/${snap.id}/distribute`, { method: 'POST' }).then(r => r.json());
          if (d.success && d.distributed > 0) {
            const fresh = await fetch(`/api/atas/${snap.id}`).then(r => r.json());
            if (fresh.success && !dirtyRef.current) setOpenAta(fresh.ata);
            notify(`${d.distributed} novo(s) afazer(es) distribuído(s) automaticamente`, 'success');
          }
        }
      }
      setSavingState('saved');
      setTimeout(() => setSavingState(s => (s === 'saved' ? 'idle' : s)), 2500);
      loadAtas();
    } catch (e) {
      notify('Erro ao salvar: ' + e.message, 'error');
      setSavingState('idle');
    } finally {
      savingRef.current = false;
      if (dirtyRef.current) {                       // ficou sujo durante o save → reagenda
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(persistAta, 500);
      }
    }
  }

  async function distribute() {
    if (!openAta) return;
    const pend = (openAta.afazeres || []).filter(a => a.description?.trim() && a.assigned_to && !a.next_week && !a.task_id);
    if (pend.length === 0) { notify('Nenhum afazer pra distribuir (precisa de descrição + responsável, e não estar como "próxima semana").', 'warning'); return; }
    setDistributing(true);
    try {
      await fetch(`/api/atas/${openAta.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(openAta) }).then(r => r.json());
      dirtyRef.current = false;
      const j = await fetch(`/api/atas/${openAta.id}/distribute`, { method: 'POST' }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      notify(`${j.distributed} afazer(es) viraram tarefas do time. A partir de agora, novos afazeres são distribuídos sozinhos.`, 'success');
      const fresh = await fetch(`/api/atas/${openAta.id}`).then(r => r.json());
      if (fresh.success) setOpenAta(fresh.ata);
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
      touch(p => ({ ...p, afazeres: [...(p.afazeres || []), ...novos] }));
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
      touch(p => ({ ...p, afazeres: [...(p.afazeres || []), ...novos] }));
      notify(`${novos.length} afazer(es) carregados da semana anterior`, 'success');
    } catch (e) { notify('Erro ao carregar: ' + e.message, 'error'); }
  }

  async function saveMeeting() {
    const f = meetingForm;
    if (!f?.title?.trim() || !f.meeting_date || !f.start_time) { notify('Preencha título, data e horário da reunião', 'warning'); return; }
    try {
      const j = await fetch('/api/meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: f.title.trim(), meeting_date: f.meeting_date, start_time: f.start_time }),
      }).then(r => r.json());
      if (!j.success) throw new Error(j.error);
      notify('Reunião adicionada', 'success');
      setMeetingForm(null);
      loadWeekMeetings(openAta?.reference_week);
    } catch (e) { notify('Erro ao adicionar reunião: ' + e.message, 'error'); }
  }

  const clientName = useCallback((id) => clients.find(c => c.id === id)?.company_name || '', [clients]);

  const groupByClient = useCallback((list) => {
    const map = new Map();
    for (const a of list) {
      const key = a.client_id || '__none';
      if (!map.has(key)) map.set(key, { key, name: a.client_id ? clientName(a.client_id) : 'Internas / Sem cliente', items: [] });
      map.get(key).items.push(a);
    }
    return Array.from(map.values());
  }, [clientName]);
  const thisWeekGroups = useMemo(() => groupByClient((openAta?.afazeres || []).filter(a => !a.next_week)), [openAta, groupByClient]);
  const nextWeekGroups = useMemo(() => groupByClient((openAta?.afazeres || []).filter(a => a.next_week)), [openAta, groupByClient]);
  const nextWeekCount = useMemo(() => (openAta?.afazeres || []).filter(a => a.next_week).length, [openAta]);

  /* Revalida status ao vivo ao voltar o foco (concluir tarefa reflete na ata),
     sem sobrescrever edição não salva. */
  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== 'visible' || !openAta || dirtyRef.current) return;
      fetch(`/api/atas/${openAta.id}`).then(r => r.json()).then(j => {
        if (j.success && !dirtyRef.current) setOpenAta(j.ata);
      }).catch(() => {});
    }
    window.addEventListener('focus', onVis);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('focus', onVis); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAta?.id]);

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>Mês:</span>
              <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ ...inp, width: 'auto' }}>
                <option value="all">Todas</option>
                {availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <button style={btnRed} onClick={newAta}>+ Nova ata</button>
            </div>
          </div>

          {loading ? (
            <div className="glass-card" style={{ padding: 28, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>carregando...</div>
          ) : filteredAtas.length === 0 ? (
            <div className="glass-card" style={{ padding: 36, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {filterMonth === 'all' ? 'Nenhuma ata ainda. Clique em "+ Nova ata" pra começar.' : `Nenhuma ata em ${monthLabel(filterMonth)}. Mude o mês ou crie uma nova.`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredAtas.map(a => {
                const total = a.afazer_count || 0;
                const done = a.afazer_done_count || 0;
                const pct = total ? Math.round((done / total) * 100) : 0;
                return (
                  <div key={a.id} className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => openAtaById(a.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>{a.title}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {a.reference_week && <span>semana de {fmtDate(a.reference_week)}</span>}
                        <span>· {total} afazer(es)</span>
                      </div>
                      {/* Barra de progresso (% concluído) */}
                      {a.status === 'distributed' && total > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, maxWidth: 280 }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e' }} />
                          </div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--text-muted)' }}>{pct}%</span>
                        </div>
                      )}
                    </div>
                    <span style={{ padding: '2px 9px', borderRadius: 20, fontFamily: 'var(--font-mono)', fontSize: '0.56rem', fontWeight: 600, textTransform: 'uppercase',
                      background: a.status === 'distributed' ? 'rgba(34,197,94,0.1)' : 'rgba(163,163,163,0.1)',
                      color: a.status === 'distributed' ? '#22c55e' : '#a3a3a3' }}>
                      {a.status === 'distributed' ? 'Distribuída' : 'Rascunho'}
                    </span>
                    <button style={{ ...btnGhost, padding: '4px 8px', fontSize: '0.58rem' }} onClick={(e) => { e.stopPropagation(); setDeletingAta(a); }}>excluir</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ═══ EDITOR ═══ */
        <div>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button style={btnGhost} onClick={closeAta}>← voltar</button>
            <input value={openAta.title || ''} onChange={e => setField('title', e.target.value)} style={{ ...inp, flex: 1, minWidth: 200, fontSize: '0.9rem', fontWeight: 700 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: savingState === 'saved' ? '#22c55e' : 'var(--text-muted)', minWidth: 64, textAlign: 'center' }}>
              {savingState === 'saving' ? 'salvando...' : savingState === 'saved' ? 'salvo ✓' : ''}
            </span>
            <button style={btnGhost} onClick={() => setPasteOpen(true)}>Colar texto → IA</button>
            <button style={btnGhost} onClick={loadCarryover}>Carregar semana anterior</button>
            {openAta.status !== 'distributed' && (
              <button style={btnRed} onClick={distribute} disabled={distributing}>{distributing ? 'distribuindo...' : 'Distribuir afazeres'}</button>
            )}
          </div>

          {openAta.status === 'distributed' && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 7, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#22c55e' }}>
              ✓ Ata distribuída — novos afazeres com responsável viram tarefas automaticamente ao salvar.
            </div>
          )}

          {/* Colar texto → IA */}
          {pasteOpen && (
            <div className="glass-card" style={{ padding: 12, marginBottom: 14 }}>
              <label style={lbl}>Cole o texto cru dos afazeres — a IA quebra em linhas</label>
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={6} style={{ ...inp, resize: 'vertical' }} placeholder={'Ex:\nBENTIVI\nEditar vídeo - Rodrigo - Quarta\nFollow up - Alan - Segunda'} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={btnRed} onClick={structureFromText} disabled={structuring}>{structuring ? 'estruturando...' : 'Estruturar com IA'}</button>
                <button style={btnGhost} onClick={() => { setPasteOpen(false); setPasteText(''); }}>cancelar</button>
              </div>
            </div>
          )}

          {/* Cabeçalho — semana automática */}
          <div className="glass-card" style={{ padding: '16px 18px', marginBottom: 14 }}>
            <SectionTitle num="00 ·">Identificação</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div><label style={lbl}>Semana de referência (seg)</label>
                <input type="date" value={openAta.reference_week || ''} onChange={e => setField('reference_week', mondayOf(e.target.value))} style={inp} /></div>
              <div><label style={lbl}>Semana Nº</label>
                <input type="number" value={openAta.week_number || ''} onChange={e => setField('week_number', e.target.value ? parseInt(e.target.value) : null)} style={inp} /></div>
              <div><label style={lbl}>Data da reunião</label>
                <input type="date" value={openAta.meeting_date ? String(openAta.meeting_date).split('T')[0] : ''} onChange={e => setField('meeting_date', e.target.value || null)} style={inp} /></div>
            </div>
          </div>

          {/* Reuniões da semana (com botão de adicionar) */}
          <div className="glass-card" style={{ padding: '16px 18px', marginBottom: 14 }}>
            <SectionTitle num="01 ·" right={<button style={btnGhost} onClick={() => setMeetingForm({ title: '', meeting_date: openAta.reference_week || currentMonday(), start_time: '09:00' })}>+ reunião</button>}>Reuniões da semana</SectionTitle>

            {meetingForm && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, padding: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                <input value={meetingForm.title} placeholder="Assunto da reunião" onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))} style={{ ...inp, flex: 1, minWidth: 160 }} />
                <input type="date" value={meetingForm.meeting_date} onChange={e => setMeetingForm(f => ({ ...f, meeting_date: e.target.value }))} style={{ ...inp, width: 150 }} />
                <input type="time" value={meetingForm.start_time} onChange={e => setMeetingForm(f => ({ ...f, start_time: e.target.value }))} style={{ ...inp, width: 110 }} />
                <button style={btnRed} onClick={saveMeeting}>adicionar</button>
                <button style={btnGhost} onClick={() => setMeetingForm(null)}>cancelar</button>
              </div>
            )}

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
          <div className="glass-card" style={{ padding: '16px 18px' }}>
            <SectionTitle num="02 ·" right={<button style={btnGhost} onClick={addAfazer}>+ linha</button>}>Afazeres da semana</SectionTitle>

            {(openAta.afazeres || []).length === 0 ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', padding: '8px 0' }}>Sem afazeres ainda. Adicione linhas, cole texto pra IA estruturar, ou carregue da semana anterior.</div>
            ) : (
              <>
                {thisWeekGroups.length === 0 && nextWeekGroups.length > 0 && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', paddingBottom: 8 }}>Tudo marcado para a próxima semana.</div>
                )}
                {thisWeekGroups.map(g => (
                  <div key={g.key} style={{ marginBottom: 14 }}>
                    <div style={grpHeader}>{g.name} <span style={{ color: 'var(--text-muted)' }}>· {g.items.length}</span></div>
                    {g.items.map(a => (
                      <AfazerRow key={a.id} a={a} users={users} clients={clients}
                        onChange={(patch) => updateAfazer(a.id, patch)} onRemove={() => removeAfazer(a.id)}
                        onOpenTask={a.task_id ? () => setSelectedTaskId(a.task_id) : null} />
                    ))}
                  </div>
                ))}

                {nextWeekGroups.length > 0 && (
                  <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.05)', border: '1px dashed rgba(99,102,241,0.4)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 700, color: '#8b8bf5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      ⏭ Próxima semana <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· {nextWeekCount} — não distribui agora; entra no carryover</span>
                    </div>
                    {nextWeekGroups.map(g => (
                      <div key={g.key} style={{ marginBottom: 10 }}>
                        <div style={grpHeader}>{g.name} <span style={{ color: 'var(--text-muted)' }}>· {g.items.length}</span></div>
                        {g.items.map(a => (
                          <AfazerRow key={a.id} a={a} users={users} clients={clients}
                            onChange={(patch) => updateAfazer(a.id, patch)} onRemove={() => removeAfazer(a.id)}
                            onOpenTask={a.task_id ? () => setSelectedTaskId(a.task_id) : null} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tarefa de um afazer distribuído — edição completa (subtarefas, dependências) */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onRefresh={() => { if (openAta && !dirtyRef.current) openAtaById(openAta.id); loadAtas(); }}
          tenantCategories={categories}
          tenantClients={clients}
          tenantUsers={users}
        />
      )}

      {/* Excluir ata — modal padrão do sistema */}
      <ConfirmModal
        open={!!deletingAta}
        onClose={() => setDeletingAta(null)}
        onConfirm={confirmDeleteAta}
        variant="danger"
        title="Excluir ata"
        warningTitle="Tem certeza que deseja excluir"
        warningHighlight={deletingAta?.title || 'esta ata'}
        warningText="As tarefas já distribuídas continuam — só perdem o vínculo com a ata."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
      />
    </DashboardLayout>
  );
}

/* ── Sub-componente: linha de afazer (com subtarefas expansíveis) ── */
function AfazerRow({ a, users, clients, onChange, onRemove, onOpenTask }) {
  const [expanded, setExpanded] = useState(false);
  const badge = a.task_status ? STATUS_BADGE[a.task_status] : null;
  const subs = Array.isArray(a.subtasks) ? a.subtasks : [];
  const subDone = subs.filter(s => s.done).length;
  const locked = !!a.task_id; // já virou tarefa → subtarefas viram read-only (edita pela tarefa)

  function setSubs(next) { onChange({ subtasks: next }); }
  function addSub() { setSubs([...subs, { title: '', done: false }]); setExpanded(true); }
  function updSub(i, patch) { setSubs(subs.map((s, idx) => idx === i ? { ...s, ...patch } : s)); }
  function rmSub(i) { setSubs(subs.filter((_, idx) => idx !== i)); }

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px 110px 70px 60px 38px 22px', gap: 6, alignItems: 'center', padding: '4px 0' }}>
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
        <button onClick={() => setExpanded(e => !e)} title="Subtarefas" style={{ border: '1px solid rgba(255,255,255,0.1)', background: subs.length ? 'rgba(255,255,255,0.04)' : 'transparent', borderRadius: 5, cursor: 'pointer', color: subs.length ? (a.subtasks_required && subDone < subs.length ? '#f97316' : 'var(--text-secondary)') : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.52rem', padding: '4px 2px', whiteSpace: 'nowrap' }}>
          ☑{subs.length ? ` ${subDone}/${subs.length}` : ''}
        </button>
        <button onClick={onRemove} title="Remover" style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}>×</button>
      </div>

      {expanded && (
        <div style={{ padding: '2px 0 10px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {subs.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!s.done} disabled={locked} onChange={e => updSub(i, { done: e.target.checked })} style={{ accentColor: '#22c55e', flexShrink: 0 }} />
              {locked ? (
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: s.done ? 'var(--text-muted)' : 'var(--text-secondary)', textDecoration: s.done ? 'line-through' : 'none' }}>{s.title}</span>
              ) : (
                <>
                  <input value={s.title || ''} placeholder="Subtarefa" onChange={e => updSub(i, { title: e.target.value })} style={{ ...inp, flex: 1, fontSize: '0.66rem', padding: '5px 8px', textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--text-muted)' : 'var(--text-primary)' }} />
                  <button onClick={() => rmSub(i)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0 }}>×</button>
                </>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2, flexWrap: 'wrap' }}>
            {!locked && <button onClick={addSub} style={{ ...btnGhost, padding: '3px 10px', fontSize: '0.6rem' }}>+ subtarefa</button>}
            {!locked && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: a.subtasks_required ? '#f97316' : 'var(--text-muted)', cursor: 'pointer' }} title="Exige todas as subtarefas concluídas pra finalizar">
                <input type="checkbox" checked={!!a.subtasks_required} onChange={e => onChange({ subtasks_required: e.target.checked })} style={{ accentColor: '#f97316' }} /> obrigatórias
              </label>
            )}
            {locked && a.subtasks_required && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#f97316' }}>obrigatórias</span>}
            {locked && subs.length === 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)' }}>Sem subtarefas — edite pela tarefa.</span>}
            {onOpenTask && (
              <button onClick={onOpenTask} style={{ ...btnGhost, padding: '3px 10px', fontSize: '0.6rem', marginLeft: 'auto', color: '#ff6680', borderColor: 'rgba(255,0,51,0.25)' }}>{locked ? 'editar pela tarefa →' : 'abrir tarefa (dependências…) →'}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
