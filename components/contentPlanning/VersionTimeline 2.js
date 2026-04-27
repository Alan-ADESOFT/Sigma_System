/**
 * components/contentPlanning/VersionTimeline.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Histórico de versões do plano. Inclui:
 *   - Manual de uso no topo
 *   - Botão "Salvar versão atual" → abre popup padrão (icon + título + desc)
 *   - Lista de versões (cada uma: ver + restaurar)
 *   - Modal de visualizar versão (snapshot completo)
 *   - Modal de restaurar (confirmação padrão)
 *
 * Props:
 *   planId
 *   onRestored  () => void   — chamado apos restaurar (para o pai recarregar)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import styles from '../../assets/style/contentPlanning.module.css';
import { useNotification } from '../../context/NotificationContext';

const TRIGGER_LABEL = {
  manual:             'Manual',
  client_rejected:    'Cliente reprovou',
  share_link_created: 'Link gerado',
  restore_safety:     'Antes de restaurar',
};

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

export default function VersionTimeline({ planId, onRestored }) {
  const { notify } = useNotification();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [diffOpen, setDiffOpen] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}/versions`);
      const d = await r.json();
      if (d.success) setVersions(d.versions || []);
    } catch {} finally { setLoading(false); }
  }, [planId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function saveSnapshot(label) {
    setSavingSnapshot(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label || null, trigger: 'manual' }),
      });
      const d = await r.json();
      if (d.success) {
        notify('Versão salva', 'success');
        refresh();
        setCreateOpen(false);
      } else {
        notify(d.error || 'Erro ao salvar versão', 'error');
      }
    } catch {
      notify('Falha de rede', 'error');
    } finally {
      setSavingSnapshot(false);
    }
  }

  async function confirmRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}/versions/${restoreTarget.id}`, { method: 'POST' });
      const d = await r.json();
      if (d.success) {
        notify(`Versão restaurada para v${restoreTarget.version_no}`, 'success');
        refresh();
        onRestored?.();
      } else {
        notify(d.error || 'Erro ao restaurar', 'error');
      }
    } catch {
      notify('Falha de rede', 'error');
    } finally {
      setRestoring(false);
      setRestoreTarget(null);
    }
  }

  async function viewDiff(v) {
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}/versions/${v.id}`);
      const d = await r.json();
      if (d.success) setDiffOpen({ version: v, snapshot: d.version.snapshot });
      else notify(d.error || 'Erro ao carregar versão', 'error');
    } catch {
      notify('Falha de rede', 'error');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}/versions/${deleteTarget.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) {
        notify(`Versão v${deleteTarget.version_no} removida`, 'success');
        refresh();
      } else {
        notify(d.error || 'Erro ao remover', 'error');
      }
    } catch {
      notify('Falha de rede', 'error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function confirmClearAll() {
    setClearing(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}/versions`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) {
        notify(`Histórico limpo (${d.removed || 0} versões removidas)`, 'success');
        refresh();
      } else {
        notify(d.error || 'Erro ao limpar', 'error');
      }
    } catch {
      notify('Falha de rede', 'error');
    } finally {
      setClearing(false);
      setClearAllOpen(false);
    }
  }

  return (
    <div className={styles.editorPanel}>
      <HistoryManual />

      {/* Header com contador e CTAs */}
      <div className={styles.versionHeader}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          {versions.length} {versions.length === 1 ? 'versão salva' : 'versões salvas'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {versions.length > 0 && (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setClearAllOpen(true)}
              disabled={clearing}
              title="Apagar todas as versões"
            >
              <BroomIcon />
              Limpar histórico
            </button>
          )}
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setCreateOpen(true)}
            disabled={savingSnapshot}
          >
            <CameraIcon />
            Salvar versão atual
          </button>
        </div>
      </div>

      <div className={styles.versionTimeline}>
        {loading ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>// carregando...</div>
        ) : versions.length === 0 ? (
          <div className={styles.shareEmpty}>
            <ArchiveIcon />
            <div className={styles.shareEmptyText}>
              Nenhuma versão salva ainda. Use <strong style={{ color: 'var(--brand-300)' }}>Salvar versão atual</strong>
              {' '}antes de mudanças importantes para poder voltar atrás se precisar.
            </div>
          </div>
        ) : (
          versions.map(v => (
            <div key={v.id} className={styles.versionRow}>
              <div className={styles.versionNo}>v{v.version_no}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.versionLabel}>{v.label || `Versão ${v.version_no}`}</div>
                <div className={styles.versionMeta}>
                  {formatDate(v.created_at)} · {TRIGGER_LABEL[v.trigger] || v.trigger || 'Manual'}
                </div>
              </div>
              <button type="button" className={styles.btnSecondary} onClick={() => viewDiff(v)}>
                Ver
              </button>
              <button type="button" className={styles.btnDanger} onClick={() => setRestoreTarget(v)}>
                Restaurar
              </button>
              <button
                type="button"
                className={styles.iconBtnDanger}
                onClick={() => setDeleteTarget(v)}
                title="Remover versão"
                aria-label={`Remover versão v${v.version_no}`}
              >
                <TrashIconSm />
              </button>
            </div>
          ))
        )}
      </div>

      {createOpen && (
        <CreateVersionModal
          submitting={savingSnapshot}
          onCancel={() => setCreateOpen(false)}
          onConfirm={saveSnapshot}
          existingCount={versions.length}
        />
      )}

      {restoreTarget && (
        <RestoreVersionModal
          version={restoreTarget}
          submitting={restoring}
          onCancel={() => setRestoreTarget(null)}
          onConfirm={confirmRestore}
        />
      )}

      {diffOpen && (
        <DiffModal
          version={diffOpen.version}
          snapshot={diffOpen.snapshot}
          onClose={() => setDiffOpen(null)}
        />
      )}

      {deleteTarget && (
        <DeleteVersionModal
          version={deleteTarget}
          submitting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {clearAllOpen && (
        <ClearHistoryModal
          count={versions.length}
          submitting={clearing}
          onCancel={() => setClearAllOpen(false)}
          onConfirm={confirmClearAll}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Manual de uso
───────────────────────────────────────────────────────────── */
function HistoryManual() {
  return (
    <div className={styles.manualCard}>
      <div className={styles.manualIcon} aria-hidden="true">
        <ArchiveIcon />
      </div>
      <div className={styles.manualBody}>
        <div className={styles.manualTitle}>Manual de uso · Histórico</div>
        <div className={styles.manualSubtitle}>
          Cada versão é um snapshot completo do plano + criativos. Use antes de mudanças
          importantes para conseguir voltar atrás caso o cliente reprove.
        </div>
        <div className={styles.manualSteps}>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>01</span>
            <div className={styles.manualStepText}>
              <strong>Salvar versão atual</strong> congela o estado em que o plano está agora,
              com um rótulo opcional pra você lembrar do contexto.
            </div>
          </div>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>02</span>
            <div className={styles.manualStepText}>
              <strong>"Ver"</strong> abre o snapshot em modo leitura mostrando título, objetivo,
              promessa e cada criativo daquele momento.
            </div>
          </div>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>03</span>
            <div className={styles.manualStepText}>
              <strong>"Restaurar"</strong> aplica o snapshot escolhido. O sistema cria
              automaticamente uma versão de segurança do estado atual antes de sobrescrever.
            </div>
          </div>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>04</span>
            <div className={styles.manualStepText}>
              Versões marcadas como <strong>"Antes de restaurar"</strong> são geradas
              automaticamente — sua rede de segurança contra perdas.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Modal: Salvar nova versão
───────────────────────────────────────────────────────────── */
function CreateVersionModal({ submitting, onCancel, onConfirm, existingCount }) {
  const [label, setLabel] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  function handleSubmit(e) {
    e?.preventDefault?.();
    onConfirm(label.trim());
  }

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconBrand}`} aria-hidden="true">
            <CameraIconLg />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Salvar versão atual</div>
            <div className={styles.modalHeaderDesc}>
              Tira um snapshot do plano + todos os criativos no estado atual. Você poderá
              voltar para ele depois caso precise desfazer alterações.
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onCancel} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Rótulo (opcional)</label>
              <input
                ref={inputRef}
                type="text"
                className="sigma-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Ex: v${existingCount + 1} — antes do feedback do cliente`}
                maxLength={120}
              />
              <span className={styles.formHint}>
                Deixe em branco para usar "v{existingCount + 1}" como rótulo padrão.
              </span>
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onCancel} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar versão'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Modal: Restaurar versão
───────────────────────────────────────────────────────────── */
function RestoreVersionModal({ version, submitting, onCancel, onConfirm }) {
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconWarning}`} aria-hidden="true">
            <RotateCcwIcon />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Restaurar versão {`v${version.version_no}`}</div>
            <div className={styles.modalHeaderDesc}>
              O plano e todos os criativos voltam ao estado dessa versão. Antes de sobrescrever,
              uma versão de segurança do estado atual é criada automaticamente.
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onCancel} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.deleteWarning}>
            <div className={styles.deleteWarningIcon} style={{ background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.3)', color: '#818CF8' }}>
              <RotateCcwIcon />
            </div>
            <div className={styles.deleteWarningBody}>
              <div className={styles.deleteWarningTitle}>
                Restaurar para <span style={{ color: 'var(--brand-300)' }}>{version.label || `v${version.version_no}`}</span>?
              </div>
              <div className={styles.deleteWarningText}>
                Versão criada em {formatDate(version.created_at)} · {TRIGGER_LABEL[version.trigger] || version.trigger || 'Manual'}.
                As decisões do cliente registradas naquela versão também voltam.
              </div>
              <div className={styles.deleteHint}>// snapshot de segurança automático antes de sobrescrever</div>
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className={styles.btnPrimary} onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Restaurando...' : 'Restaurar versão'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Modal de diff (visualizar snapshot)
───────────────────────────────────────────────────────────── */
function DiffModal({ version, snapshot, onClose }) {
  const snap = (typeof snapshot === 'string') ? safeJson(snapshot) : snapshot;
  const plan = snap?.plan;
  const creatives = snap?.creatives || [];

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.modalCardWide}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 900 }}
      >
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconInfo}`} aria-hidden="true">
            <EyeIcon />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>v{version.version_no} · {version.label || 'Versão'}</div>
            <div className={styles.modalHeaderDesc}>
              Snapshot read-only do plano e todos os criativos no momento em que essa versão foi salva.
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          {plan && (
            <div className="glass-card" style={{ padding: 12 }}>
              <div className={styles.formLabel}>Plano</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--text-primary)', marginTop: 4 }}>
                {plan.title}
              </div>
              {plan.objective && (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                  <strong>Objetivo:</strong> {plan.objective}
                </div>
              )}
              {plan.central_promise && (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  <strong>Promessa:</strong> {plan.central_promise}
                </div>
              )}
            </div>
          )}

          <div className={styles.formLabel}>Criativos ({creatives.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {creatives.map((c, i) => (
              <div key={i} className="glass-card" style={{ padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span className={styles.creativeIndex}>#{String(i + 1).padStart(2, '0')}</span>
                  <span className={styles.creativeType}>{c.type}</span>
                  {c.scheduled_for && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                      {String(c.scheduled_for).slice(0, 10)} {c.scheduled_time || ''}
                    </span>
                  )}
                </div>
                {c.caption && (
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {c.caption}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/* ─────────────────────────────────────────────────────────────
   Modal: Remover versão (hard delete de UMA versão)
───────────────────────────────────────────────────────────── */
function DeleteVersionModal({ version, submitting, onCancel, onConfirm }) {
  const isAutoSafety = version.trigger === 'restore_safety';
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconWarning}`} aria-hidden="true">
            <TrashIcon />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Remover versão {`v${version.version_no}`}</div>
            <div className={styles.modalHeaderDesc}>
              Esse snapshot é apagado permanentemente do histórico. Você ainda
              poderá criar versões novas a partir do estado atual.
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onCancel} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
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
                Apagar <span style={{ color: 'var(--brand-300)' }}>{version.label || `v${version.version_no}`}</span>?
              </div>
              <div className={styles.deleteWarningText}>
                {isAutoSafety
                  ? <>Esta versão foi gerada automaticamente como <strong>backup de segurança</strong> antes de uma restauração. Apagá-la remove uma rede de proteção.</>
                  : <>Snapshot manual. Após remover não há como recuperar — não existe lixeira.</>}
              </div>
              <div className={styles.deleteHint}>// hard delete · operação irreversível</div>
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className={styles.btnDanger} onClick={onConfirm} disabled={submitting} style={{ padding: '8px 14px' }}>
            {submitting ? 'Removendo...' : 'Remover versão'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Modal: Limpar histórico (hard delete de TODAS as versões)
───────────────────────────────────────────────────────────── */
function ClearHistoryModal({ count, submitting, onCancel, onConfirm }) {
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconWarning}`} aria-hidden="true">
            <BroomIconLg />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Limpar todo o histórico</div>
            <div className={styles.modalHeaderDesc}>
              Apaga todas as versões salvas deste planejamento, incluindo os
              backups automáticos de segurança. O plano e os criativos atuais não
              são afetados.
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onCancel} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
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
                Excluir <strong style={{ color: 'var(--brand-300)' }}>{count}</strong> {count === 1 ? 'versão' : 'versões'}?
              </div>
              <div className={styles.deleteWarningText}>
                Após limpar, você perde a capacidade de voltar a estados anteriores.
                Recomendado apenas quando o planejamento já foi finalizado e você quer
                liberar espaço/limpar a interface.
              </div>
              <div className={styles.deleteHint}>// hard delete em lote · operação irreversível</div>
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className={styles.btnDanger} onClick={onConfirm} disabled={submitting} style={{ padding: '8px 14px' }}>
            {submitting ? 'Limpando...' : 'Limpar histórico'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Icons
───────────────────────────────────────────────────────────── */
function CameraIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function CameraIconLg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function ArchiveIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}
function RotateCcwIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
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
function TrashIconSm() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function BroomIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.36 2.72 20.78 4.14a3 3 0 0 1 0 4.24l-9.9 9.9-3.54-3.54 9.9-9.9a3 3 0 0 1 4.12 0Z" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </svg>
  );
}
function BroomIconLg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.36 2.72 20.78 4.14a3 3 0 0 1 0 4.24l-9.9 9.9-3.54-3.54 9.9-9.9a3 3 0 0 1 4.12 0Z" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </svg>
  );
}
