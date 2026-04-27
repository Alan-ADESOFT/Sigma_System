/**
 * components/comercial/LeadDetailModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal full-screen de detalhes do lead (ClickUp-style, refinado).
 *
 * Layout:
 *   · Topbar slim: breadcrumb + ações (▶ próxima coluna, ✓ ganho, ✕ perdido)
 *   · Main: título + AI bar + INFORMAÇÕES + LINKS + NOTAS
 *   · Sidebar direita: SOMENTE timeline de atividade (read-only,
 *     sem comment box, sem header de ações).
 *
 * Atalhos:
 *   · Esc → fecha
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from '../../assets/style/leadDetailModal.module.css';
import { useNotification } from '../../context/NotificationContext';
import AIStreamDrawer from './AIStreamDrawer';
import LeadActivityTimeline from './LeadActivityTimeline';
import LeadWhatsAppModal from './LeadWhatsAppModal';
import WonContractModal from './WonContractModal';
import LostLeadModal from './LostLeadModal';
import ConfirmModal, { PromptModal } from './ConfirmModal';
import NotesField from './NotesField';
import { useAuth } from '../../hooks/useAuth';
import { validateUrl, normalizeUrl, maskPhoneBR, unmaskPhone, validatePhoneBR, validateEmail, validateUF, UFS } from './inputMasks';

const ANALYSIS_PHASES = [
  { key: 'context_gathering', label: 'Coletando contexto' },
  { key: 'web_search',        label: 'Pesquisando na web' },
  { key: 'site_scrape',       label: 'Lendo o site' },
  { key: 'meta_ads_check',    label: 'Verificando anúncios' },
  { key: 'generating',        label: 'Gerando análise' },
];

/* ─── Helpers ───────────────────────────────────────────────── */
function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000)    return 'agora';
  if (ms < 3600000)  return `há ${Math.floor(ms / 60000)} min`;
  if (ms < 86400000) return `há ${Math.floor(ms / 3600000)}h`;
  return `há ${Math.floor(ms / 86400000)}d`;
}
function shortUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`);
    return url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '');
  } catch { return u; }
}
function ensureProtocol(u) {
  if (!u) return '#';
  return u.startsWith('http') ? u : `https://${u}`;
}
function fmtPhone(raw) {
  if (!raw) return '—';
  const masked = maskPhoneBR(raw);
  return masked || raw;
}

/* ─── Ícones SVG ────────────────────────────────────────────── */
const ICON = {
  email: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  phone: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  globe: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  insta: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>,
  pin:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  niche: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  star:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  link:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  note:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  copy:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  external: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  trash: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/></svg>,
  whatsapp: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
  ai:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15 9 22 9 16 14 18 21 12 17 6 21 8 14 2 9 9 9 12 2"/></svg>,
};

/* ─── Componente ────────────────────────────────────────────── */
export default function LeadDetailModal({ leadId, columns, onClose, onSaved }) {
  const { notify } = useNotification();
  const { user } = useAuth();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showStatusDD, setShowStatusDD] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const notesTimerRef = useRef(null);
  const statusDropdownRef = useRef(null);

  // Análise IA
  const [analysisOpen, setAnalysisOpen]     = useState(false);
  const [analysisJobId, setAnalysisJobId]   = useState(null);
  const [analysisRunning, setAnalysisRunning] = useState(false); // jobLock check
  const [latestAnalysis, setLatestAnalysis] = useState(null);

  // Modais
  const [activities, setActivities] = useState([]);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [showWon, setShowWon]           = useState(false);
  const [showLost, setShowLost]         = useState(false);
  const [pendingDeleteAct, setPendingDeleteAct] = useState(null);
  const [linkStep, setLinkStep] = useState(null);
  const [pendingLinkUrl, setPendingLinkUrl] = useState('');
  // Auto-plan: pergunta após fechar contrato se quer gerar planejamento
  const [autoPlanPrompt, setAutoPlanPrompt] = useState(null); // { clientId } | null
  const [autoPlanLoading, setAutoPlanLoading] = useState(false);

  const streamUrl = useCallback(
    (jobId) => `/api/comercial/pipeline/leads/${leadId}/analyze-stream?jobId=${encodeURIComponent(jobId)}`,
    [leadId]
  );

  /* ─── Loaders ─────────────────────────────────────────── */
  const fetchActivities = useCallback(() => {
    if (!leadId) return;
    fetch(`/api/comercial/pipeline/leads/${leadId}/activities`)
      .then(r => r.json())
      .then(j => { if (j.success) setActivities(j.activities); })
      .catch(() => {});
  }, [leadId]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  // Carrega lead + cache de análise + check de job rodando
  useEffect(() => {
    if (!leadId) return;
    let mounted = true;
    setLoading(true);

    Promise.all([
      fetch(`/api/comercial/pipeline/leads/${leadId}`).then(r => r.json()),
      fetch(`/api/comercial/pipeline/leads/${leadId}/analyses`).then(r => r.json()),
      fetch(`/api/comercial/pipeline/leads/${leadId}/analyze-status`).then(r => r.json()).catch(() => ({})),
    ]).then(([leadJson, analysesJson, statusJson]) => {
      if (!mounted) return;
      if (leadJson.success) {
        setLead(leadJson.lead);
        setNotes(leadJson.lead?.notes || '');
      } else {
        notify(leadJson.error || 'Falha ao carregar lead', 'error');
      }
      if (analysesJson?.success && analysesJson.latest) setLatestAnalysis(analysesJson.latest);
      // Se já tem job rodando, reabre drawer no estado streaming
      if (statusJson?.success && statusJson.running && statusJson.jobId) {
        setAnalysisJobId(statusJson.jobId);
        setAnalysisOpen(true);
        setAnalysisRunning(true);
      }
    }).catch(err => {
      if (mounted) notify(err.message, 'error');
    }).finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, [leadId, notify]);

  // Esc fecha
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Click-outside dropdown status
  useEffect(() => {
    function onClick(e) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) {
        setShowStatusDD(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Auto-save notes
  useEffect(() => {
    if (!lead || notes === (lead.notes || '')) return;
    setSavingNotes(true);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/comercial/pipeline/leads/${leadId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Falha ao salvar');
        setLead(prev => prev ? { ...prev, notes } : prev);
        onSaved?.();
      } catch (err) {
        notify(err.message, 'error');
      } finally {
        setSavingNotes(false);
      }
    }, 1000);
    return () => clearTimeout(notesTimerRef.current);
  }, [notes, lead, leadId, notify, onSaved]);

  /* ─── Actions ────────────────────────────────────────── */

  async function patchLead(patch) {
    try {
      const res = await fetch(`/api/comercial/pipeline/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha');
      setLead(json.lead);
      onSaved?.();
    } catch (err) { notify(err.message, 'error'); }
  }

  async function moveColumn(columnId) {
    try {
      const res = await fetch(`/api/comercial/pipeline/leads/${leadId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha');
      setLead(prev => prev ? { ...prev, ...json.lead } : json.lead);
      fetchActivities();
      onSaved?.();
      setShowStatusDD(false);
    } catch (err) { notify(err.message, 'error'); }
  }

  /**
   * Click no AI bar: se já existe análise, apenas abre o drawer com o cache.
   * Se não existe (e não está rodando), dispara nova análise.
   * Análise é one-shot por lead — não disponibilizamos "regerar" depois.
   */
  function handleAiBarClick() {
    if (analysisRunning) {
      // Já tem job rodando — só reabre o drawer pra ver progresso
      setAnalysisOpen(true);
      return;
    }
    if (latestAnalysis) {
      // Já tem análise gerada — abre drawer mostrando cache (sem disparar nova)
      setAnalysisJobId(null);
      setAnalysisOpen(true);
      return;
    }
    // Primeira vez para este lead — dispara
    startAnalysis();
  }

  async function startAnalysis() {
    if (analysisRunning) {
      notify('Já existe uma análise rodando para este lead', 'warning');
      setAnalysisOpen(true);
      return;
    }
    setAnalysisJobId(null);
    setAnalysisOpen(true);
    setAnalysisRunning(true);
    try {
      const res = await fetch(`/api/comercial/pipeline/leads/${leadId}/analyze`, { method: 'POST' });
      const j = await res.json();
      if (res.status === 409) {
        notify('Já existe uma análise rodando para este lead', 'warning');
        if (j.existingJobId) setAnalysisJobId(j.existingJobId);
        return;
      }
      if (res.status === 429) {
        notify(j.error || 'Limite atingido', 'warning');
        setAnalysisOpen(false);
        setAnalysisRunning(false);
        return;
      }
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      setAnalysisJobId(j.jobId);
    } catch (err) {
      notify(err.message, 'error');
      setAnalysisOpen(false);
      setAnalysisRunning(false);
    }
  }

  async function handleAnalysisDone(data) {
    setLatestAnalysis({
      analysis_text: data.fullText,
      sigma_score:   data.sigmaScore,
      sources_used:  data.sourcesUsed,
      created_at:    new Date().toISOString(),
    });
    setAnalysisRunning(false);
    notify('Análise IA concluída — clique em "Importar para notas" para salvar', 'success', { duration: 5500 });
    onSaved?.();
    fetchActivities();
  }

  /**
   * Importa o markdown da análise para o campo Notas (prepend com separador).
   * Preserva formatação (## títulos, **negrito**, *itálico*, listas, links).
   */
  async function importAnalysisToNotes() {
    const fullText = latestAnalysis?.analysis_text;
    if (!fullText || !fullText.trim()) {
      notify('Nenhuma análise disponível pra importar', 'warning');
      return;
    }
    const existingNotes = (lead?.notes || '').trim();
    const stamp = new Date().toLocaleDateString('pt-BR');
    const block = `# Análise IA — ${stamp}\n\n${fullText.trim()}`;
    const newNotes = existingNotes
      ? `${block}\n\n---\n\n${existingNotes}`
      : block;

    setNotes(newNotes);
    try {
      const res = await fetch(`/api/comercial/pipeline/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha ao salvar notas');
      setLead(prev => prev ? { ...prev, notes: newNotes } : prev);
      notify('Análise importada para as notas', 'success');
      setAnalysisOpen(false);
      onSaved?.();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  function handleAnalysisError(msg) {
    setAnalysisRunning(false);
    notify(`Análise falhou: ${msg}`, 'error');
  }

  function handleAnalysisMinimize() {
    // Drawer fecha mas worker continua rodando — toast informativo
    setAnalysisOpen(false);
    notify('Análise rodando em segundo plano. Você será avisado quando terminar.', 'info', { duration: 5000 });
  }

  function deleteActivity(act) { setPendingDeleteAct(act); }
  async function confirmDeleteActivity() {
    const act = pendingDeleteAct;
    setPendingDeleteAct(null);
    if (!act) return;
    try {
      const res = await fetch(`/api/comercial/pipeline/leads/${leadId}/activities/${act.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      setActivities(prev => prev.filter(a => a.id !== act.id));
    } catch (err) { notify(err.message, 'error'); }
  }

  /* ─── Auto-plan (após fechar contrato) ─────────────────── */
  async function handleAutoPlanConfirm() {
    setAutoPlanLoading(true);
    try {
      const res = await fetch(`/api/comercial/pipeline/leads/${leadId}/auto-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Falha ao iniciar geração');
      notify(
        'Planejamento sendo gerado em segundo plano. Você será notificado quando terminar.',
        'info',
        { duration: 6500 }
      );
      setAutoPlanPrompt(null);
      onSaved?.();
      onClose?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setAutoPlanLoading(false);
    }
  }

  function handleAutoPlanSkip() {
    if (autoPlanLoading) return;
    setAutoPlanPrompt(null);
    onClose?.();
  }

  function handleAddLink() { setPendingLinkUrl(''); setLinkStep('url'); }
  async function commitLink(url, title) {
    const finalUrl = normalizeUrl(url);
    const newLinks = [
      ...(lead.links || []),
      { url: finalUrl, title: title || 'Link', addedAt: new Date().toISOString() },
    ];
    await patchLead({ links: newLinks });
  }
  async function handleRemoveLink(index) {
    const newLinks = [...(lead.links || [])];
    newLinks.splice(index, 1);
    await patchLead({ links: newLinks });
  }

  /* ─── Render ────────────────────────────────────────── */
  if (loading) {
    return (
      <div className={styles.backdrop}>
        <div className={`${styles.modal} animate-scale-in`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }
  if (!lead) return null;

  const currentColumn = (columns || []).find(c => c.id === lead.column_id) || { name: lead.column_name, color: lead.column_color };
  const score = Number(latestAnalysis?.sigma_score ?? lead.sigma_score ?? 0);

  const sortedCols = (columns || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const currentIdx = sortedCols.findIndex(c => c.id === lead.column_id);
  const nextCol = currentIdx >= 0 && currentIdx < sortedCols.length - 1 ? sortedCols[currentIdx + 1] : null;
  const wonCol = sortedCols.find(c => c.system_role === 'won');

  function copyText(text, label = 'Copiado') {
    if (!text || !navigator?.clipboard) return;
    navigator.clipboard.writeText(text).then(() => notify(label, 'success', { duration: 1500 }));
  }

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`${styles.modal} animate-scale-in`}>

        {/* TOPBAR */}
        <div className={styles.topbar}>
          <div className={styles.topbarBreadcrumb}>
            <span>Pipeline</span>
            <span className={styles.topbarSeparator}>/</span>
            <span>{currentColumn.name || '—'}</span>
            <span className={styles.topbarSeparator}>/</span>
            <span className={styles.topbarCurrent}>{lead.company_name}</span>
          </div>
          <div className={styles.topbarMeta}>
            criado {new Date(lead.created_at).toLocaleDateString('pt-BR')}
          </div>
          <div className={styles.topbarActions}>
            {nextCol && (
              <button
                className={`${styles.topbarActionBtn} ${styles.topbarActionInfo}`}
                title={`Mover para "${nextCol.name}"`}
                onClick={() => moveColumn(nextCol.id)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>Avançar</span>
              </button>
            )}
            {wonCol && wonCol.id !== lead.column_id && (
              <button
                className={`${styles.topbarActionBtn} ${styles.topbarActionSuccess}`}
                title="Marcar como Fechado (vira cliente)"
                onClick={() => setShowWon(true)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Ganho</span>
              </button>
            )}
            <button
              className={`${styles.topbarActionBtn} ${styles.topbarActionDanger}`}
              title="Marcar como Perdido"
              onClick={() => setShowLost(true)}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span>Perdido</span>
            </button>
            <button
              className={styles.topbarCloseBtn}
              title="Fechar (Esc)"
              onClick={onClose}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* MAIN PANEL */}
        <div className={styles.mainPanel}>
          {/* Status pill + ID */}
          <div className={styles.taskPillRow}>
            <div ref={statusDropdownRef} style={{ position: 'relative' }}>
              <button className={styles.taskPill} onClick={() => setShowStatusDD(v => !v)}>
                <span className={styles.taskPillDot} style={{ background: currentColumn.color || 'var(--brand-500)' }} />
                {currentColumn.name || 'Pendente'}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {showStatusDD && (
                <div className={styles.statusDropdown}>
                  {sortedCols.map(c => (
                    <div key={c.id} className={styles.statusOption} onClick={() => moveColumn(c.id)}>
                      <span className={styles.taskPillDot} style={{ background: c.color }} />
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span className={styles.taskIdLabel}>#{String(lead.id).slice(0, 8)}</span>
            <span className={styles.taskIdLabel} style={{ marginLeft: 'auto' }}>
              Última atividade: {timeAgo(lead.last_activity_at)}
            </span>
          </div>

          {/* Título */}
          <h1 className={styles.title}>{lead.company_name}</h1>

          {/* AI prompt bar — só aparece se nunca foi analisado ou se está rodando.
              Após gerar a análise, o conteúdo vai pro campo Notas e o bar some. */}
          {(!latestAnalysis || analysisRunning) && (
            <button
              className={styles.aiPromptBar}
              onClick={handleAiBarClick}
              style={{ width: '100%', textAlign: 'left' }}
            >
              <span className={styles.aiPromptIcon}>{ICON.ai}</span>
              <span className={styles.aiPromptText}>
                {analysisRunning
                  ? 'Análise IA em execução... clique pra ver progresso'
                  : 'Analisar este lead com IA'}
              </span>
              <span className={styles.aiPromptCaret}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </span>
            </button>
          )}

          <div className={styles.divider} />

          {/* Heading INFORMAÇÕES */}
          <h2 className={styles.bigSectionHeading}>INFORMAÇÕES DA EMPRESA</h2>

          <div className={styles.fieldGrid}>
            <EditableFieldRow
              icon={ICON.email}
              label="E-mail"
              value={lead.email}
              displayValue={lead.email}
              onCommit={(v) => patchLead({ email: v ? v.toLowerCase() : null })}
              type="email"
              validator={(v) => v ? validateEmail(v) : null}
              placeholder="contato@empresa.com.br"
              onCopy={lead.email ? () => copyText(lead.email, 'E-mail copiado') : null}
            />
            <EditableFieldRow
              icon={ICON.phone}
              label="Telefone"
              value={lead.phone || ''}
              draftFormatter={(v) => maskPhoneBR(v)}
              displayValue={lead.phone ? fmtPhone(lead.phone) : null}
              onCommit={(v) => patchLead({ phone: v ? unmaskPhone(v) : null })}
              type="tel"
              validator={(v) => v ? validatePhoneBR(v) : null}
              placeholder="(47) 99999-8888"
              onCopy={lead.phone ? () => copyText(lead.phone, 'Telefone copiado') : null}
              extras={lead.phone ? (
                <button
                  className={styles.whatsappBadge}
                  onClick={(e) => { e.stopPropagation(); setShowWhatsApp(true); }}
                  title="Enviar WhatsApp"
                  style={{ background: 'rgba(34, 197, 94, 0.10)', border: '1px solid rgba(34, 197, 94, 0.25)', cursor: 'pointer', font: 'inherit' }}
                >
                  {ICON.whatsapp} WhatsApp
                </button>
              ) : null}
            />
            <EditableFieldRow
              icon={ICON.globe}
              label="Website"
              value={lead.website || ''}
              displayValue={lead.website ? shortUrl(lead.website) : null}
              onCommit={(v) => patchLead({ website: v ? normalizeUrl(v) : null })}
              type="url"
              validator={(v) => v ? validateUrl(v) : null}
              placeholder="exemplo.com.br"
              extras={lead.website ? (
                <a
                  className={styles.externalLink}
                  href={ensureProtocol(lead.website)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  abrir {ICON.external}
                </a>
              ) : null}
            />
            <EditableFieldRow
              icon={ICON.insta}
              label="Instagram"
              value={lead.instagram || ''}
              displayValue={lead.instagram}
              onCommit={(v) => patchLead({ instagram: v || null })}
              placeholder="@usuario"
            />
            <EditableFieldRow
              icon={ICON.pin}
              label="Cidade"
              value={lead.city || ''}
              displayValue={lead.city}
              onCommit={(v) => patchLead({ city: v || null })}
              placeholder="Ex: Joinville"
            />
            <EditableFieldRow
              icon={ICON.pin}
              label="UF"
              value={lead.state || ''}
              displayValue={lead.state}
              onCommit={(v) => patchLead({ state: v ? v.toUpperCase() : null })}
              options={UFS}
              validator={(v) => v ? validateUF(v) : null}
              placeholder="—"
            />
            <EditableFieldRow
              icon={ICON.niche}
              label="Nicho"
              value={lead.niche || ''}
              displayValue={lead.niche}
              onCommit={(v) => patchLead({ niche: v || null })}
              placeholder="Ex: Construção civil"
            />
            <FieldRow
              icon={ICON.star}
              label="Google Reviews"
              value={lead.google_rating != null
                ? `${Number(lead.google_rating).toFixed(1)} (${lead.review_count || 0} reviews)`
                : null}
            />

            {/* Score Sigma */}
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>
                <span className="icon">{ICON.ai}</span>
                Sigma Score
              </span>
              <span className={styles.fieldValue}>
                <div className={styles.scoreInline}>
                  <span className={styles.scoreNumber}>{score}/100</span>
                  <div className={styles.scoreBar}>
                    <div className={styles.scoreBarFill} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
                  </div>
                </div>
              </span>
              <span />
            </div>
          </div>

          <div className={styles.divider} />

          {/* LINKS */}
          <div className={styles.sectionHeading}>{ICON.link} Links</div>
          <button className={styles.addLinkBtn} onClick={handleAddLink}>
            + Adicionar link
          </button>
          <div className={styles.linksList}>
            {(lead.links || []).map((linkItem, i) => (
              <div key={i} className={styles.linkItem}>
                <span className={styles.linkTitle}>{linkItem.title || 'Link'}</span>
                <a href={ensureProtocol(linkItem.url)} target="_blank" rel="noreferrer" className={styles.linkUrl}>
                  {shortUrl(linkItem.url)}
                </a>
                <a href={ensureProtocol(linkItem.url)} target="_blank" rel="noreferrer" className={styles.fieldActionBtn} title="Abrir">
                  {ICON.external}
                </a>
                <button className={styles.fieldActionBtn} onClick={() => handleRemoveLink(i)} title="Remover">
                  {ICON.trash}
                </button>
              </div>
            ))}
            {(lead.links || []).length === 0 && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Nenhum link cadastrado
              </div>
            )}
          </div>

          <div className={styles.divider} />

          {/* NOTAS — markdown rendered + edit toggle */}
          <NotesField
            value={notes}
            onChange={setNotes}
            saving={savingNotes}
          />
        </div>

        {/* SIDEBAR DIREITA — APENAS TIMELINE */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarTitle}>Atividade</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}>
              {activities.length} eventos
            </span>
          </div>

          <div className={styles.activityList}>
            <LeadActivityTimeline
              activities={activities}
              currentUserId={user?.id || null}
              onDelete={deleteActivity}
              onActivityClick={(a) => {
                if (a.type === 'ai_analysis') setAnalysisOpen(true);
              }}
            />
          </div>
        </div>

      </div>

      {analysisOpen && (
        <AIStreamDrawer
          title="Análise IA"
          phases={ANALYSIS_PHASES}
          jobId={analysisJobId}
          streamUrl={streamUrl}
          onClose={() => setAnalysisOpen(false)}
          onMinimize={handleAnalysisMinimize}
          onDone={handleAnalysisDone}
          onError={handleAnalysisError}
          cachedAt={!analysisJobId ? latestAnalysis?.created_at : null}
          cachedContent={!analysisJobId ? latestAnalysis?.analysis_text : null}
          cachedSigmaScore={!analysisJobId ? latestAnalysis?.sigma_score : null}
          cachedSourcesUsed={!analysisJobId ? latestAnalysis?.sources_used : null}
          footerActions={
            // Análise é one-shot por lead — após gerar, oferece "Importar pra notas".
            // Antes da primeira execução: "Analisar agora".
            !analysisRunning && (
              <>
                <button className="btn btn-secondary" onClick={() => setAnalysisOpen(false)} style={{ flex: 1 }}>
                  Fechar
                </button>
                {latestAnalysis ? (
                  <button className="sigma-btn-primary" onClick={importAnalysisToNotes}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, verticalAlign: '-1px' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Importar para notas
                  </button>
                ) : (
                  <button className="sigma-btn-primary" onClick={startAnalysis}>
                    Analisar agora
                  </button>
                )}
              </>
            )
          }
        />
      )}

      {showWhatsApp && (
        <LeadWhatsAppModal
          leadId={leadId}
          lead={lead}
          onClose={() => setShowWhatsApp(false)}
          onSent={() => fetchActivities()}
        />
      )}

      {showWon && (
        <WonContractModal
          lead={lead}
          onClose={() => setShowWon(false)}
          onSuccess={(j) => {
            fetchActivities();
            onSaved?.();
            // Só pergunta sobre auto-plan quando é fechamento NOVO (não idempotente)
            if (j?.clientId && j.isNew !== false) {
              setAutoPlanPrompt({ clientId: j.clientId });
            } else {
              onClose?.();
            }
          }}
        />
      )}

      {showLost && (
        <LostLeadModal
          lead={lead}
          onClose={() => setShowLost(false)}
          onSuccess={() => { fetchActivities(); onSaved?.(); onClose?.(); }}
        />
      )}

      <ConfirmModal
        open={!!pendingDeleteAct}
        onClose={() => setPendingDeleteAct(null)}
        onConfirm={confirmDeleteActivity}
        variant="danger"
        title="Remover esta atividade?"
        description="A atividade será removida apenas da timeline visual. Mensagens já enviadas (WhatsApp) permanecem entregues. Essa ação não pode ser desfeita."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
      />

      <ConfirmModal
        open={!!autoPlanPrompt}
        onClose={handleAutoPlanSkip}
        onConfirm={handleAutoPlanConfirm}
        loading={autoPlanLoading}
        variant="ai"
        title="Gerar planejamento de conteúdo automaticamente?"
        description="A IA vai analisar suas notas + análise do lead e montar um plano com 8 criativos prontos pra o próximo mês. Roda em segundo plano — você pode continuar usando o sistema. Notificamos você quando terminar."
        confirmLabel={autoPlanLoading ? 'Iniciando...' : 'Sim, gerar agora'}
        cancelLabel="Pular por enquanto"
      />

      <PromptModal
        open={linkStep === 'url'}
        onClose={() => setLinkStep(null)}
        onConfirm={(value) => { setPendingLinkUrl(value); setLinkStep('title'); }}
        variant="link"
        title="URL do link"
        description="Cole a URL completa. Adicionamos o https:// automaticamente se faltar."
        inputLabel="URL"
        inputPlaceholder="exemplo.com/pagina"
        confirmLabel="Próximo"
        validate={(v) => validateUrl(v, { required: true })}
      />

      <PromptModal
        open={linkStep === 'title'}
        onClose={() => setLinkStep(null)}
        onConfirm={async (title) => {
          await commitLink(pendingLinkUrl, title);
          setLinkStep(null);
          setPendingLinkUrl('');
        }}
        variant="link"
        title="Título do link"
        description="Como esse link aparece na lista. Mantenha curto."
        inputLabel="Título"
        inputPlaceholder="Ex: Site institucional"
        confirmLabel="Adicionar"
      />
    </div>
  );
}

/* ─── Subcomponente FieldRow ───────────────────────────────── */
function FieldRow({ icon, label, value, extras, onCopy }) {
  const isEmpty = !value;
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>
        <span className="icon">{icon}</span>
        {label}
      </span>
      <span className={`${styles.fieldValue} ${isEmpty ? styles.empty : ''}`}>
        {value || '—'}
        {extras}
      </span>
      <span className={styles.fieldActions}>
        {value && onCopy && (
          <button
            className={styles.fieldActionBtn}
            title="Copiar"
            onClick={onCopy}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        )}
      </span>
    </div>
  );
}

/* ─── Subcomponente EditableFieldRow ──────────────────────────
   Click no valor → input inline. Enter/blur salva. Esc cancela.
   - draftFormatter: aplica máscara enquanto digita (ex: telefone)
   - validator: retorna string de erro ou null
   - displayValue: o que aparece no modo view (formatado)
   - onCommit: recebe o valor cru do draft (string trimmada ou '')
   - options: se passado, vira <select>
   ─────────────────────────────────────────────────────────── */
function EditableFieldRow({
  icon, label, value, displayValue, onCommit,
  type = 'text', placeholder = '— clique para adicionar',
  draftFormatter, validator, options,
  extras, onCopy,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      try { inputRef.current.select?.(); } catch {}
    }
  }, [editing]);

  function startEdit() {
    if (saving) return;
    const initial = (value != null ? String(value) : '');
    setDraft(draftFormatter ? draftFormatter(initial) : initial);
    setError('');
    setEditing(true);
  }

  async function commit() {
    if (saving) return;
    const trimmed = String(draft || '').trim();
    if (validator) {
      const err = validator(trimmed);
      if (err) { setError(err); return; }
    }
    // No-op se não mudou (compara com versão formatada quando há draftFormatter)
    const original = value != null ? String(value) : '';
    const originalForCompare = draftFormatter ? draftFormatter(original) : original;
    if (trimmed === originalForCompare) { setEditing(false); return; }
    setSaving(true);
    try {
      await onCommit(trimmed);
      setEditing(false);
    } catch {
      // erro já notificado pelo patchLead
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setEditing(false);
    setError('');
    setDraft('');
  }

  const isEmpty = !displayValue && !value;

  if (editing) {
    return (
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>
          <span className="icon">{icon}</span>
          {label}
        </span>
        <span className={styles.fieldValue} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
            {options ? (
              <select
                ref={inputRef}
                className={styles.inlineSelect}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); if (error) setError(''); }}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commit(); }
                  if (e.key === 'Escape') cancel();
                }}
                disabled={saving}
              >
                <option value="">—</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                ref={inputRef}
                type={type}
                className={styles.inlineInput}
                value={draft}
                placeholder={placeholder}
                onChange={(e) => {
                  const next = draftFormatter ? draftFormatter(e.target.value) : e.target.value;
                  setDraft(next);
                  if (error) setError('');
                }}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commit(); }
                  if (e.key === 'Escape') cancel();
                }}
                disabled={saving}
              />
            )}
            {saving && <span className="spinner" style={{ width: 12, height: 12, flexShrink: 0 }} />}
          </div>
          {error && <span className={styles.inlineError}>{error}</span>}
        </span>
        <span className={styles.fieldActions} style={{ opacity: 1 }}>
          <button
            type="button"
            className={styles.fieldActionBtn}
            title="Cancelar (Esc)"
            // mousedown impede o blur do input antes do click registrar
            onMouseDown={(e) => { e.preventDefault(); cancel(); }}
            disabled={saving}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>
        <span className="icon">{icon}</span>
        {label}
      </span>
      <span
        className={`${styles.fieldValue} ${styles.fieldValueClickable} ${isEmpty ? styles.empty : ''}`}
        onClick={startEdit}
        title="Clique para editar"
      >
        {displayValue || (value || '— clique para adicionar')}
        {extras}
      </span>
      <span className={styles.fieldActions}>
        {(displayValue || value) && onCopy && (
          <button
            type="button"
            className={styles.fieldActionBtn}
            title="Copiar"
            onClick={(e) => { e.stopPropagation(); onCopy(); }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        )}
        <button
          type="button"
          className={styles.fieldActionBtn}
          title="Editar"
          onClick={(e) => { e.stopPropagation(); startEdit(); }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </span>
    </div>
  );
}
