/**
 * components/contentPlanning/ShareLinkPanel.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Painel completo de geracao + historico de links publicos de aprovacao.
 *   - Manual de uso no topo (instrucoes ao operador)
 *   - Form: duracao, PIN opcional
 *   - Resultado: URL + copiar + revogar
 *   - Historico: lista de tokens com status, aberturas, expiracao
 *   - Modal padrao de revogacao (icon + titulo + descricao)
 *
 * Props:
 *   planId
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import styles from '../../assets/style/contentPlanning.module.css';
import { useNotification } from '../../context/NotificationContext';

const DURATION_PRESETS = [
  { id: 3,  label: '3 dias' },
  { id: 7,  label: '7 dias' },
  { id: 14, label: '14 dias' },
];

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

function statusClass(s, expiresAt) {
  if (s === 'revoked') return 'statusRevoked';
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return 'statusExpired';
  if (s === 'expired') return 'statusExpired';
  return 'statusActive';
}

function statusLabel(s, expiresAt) {
  if (s === 'revoked') return 'Revogado';
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return 'Expirado';
  if (s === 'expired') return 'Expirado';
  return 'Ativo';
}

export default function ShareLinkPanel({ planId, planTitle }) {
  const { notify } = useNotification();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(7);
  const [customDuration, setCustomDuration] = useState(false);
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState('');
  const [generated, setGenerated] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState(null); // token | null
  const [revoking, setRevoking] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // token | null
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}/share-tokens`);
      const d = await r.json();
      if (d.success) setTokens(d.tokens || []);
    } catch {} finally { setLoading(false); }
  }, [planId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function generateLink() {
    if (usePin && !/^\d{4}$/.test(pin)) {
      notify('PIN deve ter exatamente 4 dígitos', 'error');
      return;
    }
    setGenerating(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}/share-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationDays: duration,
          pin: usePin ? pin : null,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setGenerated({ token: d.token, link: d.link, expiresAt: d.expiresAt, hasPassword: d.hasPassword });
        setPin('');
        notify('Link gerado', 'success', { action: { label: 'Copiar', onClick: () => copyToClipboard(d.link) } });
        refresh();
      } else {
        notify(d.error || 'Erro ao gerar link', 'error');
      }
    } catch {
      notify('Falha de rede ao gerar link', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      notify('Link copiado para a área de transferência', 'success');
    } catch {
      notify('Não foi possível copiar', 'error');
    }
  }


  async function confirmRevoke() {
    if (!pendingRevoke) return;
    const id = pendingRevoke.id;
    setRevoking(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}/share-tokens/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) {
        notify('Link revogado', 'success');
        if (generated?.token === pendingRevoke.token) setGenerated(null);
        refresh();
      } else {
        notify(d.error || 'Erro ao revogar', 'error');
      }
    } catch {
      notify('Falha de rede', 'error');
    } finally {
      setRevoking(false);
      setPendingRevoke(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setDeleting(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}/share-tokens/${id}?hard=1`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) {
        notify('Link removido do histórico', 'success');
        if (generated?.token === pendingDelete.token) setGenerated(null);
        refresh();
      } else {
        notify(d.error || 'Erro ao remover', 'error');
      }
    } catch {
      notify('Falha de rede', 'error');
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div className={styles.shareLinkPanel}>
      <ShareManual />

      {/* Form gerar link */}
      <div className="glass-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'rgba(255,0,51,0.06)', border: '1px solid var(--border-accent)',
            color: 'var(--brand-300)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LinkIcon />
          </span>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Gerar link de aprovação
          </div>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Duração</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DURATION_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setDuration(p.id); setCustomDuration(false); }}
                className={(!customDuration && duration === p.id) ? styles.clientPlansFilterBtnActive : styles.clientPlansFilterBtn}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomDuration(v => !v)}
              className={customDuration ? styles.clientPlansFilterBtnActive : styles.clientPlansFilterBtn}
            >
              Customizado
            </button>
            {customDuration && (
              <input
                type="number"
                min="1"
                max="365"
                value={duration}
                onChange={(e) => setDuration(Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 7)))}
                className="sigma-input"
                style={{ width: 80 }}
              />
            )}
          </div>
        </div>

        <div className={styles.formField}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={usePin} onChange={(e) => setUsePin(e.target.checked)} />
            <LockIcon /> Proteger com PIN de 4 dígitos
          </label>
          {usePin && (
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              pattern="\d{4}"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              className="sigma-input"
              style={{ width: 120, fontFamily: 'var(--font-mono)', letterSpacing: '0.5em', textAlign: 'center', fontSize: '1rem', marginTop: 6 }}
            />
          )}
        </div>

        <div>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={generateLink}
            disabled={generating}
          >
            <LinkIcon /> {generating ? 'Gerando...' : 'Gerar link'}
          </button>
        </div>
      </div>

      {/* Resultado */}
      {generated && (
        <div className={styles.shareLinkGenerated}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--brand-300)' }}>
            <CheckIcon /> Link gerado
          </div>
          <div className={styles.shareLinkUrl}>{generated.link}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className={styles.btnSecondary} onClick={() => copyToClipboard(generated.link)}>
              <CopyIcon /> Copiar
            </button>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            Expira em: {formatDate(generated.expiresAt)}
            {generated.hasPassword && ' · Protegido por PIN'}
          </div>
        </div>
      )}

      {/* Histórico */}
      <div>
        <div className={styles.shareHistoryHeader}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Histórico de links
          </span>
          {tokens.length > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              {tokens.length} {tokens.length === 1 ? 'registro' : 'registros'}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>// carregando...</div>
        ) : tokens.length === 0 ? (
          <div className={styles.shareEmpty}>
            <LinkIconLg />
            <div className={styles.shareEmptyText}>Nenhum link gerado ainda. Configure a duração acima e clique em <strong style={{ color: 'var(--brand-300)' }}>Gerar link</strong>.</div>
          </div>
        ) : (
          <div className={styles.shareTokenList}>
            {tokens.map(t => {
              const cls = statusClass(t.status, t.expires_at);
              const isActive = cls === 'statusActive';
              return (
                <div key={t.id} className={styles.shareTokenCard}>
                  <div className={styles.shareTokenLeft}>
                    <span className={`${styles.shareTokenStatus} ${styles[cls]}`}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                      {statusLabel(t.status, t.expires_at)}
                    </span>
                    {t.has_password && (
                      <span className={styles.shareTokenPin} title="Protegido por PIN">
                        <LockIcon /> PIN
                      </span>
                    )}
                  </div>
                  <div className={styles.shareTokenMetrics}>
                    <span className={styles.shareTokenMetric}>
                      <EyeIcon />
                      <strong>{t.open_count || 0}</strong> aberturas
                    </span>
                    <span className={styles.shareTokenMetric}>
                      <ClockIcon />
                      Expira {formatDate(t.expires_at)}
                    </span>
                  </div>
                  <div className={styles.shareTokenActions}>
                    {isActive && (
                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={() => setPendingRevoke(t)}
                      >
                        Revogar
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.iconBtnDanger}
                      onClick={() => setPendingDelete(t)}
                      title="Remover do histórico"
                      aria-label="Remover do histórico"
                    >
                      <TrashIconSm />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de revogar (padrão do sistema) */}
      {pendingRevoke && (
        <RevokeLinkModal
          token={pendingRevoke}
          submitting={revoking}
          onCancel={() => setPendingRevoke(null)}
          onConfirm={confirmRevoke}
        />
      )}

      {/* Modal de remover do histórico */}
      {pendingDelete && (
        <DeleteLinkModal
          token={pendingDelete}
          submitting={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Manual de uso no topo da aba Compartilhar
───────────────────────────────────────────────────────────── */
function ShareManual() {
  return (
    <div className={styles.manualCard}>
      <div className={styles.manualIcon} aria-hidden="true">
        <ShareIcon />
      </div>
      <div className={styles.manualBody}>
        <div className={styles.manualTitle}>Manual de uso · Links de aprovação</div>
        <div className={styles.manualSubtitle}>
          Gere um link único para enviar ao cliente revisar e aprovar os criativos sem precisar de login.
          Links são únicos por planejamento — gerar um novo automaticamente revoga os anteriores.
        </div>
        <div className={styles.manualSteps}>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>01</span>
            <div className={styles.manualStepText}>
              <strong>Configure a duração</strong> do acesso (3, 7, 14 dias ou customizado). Após esse
              prazo o link expira automaticamente.
            </div>
          </div>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>02</span>
            <div className={styles.manualStepText}>
              <strong>Adicione um PIN</strong> de 4 dígitos para uma camada extra de proteção.
              Após 3 tentativas erradas o link bloqueia por 15 minutos.
            </div>
          </div>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>03</span>
            <div className={styles.manualStepText}>
              <strong>Copie a URL gerada</strong> e envie ao cliente pelo canal que preferir.
              Cada abertura fica registrada no histórico e dispara um evento no sininho.
            </div>
          </div>
          <div className={styles.manualStep}>
            <span className={styles.manualStepNum}>04</span>
            <div className={styles.manualStepText}>
              <strong>Revogue quando precisar</strong>. O link deixa de funcionar imediatamente
              e quem já tinha aberto não consegue mais visualizar.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Modal de revogar (padrão do sistema)
───────────────────────────────────────────────────────────── */
function RevokeLinkModal({ token, submitting, onCancel, onConfirm }) {
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconWarning}`} aria-hidden="true">
            <LinkSlashIcon />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Revogar link de aprovação</div>
            <div className={styles.modalHeaderDesc}>
              O link deixa de funcionar imediatamente. Quem já abriu vê uma tela de "link
              revogado" e não conseguirá mais aprovar peças.
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
              <div className={styles.deleteWarningTitle}>Tem certeza?</div>
              <div className={styles.deleteWarningText}>
                Este link já foi aberto <strong>{token.open_count || 0}</strong> {Number(token.open_count || 0) === 1 ? 'vez' : 'vezes'}.
                Após revogar, você pode gerar um novo link com nova validade e novo PIN se precisar
                reenviar para o cliente.
              </div>
              <div className={styles.deleteHint}>// status passa para "revogado" · ação irreversível</div>
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className={styles.btnDanger} onClick={onConfirm} disabled={submitting} style={{ padding: '8px 14px' }}>
            {submitting ? 'Revogando...' : 'Revogar link'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Modal de remover link do histórico (hard delete)
───────────────────────────────────────────────────────────── */
function DeleteLinkModal({ token, submitting, onCancel, onConfirm }) {
  const isActive = token.status === 'active' &&
    (!token.expires_at || new Date(token.expires_at).getTime() >= Date.now());
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className={styles.modalHeaderRich}>
          <div className={`${styles.modalHeaderIcon} ${styles.modalHeaderIconWarning}`} aria-hidden="true">
            <TrashIcon />
          </div>
          <div className={styles.modalHeaderText}>
            <div className={styles.modalHeaderTitle}>Remover link do histórico</div>
            <div className={styles.modalHeaderDesc}>
              O registro é apagado permanentemente. Aberturas, IP de primeira abertura
              e estatísticas ficam perdidas. Quem tentar abrir esse link verá "link inválido".
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
              <div className={styles.deleteWarningTitle}>Tem certeza?</div>
              <div className={styles.deleteWarningText}>
                {isActive
                  ? <>Este link ainda está <strong style={{ color: 'var(--success)' }}>ATIVO</strong>. Removê-lo antes de revogar pode confundir o cliente que tem o link aberto. Considere primeiro revogar.</>
                  : <>O link ja está revogado/expirado e não terá mais utilidade. Remover apenas limpa o histórico.</>}
                {' '}
                Aberturas registradas: <strong>{token.open_count || 0}</strong>.
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
            {submitting ? 'Removendo...' : 'Remover do histórico'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Icons
───────────────────────────────────────────────────────────── */
function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function LinkIconLg() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function LinkSlashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7A5 5 0 0 1 7 7" />
      <path d="M15 7h2a5 5 0 0 1 4 8" />
      <line x1="8" y1="12" x2="12" y2="12" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
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
