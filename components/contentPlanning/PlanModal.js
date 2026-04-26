/**
 * components/contentPlanning/PlanModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Popup unificado de CRUD de plano. 3 modos:
 *   info   → visualizacao read-only com todos os campos do plano
 *   edit   → edicao inline (mesmos campos do "Novo Plano" + status)
 *   delete → confirmacao de exclusao com aviso
 *
 * Segue o padrao do sistema: overlay escuro + glass-card + footer com acoes.
 *
 * Props:
 *   mode       'info' | 'edit' | 'delete'
 *   plan       registro vindo de listPlans (com agregados)
 *   statuses   lista de content_plan_statuses
 *   users      lista de tenants (usuarios) para o select de responsavel
 *   onClose
 *   onUpdated  (updatedPlan) => void
 *   onDeleted  () => void
 *   onSwitchMode  (newMode) => void   // botao "Editar" dentro do info
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import styles from '../../assets/style/contentPlanning.module.css';
import { useNotification } from '../../context/NotificationContext';

const DatePicker = dynamic(() => import('react-datepicker'), { ssr: false });

function dateOrNull(s) {
  if (!s) return null;
  const dt = new Date(typeof s === 'string' ? `${String(s).slice(0, 10)}T00:00:00` : s);
  return isNaN(dt.getTime()) ? null : dt;
}
function dateToYMD(d) {
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

function fmtMonthRef(d) {
  if (!d) return '—';
  try {
    const dt = new Date(typeof d === 'string' ? `${String(d).slice(0, 10)}T00:00:00` : d);
    return dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

export default function PlanModal({ mode, plan, statuses = [], users = [], onClose, onUpdated, onDeleted, onSwitchMode }) {
  if (!mode || !plan) return null;
  if (mode === 'info')   return <InfoModal   plan={plan} onClose={onClose} onSwitchMode={onSwitchMode} />;
  if (mode === 'edit')   return <EditModal   plan={plan} statuses={statuses} users={users} onClose={onClose} onUpdated={onUpdated} />;
  if (mode === 'delete') return <DeleteModal plan={plan} onClose={onClose} onDeleted={onDeleted} />;
  return null;
}

/* ─────────────────────────────────────────────────────────────
   INFO — read-only
───────────────────────────────────────────────────────────── */
function InfoModal({ plan, onClose, onSwitchMode }) {
  const total = Number(plan.creative_count || 0);
  const approved = Number(plan.approved_count || 0);
  const rejected = Number(plan.rejected_count || 0);
  const progress = total > 0 ? Math.round((approved / total) * 100) : 0;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalCard} ${styles.modalCardWide}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconInfo}`} aria-hidden="true">
            <EyeIcon />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Detalhes do planejamento</div>
            <div className={styles.modalHeaderDesc}>
              Visão completa do plano: status, prazos, responsável e estratégia.
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {plan.client_logo_url ? (
              <img src={plan.client_logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-accent)' }} />
            ) : (
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: 'rgba(255,0,51,0.06)',
                border: '1px solid var(--border-accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--brand-300)', fontWeight: 700,
              }}>
                {(plan.client_company_name || '?').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
                {plan.client_company_name || '—'}
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 3 }}>
                {plan.title}
              </div>
            </div>
            {plan.status_label && (
              <span
                className={styles.infoStatusPill}
                style={{
                  background: `${plan.status_color || '#525252'}1a`,
                  border: `1px solid ${plan.status_color || '#525252'}55`,
                  color: plan.status_color || 'var(--text-muted)',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                {plan.status_label}
              </span>
            )}
          </div>

          <div className={styles.infoMetaGrid}>
            <MetaCard label="Mês de referência" value={fmtMonthRef(plan.month_reference)} />
            <MetaCard label="Data limite"        value={fmtDate(plan.due_date)} />
            <MetaCard label="Responsável"        value={plan.owner_name || '—'} />
          </div>

          <div className={styles.infoMetaGrid}>
            <MetaCard label="Criativos"  value={String(total)} accent="var(--brand-300)" />
            <MetaCard label="Aprovados"  value={`${approved} (${progress}%)`} accent="#10B981" />
            <MetaCard label="Reprovados" value={String(rejected)} accent="#F59E0B" />
          </div>

          {plan.central_promise && (
            <div className={styles.infoBlock}>
              <div className={styles.infoBlockLabel}>Promessa central</div>
              <div className={styles.infoBlockValue}>{plan.central_promise}</div>
            </div>
          )}

          {plan.objective && (
            <div className={styles.infoBlock}>
              <div className={styles.infoBlockLabel}>Objetivo</div>
              <div className={styles.infoBlockValue}>{plan.objective}</div>
            </div>
          )}

          {plan.strategy_notes && (
            <div className={styles.infoBlock}>
              <div className={styles.infoBlockLabel}>Notas estratégicas</div>
              <div className={styles.infoBlockValue}>{plan.strategy_notes}</div>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
          <button type="button" className={styles.btnPrimary} onClick={() => onSwitchMode?.('edit')}>
            <PencilIcon />
            Editar
          </button>
        </div>
      </div>
    </div>
  );
}

function MetaCard({ label, value, accent }) {
  return (
    <div className={styles.infoBlock}>
      <div className={styles.infoBlockLabel}>{label}</div>
      <div className={styles.infoBlockValue} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: accent || 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   EDIT — formulário inline
───────────────────────────────────────────────────────────── */
function EditModal({ plan, statuses, users, onClose, onUpdated }) {
  const { notify } = useNotification();
  const [title, setTitle] = useState(plan.title || '');
  const [monthRefDate, setMonthRefDate] = useState(dateOrNull(plan.month_reference));
  const [dueDateD, setDueDateD] = useState(dateOrNull(plan.due_date));
  const [statusId, setStatusId] = useState(plan.status_id || '');
  const [ownerId, setOwnerId] = useState(plan.owner_id || '');
  const [objective, setObjective] = useState(plan.objective || '');
  const [centralPromise, setCentralPromise] = useState(plan.central_promise || '');
  const [strategyNotes, setStrategyNotes] = useState(plan.strategy_notes || '');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!title.trim()) return notify('Título obrigatório', 'error');
    setSubmitting(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          monthReference: monthRefDate ? `${monthRefDate.getFullYear()}-${String(monthRefDate.getMonth() + 1).padStart(2, '0')}-01` : null,
          dueDate: dueDateD ? dateToYMD(dueDateD) : null,
          statusId: statusId || null,
          ownerId: ownerId || null,
          objective: objective.trim() || null,
          centralPromise: centralPromise.trim() || null,
          strategyNotes: strategyNotes.trim() || null,
        }),
      });
      const d = await r.json();
      if (d.success && d.plan) {
        notify('Planejamento atualizado', 'success');
        try {
          const full = await fetch(`/api/content-planning/plans/${plan.id}`).then(r => r.json());
          onUpdated?.(full.success && full.plan ? full.plan : { ...plan, ...d.plan });
        } catch {
          onUpdated?.({ ...plan, ...d.plan });
        }
        onClose();
      } else {
        notify(d.error || 'Erro ao atualizar', 'error');
      }
    } catch {
      notify('Falha de rede', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalCard} ${styles.modalCardWide}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconBrand}`} aria-hidden="true">
            <PencilIcon />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Editar planejamento</div>
            <div className={styles.modalHeaderDesc}>
              Atualize título, prazos, responsável, status e estratégia. As mudanças
              entram em vigor imediatamente.
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Título *</label>
            <input className="sigma-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className={styles.formGroup}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Mês de referência</label>
              <div className={styles.dpWrap}>
                <span className={styles.dpIcon}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </span>
                <DatePicker
                  selected={monthRefDate}
                  onChange={(d) => setMonthRefDate(d)}
                  dateFormat="MMMM 'de' yyyy"
                  showMonthYearPicker
                  showFullMonthYearPicker
                  placeholderText="Selecione o mês"
                  className={styles.dpInput}
                  popperPlacement="bottom-start"
                  isClearable
                />
              </div>
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Data limite</label>
              <div className={styles.dpWrap}>
                <span className={styles.dpIcon}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <DatePicker
                  selected={dueDateD}
                  onChange={(d) => setDueDateD(d)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="dd/mm/aaaa"
                  className={styles.dpInput}
                  popperPlacement="bottom-start"
                  isClearable
                />
              </div>
            </div>
          </div>

          <div className={styles.formGroup}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Status</label>
              <select className="sigma-input" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                <option value="">Sem status</option>
                {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Responsável</label>
              <select className="sigma-input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Sem responsável</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionTitle}>Estratégia</div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Promessa central</label>
              <textarea className="sigma-input" rows={2} value={centralPromise} onChange={(e) => setCentralPromise(e.target.value)} />
            </div>
            <div className={styles.formField} style={{ marginTop: 10 }}>
              <label className={styles.formLabel}>Objetivo do mês</label>
              <textarea className="sigma-input" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} />
            </div>
            <div className={styles.formField} style={{ marginTop: 10 }}>
              <label className={styles.formLabel}>Notas estratégicas</label>
              <textarea className="sigma-input" rows={3} value={strategyNotes} onChange={(e) => setStrategyNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={submitting}>Cancelar</button>
          <button type="button" className={styles.btnPrimary} onClick={submit} disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   DELETE — confirmação
───────────────────────────────────────────────────────────── */
function DeleteModal({ plan, onClose, onDeleted }) {
  const { notify } = useNotification();
  const [submitting, setSubmitting] = useState(false);

  async function confirmDelete() {
    setSubmitting(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${plan.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) {
        notify('Planejamento excluído', 'success');
        onDeleted?.();
        onClose();
      } else {
        notify(d.error || 'Erro ao excluir', 'error');
      }
    } catch {
      notify('Falha de rede', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const total = Number(plan.creative_count || 0);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconWarning}`} aria-hidden="true">
            <TrashIcon />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Excluir planejamento</div>
            <div className={styles.modalHeaderDesc}>
              Esta ação é permanente e não pode ser desfeita. Confirme antes de prosseguir.
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.deleteWarning}>
            <div className={styles.deleteWarningIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className={styles.deleteWarningBody}>
              <div className={styles.deleteWarningTitle}>
                Tem certeza que deseja excluir <span style={{ color: 'var(--brand-300)' }}>{plan.title}</span>?
              </div>
              <div className={styles.deleteWarningText}>
                {total > 0
                  ? <>Os <strong>{total}</strong> {total === 1 ? 'criativo' : 'criativos'}, links públicos, versões e histórico de atividades serão excluídos junto.</>
                  : 'Não há criativos associados — apenas o registro do plano será removido.'}
              </div>
              <div className={styles.deleteHint}>// CASCADE: criativos · tokens · versões · atividades</div>
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={submitting}>Cancelar</button>
          <button type="button" className={styles.btnDanger} onClick={confirmDelete} disabled={submitting} style={{ padding: '8px 14px' }}>
            {submitting ? 'Excluindo...' : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Icons
───────────────────────────────────────────────────────────── */
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
