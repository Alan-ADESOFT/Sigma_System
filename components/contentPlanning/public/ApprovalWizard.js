/**
 * components/contentPlanning/public/ApprovalWizard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wizard publico de aprovacao do planejamento — design SIGMA HUD.
 * Steps: welcome → review → notes → done
 *
 * Pontos-chave:
 *   • InstagramPreview recebe mediaType derivado de creative.type:
 *       post → IMAGE (1:1)  ·  carousel → IMAGE com dots
 *       reel → REELS (9:16) ·  story → STORIES (9:16, sem caption)
 *   • Story NAO mostra caption nem mensagem extra abaixo do preview.
 *   • Campo de observacoes/motivo so aparece quando o usuario clica em
 *     "Pedir ajuste" ou "Reprovar".
 *   • Zero emoji — todos icones sao SVG inline coerentes com o sidebar SIGMA.
 *   • Animacoes do brandbook: fadeInUp, scaleIn, glowPulse, radarPulse,
 *     stagger-in. Transicao entre criativos via key no container.
 *
 * Persistencia local + auto-save + retry queue + atalhos A/J/R + ←/→.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import styles from '../../../assets/style/publicApproval.module.css';

const InstagramPreview = dynamic(() => import('../../InstagramPreview'), { ssr: false });

const STORAGE_PREFIX = 'approval_';

const TYPE_META = {
  post:     { label: 'Post',     mediaType: 'IMAGE' },
  carousel: { label: 'Carrossel', mediaType: 'IMAGE' },
  reel:     { label: 'Reel',     mediaType: 'REELS' },
  story:    { label: 'Story',    mediaType: 'STORIES' },
};

/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */

function loadDraft(token) {
  if (typeof window === 'undefined' || !token) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + token);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveDraft(token, data) {
  if (typeof window === 'undefined' || !token) return;
  try { localStorage.setItem(STORAGE_PREFIX + token, JSON.stringify(data)); } catch {}
}
function clearDraft(token) {
  if (typeof window === 'undefined' || !token) return;
  try { localStorage.removeItem(STORAGE_PREFIX + token); } catch {}
}
function formatDateLong(d, time) {
  if (!d) return null;
  try {
    const dt = new Date(typeof d === 'string' ? `${String(d).slice(0, 10)}T00:00:00` : d);
    const day = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    const t = time ? ` · ${time}` : '';
    return `${day.charAt(0).toUpperCase() + day.slice(1)}${t}`;
  } catch { return null; }
}
function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.post;
}

/* ─────────────────────────────────────────────────────────────
   Wizard root
───────────────────────────────────────────────────────────── */

export default function ApprovalWizard({ token, plan, creatives: initialCreatives, pin, onSaveStatus }) {
  const [step, setStep] = useState('welcome');
  const [creatives, setCreatives] = useState(initialCreatives || []);
  const [activeIdx, setActiveIdx] = useState(0);

  const [decisions, setDecisions] = useState(() => {
    const draft = loadDraft(token) || {};
    const base = {};
    for (const c of (initialCreatives || [])) {
      if (c.client_decision) {
        base[c.id] = {
          decision: c.client_decision,
          rating: c.client_rating,
          reason: c.client_reason || '',
          notes: c.client_notes || '',
        };
      }
    }
    return { ...base, ...(draft.decisions || {}) };
  });
  const [generalNotes, setGeneralNotes] = useState(() => loadDraft(token)?.generalNotes || '');
  const [errorBanner, setErrorBanner] = useState(null);
  const [editingId, setEditingId] = useState(null); // criativo em modo edição (override read-only)

  const retryQueueRef = useRef([]);
  const retryTimerRef = useRef(null);

  /* Persistência local */
  useEffect(() => {
    saveDraft(token, { decisions, generalNotes, step, activeIdx });
  }, [token, decisions, generalNotes, step, activeIdx]);

  /* beforeunload se há decisões e não chegou ao done */
  useEffect(() => {
    function onBeforeUnload(e) {
      if (Object.keys(decisions).length > 0 && step !== 'done') {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [decisions, step]);

  /* Atalhos de teclado */
  useEffect(() => {
    if (step !== 'review') return;
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
      const cur = creatives[activeIdx];
      if (!cur) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setActiveIdx(i => Math.min(creatives.length - 1, i + 1)); }
      else if (/^[aA]$/.test(e.key)) { e.preventDefault(); setEditingId(cur.id); applyDecision(cur, 'approved'); }
      else if (/^[rR]$/.test(e.key)) { e.preventDefault(); setEditingId(cur.id); applyDecision(cur, 'rejected'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, activeIdx, creatives]);

  /* Submit + retry */
  async function submitDecision(creativeId, payload) {
    onSaveStatus?.('saving');
    try {
      const r = await fetch('/api/public/content-plan/submit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          pin: pin || undefined,
          creativeId,
          decision: payload.decision,
          rating: payload.rating || null,
          reason: payload.reason || null,
          notes: payload.notes || null,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || d.reason || 'erro');
      setCreatives(prev => prev.map(c => c.id === creativeId
        ? { ...c, client_decision: d.creative.client_decision, client_rating: d.creative.client_rating }
        : c
      ));
      onSaveStatus?.('saved');
      setErrorBanner(null);
      return true;
    } catch {
      onSaveStatus?.('error');
      retryQueueRef.current.push({ creativeId, payload });
      scheduleRetry();
      setErrorBanner('Erro ao salvar — tentando novamente em 5s');
      return false;
    }
  }
  function scheduleRetry() {
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(async () => {
      retryTimerRef.current = null;
      const queue = retryQueueRef.current.splice(0);
      for (const item of queue) {
        const ok = await submitDecision(item.creativeId, item.payload);
        if (!ok) break;
      }
    }, 5000);
  }

  function applyDecision(creative, newDecision) {
    setDecisions(prev => {
      const cur = prev[creative.id] || {};
      const next = {
        ...prev,
        [creative.id]: { ...cur, decision: newDecision, rating: cur.rating ?? null, reason: cur.reason || '', notes: cur.notes || '' },
      };
      const needsReason = newDecision === 'rejected' || newDecision === 'adjust';
      const payload = next[creative.id];
      if (!needsReason || (payload.reason && payload.reason.trim().length > 0)) {
        submitDecision(creative.id, payload);
      }
      return next;
    });
  }
  function patchDecision(creativeId, patch) {
    setDecisions(prev => ({ ...prev, [creativeId]: { ...(prev[creativeId] || {}), ...patch } }));
  }

  /* Auto-save debounced de campos texto */
  const debounceRef = useRef(null);
  useEffect(() => {
    if (!creatives.length) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      for (const [creativeId, payload] of Object.entries(decisions)) {
        if (!payload.decision) continue;
        const needsReason = payload.decision === 'rejected' || payload.decision === 'adjust';
        if (needsReason && (!payload.reason || !payload.reason.trim())) continue;
        const current = creatives.find(c => c.id === creativeId);
        if (
          current &&
          current.client_decision === payload.decision &&
          (current.client_rating || null) === (payload.rating || null) &&
          (current.client_reason || '') === (payload.reason || '') &&
          (current.client_notes || '') === (payload.notes || '')
        ) continue;
        submitDecision(creativeId, payload);
      }
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisions]);

  /* Finalize */
  async function finalize() {
    onSaveStatus?.('saving');
    try {
      const r = await fetch('/api/public/content-plan/finalize-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin: pin || undefined, generalNotes: generalNotes || null }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'erro');
      onSaveStatus?.('saved');
      clearDraft(token);
      setStep('done');
    } catch {
      onSaveStatus?.('error');
      setErrorBanner('Erro ao finalizar — tente novamente em alguns segundos');
    }
  }

  /* Resumo (adjust legacy é tratado como rejected) */
  const summary = useMemo(() => {
    let approved = 0, rejected = 0;
    for (const c of creatives) {
      const dec = decisions[c.id]?.decision || c.client_decision;
      if (dec === 'approved') approved++;
      else if (dec === 'rejected' || dec === 'adjust') rejected++;
    }
    return { approved, rejected, decided: approved + rejected, total: creatives.length };
  }, [creatives, decisions]);

  /* ─── Welcome ─── */
  if (step === 'welcome') {
    return (
      <div className={`${styles.card} animate-fade-in-up`}>
        <WelcomeContent plan={plan} total={creatives.length} onStart={() => setStep('review')} />
      </div>
    );
  }

  /* ─── Review ─── */
  if (step === 'review') {
    const current = creatives[activeIdx];
    if (!current) {
      return (
        <div className={styles.card}>
          <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>// nenhum criativo neste planejamento</p>
        </div>
      );
    }
    const tMeta = typeMeta(current.type);
    const isStory = current.type === 'story';
    const local = decisions[current.id] || {};
    const rawDecision = local.decision || current.client_decision || null;
    // Normaliza adjust legacy para rejected (mas mantemos no DB pra histórico)
    const decisionValue = rawDecision === 'adjust' ? 'rejected' : rawDecision;
    const reasonValue = local.reason ?? current.client_reason ?? '';
    const notesValue = local.notes ?? current.client_notes ?? '';
    const ratingValue = local.rating ?? current.client_rating ?? 0;
    const needsReason = decisionValue === 'rejected';
    const reasonOk = !needsReason || (reasonValue && reasonValue.trim().length > 0);
    const isLast = activeIdx === creatives.length - 1;
    const canAdvance = !!decisionValue && reasonOk;
    // Modo leitura: tem decisão E não está em edição forçada
    const inReadMode = !!rawDecision && editingId !== current.id;

    function setDecisionFromBtn(newDec) {
      patchDecision(current.id, { decision: newDec });
      const localNeedsReason = newDec === 'rejected';
      const payload = {
        decision: newDec,
        rating: ratingValue || null,
        reason: localNeedsReason ? reasonValue : '',
        notes: notesValue || '',
      };
      // Aprovado submete imediatamente; reprovado precisa do motivo
      if (!localNeedsReason || (reasonValue && reasonValue.trim())) {
        submitDecision(current.id, payload);
        // Sai do modo edição para mostrar resumo
        setEditingId(null);
      }
    }
    function nextOrFinalize() {
      if (isLast) setStep('notes');
      else setActiveIdx(i => Math.min(creatives.length - 1, i + 1));
    }

    const progressPct = (summary.decided / Math.max(1, summary.total)) * 100;

    return (
      <div className={styles.reviewLayout}>
        <Sidebar
          creatives={creatives}
          decisions={decisions}
          activeIdx={activeIdx}
          onSelect={setActiveIdx}
        />

        <div className={styles.reviewMain}>
          {/* Contexto do plano — Promessa, Objetivo, Estratégia */}
          <PlanContext plan={plan} />

          {/* HUD progress */}
          <div className={`${styles.reviewProgressCard} animate-fade-in-up`}>
            <div className={styles.reviewProgressInfo}>
              <span className={styles.reviewProgressLabel}>
                <SignalIcon /> Progresso da revisão
              </span>
              <span className={styles.reviewProgressPct}>
                <strong>{summary.decided}</strong>
                <span style={{ opacity: 0.5 }}> / {summary.total}</span>
                <span className={styles.reviewProgressDelta}> · {Math.round(progressPct)}%</span>
              </span>
            </div>
            <div className={styles.reviewProgressBar}>
              <div className={styles.reviewProgressFill} style={{ width: `${progressPct}%` }} />
              <div className={styles.reviewProgressScan} />
            </div>
            <div className={styles.reviewProgressChips}>
              <ProgressChip kind="approved" count={summary.approved} />
              <ProgressChip kind="rejected" count={summary.rejected} />
            </div>
          </div>

          {/* Card do criativo — key força animação fadeInUp ao trocar */}
          <div key={current.id} className={`${styles.creativeCard} animate-fade-in-up`}>
            <div className={styles.creativeCardHeader}>
              <div className={styles.creativeCardMeta}>
                <span className={styles.creativeCardIndex}>
                  #{String(activeIdx + 1).padStart(2, '0')}
                </span>
                <span className={`${styles.creativeTypePill} ${styles[`typePill_${current.type || 'post'}`] || ''}`}>
                  <TypeIcon kind={current.type} />
                  {tMeta.label.toUpperCase()}
                </span>
                {formatDateLong(current.scheduled_for, current.scheduled_time) && (
                  <span className={styles.creativeCardDate}>
                    <CalendarIcon />
                    {formatDateLong(current.scheduled_for, current.scheduled_time)}
                  </span>
                )}
              </div>
              {decisionValue && <DecisionBadge decision={decisionValue} />}
            </div>

            {/* Preview do Instagram com mediaType correto por tipo */}
            <div className={styles.previewWrapper}>
              <CreativePreview
                creative={current}
                mediaType={tMeta.mediaType}
                isStory={isStory}
                account={{ username: plan?.client?.company_name || 'cliente' }}
              />
            </div>

            {/* Caption full SOMENTE se NÃO for story */}
            {!isStory && current.caption && (
              <div className={styles.captionFull}>{current.caption}</div>
            )}

            <div className={styles.dividerSweep} aria-hidden="true" />

            {inReadMode ? (
              /* ─ MODO LEITURA: peça já decidida ─ */
              <DecisionReadOnly
                decision={decisionValue}
                rating={ratingValue}
                reason={reasonValue}
                notes={notesValue}
                onChangeStatus={() => setEditingId(current.id)}
              />
            ) : (
              <>
                {/* Decision buttons — só Aprovar / Reprovar */}
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>
                    <ZapIcon /> Sua avaliação
                  </span>
                  <div className={styles.decisionRowDual}>
                    <button
                      type="button"
                      className={`${styles.decisionBtn} ${styles.actionBtnApprove} ${decisionValue === 'approved' ? styles.actionBtnSelected : ''}`}
                      onClick={() => setDecisionFromBtn('approved')}
                      aria-pressed={decisionValue === 'approved'}
                    >
                      <CheckIcon size={18} />
                      <span className={styles.decisionLabel}>Aprovar</span>
                      <span className={styles.decisionShortcut}>tecla A</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.decisionBtn} ${styles.actionBtnReject} ${decisionValue === 'rejected' ? styles.actionBtnSelected : ''}`}
                      onClick={() => setDecisionFromBtn('rejected')}
                      aria-pressed={decisionValue === 'rejected'}
                    >
                      <XIcon size={18} />
                      <span className={styles.decisionLabel}>Reprovar</span>
                      <span className={styles.decisionShortcut}>tecla R</span>
                    </button>
                  </div>
                </div>

                {/* Rating sempre visível */}
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>
                    <StarIcon /> Nota
                  </span>
                  <div className={styles.starRow} role="group" aria-label="Nota de 1 a 5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        className={`${styles.star} ${ratingValue >= n ? styles.starOn : ''}`}
                        onClick={() => patchDecision(current.id, { rating: ratingValue === n ? 0 : n })}
                        aria-label={`${n} estrela${n === 1 ? '' : 's'}`}
                      >
                        <StarIconFilled active={ratingValue >= n} />
                      </button>
                    ))}
                    {ratingValue > 0 && (
                      <span className={styles.ratingHint}>{ratingValue} de 5</span>
                    )}
                  </div>
                </div>

                {/* Motivo + Observações — só com decisão Reprovar */}
                {needsReason && (
                  <div className={styles.feedbackPanel}>
                    <div className={styles.feedbackPanelHeader}>
                      <AlertIcon />
                      <span>Por que está reprovando?</span>
                    </div>

                    <div className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>
                        Motivo <span className={styles.fieldRequired}>*</span>
                      </span>
                      <textarea
                        className={styles.textarea}
                        rows={3}
                        value={reasonValue}
                        onChange={(e) => patchDecision(current.id, { reason: e.target.value })}
                        placeholder="Descreva o que precisa ser ajustado ou o motivo da reprovação..."
                        autoFocus
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>Observações (opcional)</span>
                      <textarea
                        className={styles.textarea}
                        rows={2}
                        value={notesValue}
                        onChange={(e) => patchDecision(current.id, { notes: e.target.value })}
                        placeholder="Comentários extras, exemplos, referências..."
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Nav */}
            <div className={styles.navRow}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                disabled={activeIdx === 0}
              >
                <ArrowLeftIcon /> Anterior
              </button>
              <span className={styles.navCounter}>
                <strong>{activeIdx + 1}</strong>
                <span style={{ opacity: 0.4 }}> / {creatives.length}</span>
              </span>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={nextOrFinalize}
                disabled={!canAdvance && !inReadMode}
                title={(canAdvance || inReadMode) ? '' : 'Selecione uma decisão (e justifique se for reprovar)'}
              >
                {isLast ? 'Finalizar revisão' : 'Próximo'}
                {!isLast && <ArrowRightIcon />}
              </button>
            </div>
          </div>
        </div>

        {errorBanner && <div className={styles.errorBanner}>{errorBanner}</div>}
      </div>
    );
  }

  /* ─── Notes ─── */
  if (step === 'notes') {
    return (
      <div className={`${styles.card} animate-fade-in-up`}>
        <div className={styles.welcomeBadge}>
          <PulseDot /> ÚLTIMO PASSO
        </div>
        <h1 className={styles.welcomeTitle} style={{ marginTop: 12 }}>Quase lá.</h1>
        <p className={styles.statusDesc} style={{ marginBottom: 8, textAlign: 'left' }}>
          Tem alguma observação geral sobre o planejamento como um todo? Esse é o momento
          de deixar comentários sobre o conjunto, sugestões para o próximo mês ou ajustes
          globais que afetam várias peças.
        </p>

        <div className={styles.fieldGroup} style={{ marginTop: 18 }}>
          <span className={styles.fieldLabel}>
            <PencilIcon size={11} /> Observações gerais (opcional)
          </span>
          <textarea
            className={styles.textarea}
            rows={6}
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            placeholder="Comentários sobre o conjunto, sugestões para o próximo mês, ajustes globais..."
          />
        </div>

        <div className={styles.navRow}>
          <button type="button" className={styles.btnSecondary} onClick={() => setStep('review')}>
            <ArrowLeftIcon /> Voltar à revisão
          </button>
          <button type="button" className={styles.btnPrimary} onClick={finalize}>
            Enviar feedback final <ArrowRightIcon />
          </button>
        </div>

        {errorBanner && <div className={styles.errorBanner}>{errorBanner}</div>}
      </div>
    );
  }

  /* ─── Done ─── */
  return (
    <div className={`${styles.card} ${styles.doneCard} animate-scale-in`}>
      <div className={styles.doneIconWrap}>
        <div className={styles.doneRadar} />
        <div className={styles.doneRadar} style={{ animationDelay: '0.6s' }} />
        <div className={styles.doneIcon} aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
      <h1 className={styles.statusTitle}>Feedback enviado.</h1>
      <p className={styles.statusDesc}>
        A equipe SIGMA já recebeu suas decisões e vai trabalhar nas alterações
        solicitadas. Em breve enviaremos a versão atualizada para nova revisão.
      </p>

      <div className={styles.doneStats} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className={`${styles.doneStatCard} animate-fade-in-up stagger-1`}>
          <div className={`${styles.doneStatValue} ${styles.statApproved}`}>{summary.approved}</div>
          <div className={styles.doneStatLabel}>Aprovados</div>
        </div>
        <div className={`${styles.doneStatCard} animate-fade-in-up stagger-2`}>
          <div className={`${styles.doneStatValue} ${styles.statRejected}`}>{summary.rejected}</div>
          <div className={styles.doneStatLabel}>Reprovados</div>
        </div>
      </div>

      <div className={styles.statusHint}>// pode fechar esta janela</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Preview do criativo — usa InstagramPreview, mas envolve em
   navegação custom quando o tipo é carousel com múltiplas mídias.
───────────────────────────────────────────────────────────── */

function CreativePreview({ creative, mediaType, isStory, account }) {
  const allUrls = Array.isArray(creative.media_urls) ? creative.media_urls : [];
  const isCarousel = creative.type === 'carousel' && allUrls.length > 1;
  const [idx, setIdx] = useState(0);

  // Reset ao trocar de criativo
  useEffect(() => { setIdx(0); }, [creative.id]);

  if (!isCarousel) {
    return (
      <InstagramPreview
        mode="post"
        mediaType={mediaType}
        imageUrls={allUrls}
        videoUrl={creative.video_url}
        caption={isStory ? '' : creative.caption}
        account={account}
      />
    );
  }

  // Carousel: passa só a imagem ativa para o InstagramPreview e adiciona nav externa
  function prev(e) {
    e.stopPropagation();
    setIdx(i => (i - 1 + allUrls.length) % allUrls.length);
  }
  function next(e) {
    e.stopPropagation();
    setIdx(i => (i + 1) % allUrls.length);
  }

  return (
    <div className={styles.carouselFrame}>
      <InstagramPreview
        mode="post"
        mediaType={mediaType}
        imageUrls={[allUrls[idx]]}
        videoUrl={null}
        caption={creative.caption}
        account={account}
      />

      {/* Setas */}
      <button
        type="button"
        className={`${styles.carouselArrow} ${styles.carouselArrowLeft}`}
        onClick={prev}
        aria-label="Imagem anterior"
      >
        <CarouselArrow direction="left" />
      </button>
      <button
        type="button"
        className={`${styles.carouselArrow} ${styles.carouselArrowRight}`}
        onClick={next}
        aria-label="Próxima imagem"
      >
        <CarouselArrow direction="right" />
      </button>

      {/* Dots clicáveis */}
      <div className={styles.carouselDots}>
        {allUrls.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => { e.stopPropagation(); setIdx(i); }}
            className={`${styles.carouselDot} ${i === idx ? styles.carouselDotActive : ''}`}
            aria-label={`Ir para imagem ${i + 1}`}
            aria-current={i === idx ? 'true' : undefined}
          />
        ))}
      </div>

      {/* Contador */}
      <div className={styles.carouselCounter}>
        <span style={{ color: 'var(--text-primary)' }}>{idx + 1}</span>
        <span style={{ opacity: 0.5 }}> / {allUrls.length}</span>
      </div>
    </div>
  );
}

function CarouselArrow({ direction }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {direction === 'left' ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Welcome
───────────────────────────────────────────────────────────── */

function WelcomeContent({ plan, total, onStart }) {
  return (
    <>
      <div className={styles.welcomeHero}>
        <div className={styles.welcomeBadge}>
          <PulseDot /> Aprovação · planejamento de conteúdo
        </div>
        {plan?.client?.company_name && (
          <div className={styles.welcomeClient}>{plan.client.company_name}</div>
        )}
        <h1 className={styles.welcomeTitle}>{plan?.title || 'Planejamento'}</h1>
        <div className={styles.welcomeUnderline} />
      </div>

      {plan?.central_promise && (
        <div className={`${styles.infoBlock} animate-fade-in-up stagger-1`}>
          <div className={styles.infoLabel}><TargetIcon /> Promessa do mês</div>
          <div className={styles.infoValue}>{plan.central_promise}</div>
        </div>
      )}

      {plan?.objective && (
        <div className={`${styles.infoBlock} animate-fade-in-up stagger-2`}>
          <div className={styles.infoLabel}><FlagIcon /> Objetivo</div>
          <div className={styles.infoValue}>{plan.objective}</div>
        </div>
      )}

      {plan?.strategy_notes && (
        <div className={`${styles.infoBlock} animate-fade-in-up stagger-3`}>
          <div className={styles.infoLabel}><MapIcon /> Estratégia</div>
          <div className={styles.infoValue}>{plan.strategy_notes}</div>
        </div>
      )}

      <div className={styles.welcomeStats}>
        <PackageIcon />
        <strong style={{ color: 'var(--text-primary)' }}>{total}</strong>
        <span>{total === 1 ? 'criativo' : 'criativos'} para revisar</span>
      </div>

      <div className={styles.welcomeCta}>
        <button type="button" className={`${styles.btnPrimary} ${styles.btnPrimaryHero}`} onClick={onStart}>
          Iniciar revisão <ArrowRightIcon />
        </button>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   PlanContext — bloco com os 3 pilares (acima do progress)
   Acordeão: começa com a primeira aberta, as outras colapsadas.
───────────────────────────────────────────────────────────── */

function PlanContext({ plan }) {
  const items = [
    { id: 'promise',   label: 'Promessa central', text: plan?.central_promise, Icon: TargetIcon,
      hint: 'Em uma frase: o benefício que o público recebe seguindo o plano.' },
    { id: 'objective', label: 'Objetivo do mês', text: plan?.objective, Icon: FlagIcon,
      hint: 'A meta concreta — em número, ação ou resultado mensurável.' },
    { id: 'strategy',  label: 'Estratégia',      text: plan?.strategy_notes, Icon: MapIcon,
      hint: 'Como o conteúdo vai chegar lá — pilares, formatos, tom de voz.' },
  ].filter(i => i.text && String(i.text).trim().length > 0);

  const [openId, setOpenId] = useState(items[0]?.id || null);

  if (items.length === 0) return null;

  return (
    <div className={`${styles.planContext} animate-fade-in-up`}>
      <div className={styles.planContextHeader}>
        <span className={styles.planContextTitle}>
          <CompassIcon /> Contexto do plano
        </span>
        <span className={styles.planContextHint}>Toque em cada pilar para expandir</span>
      </div>

      <div className={styles.planContextItems}>
        {items.map(({ id, label, text, hint, Icon }) => {
          const isOpen = openId === id;
          return (
            <button
              key={id}
              type="button"
              className={`${styles.planContextItem} ${isOpen ? styles.planContextItemOpen : ''}`}
              onClick={() => setOpenId(prev => prev === id ? null : id)}
              aria-expanded={isOpen}
            >
              <div className={styles.planContextItemHead}>
                <span className={styles.planContextItemLabel}>
                  <Icon /> {label}
                </span>
                <span className={styles.planContextItemChevron} aria-hidden="true">
                  <ChevronDownIcon rotated={isOpen} />
                </span>
              </div>
              <div className={`${styles.planContextItemBody} ${isOpen ? styles.planContextItemBodyOpen : ''}`}>
                <div className={styles.planContextItemHint}>{hint}</div>
                <div className={styles.planContextItemText}>{text}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompassIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function ChevronDownIcon({ rotated }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: rotated ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sidebar de criativos (com ícones de tipo + status)
───────────────────────────────────────────────────────────── */

function Sidebar({ creatives, decisions, activeIdx, onSelect }) {
  // Separa em pendentes e decididos preservando o índice original
  const indexed = creatives.map((c, i) => {
    const dec = decisions[c.id]?.decision || c.client_decision;
    return { c, i, dec };
  });
  const pending  = indexed.filter(x => !x.dec);
  const decided  = indexed.filter(x =>  x.dec);

  function renderItem({ c, i, dec }, animDelay) {
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => onSelect(i)}
        className={`${styles.sidebarItem} ${i === activeIdx ? styles.sidebarItemActive : ''} ${dec ? styles.sidebarItemDecided : ''} animate-fade-in-up`}
        style={{ animationDelay: `${animDelay}ms` }}
        aria-current={i === activeIdx ? 'true' : undefined}
      >
        <DecisionDot decision={dec} />
        <span className={styles.sidebarIndex}>{String(i + 1).padStart(2, '0')}</span>
        <span className={styles.sidebarTypeIcon}><TypeIcon kind={c.type} /></span>
        <span className={styles.sidebarLabel}>
          {(typeMeta(c.type).label)}
          {c.scheduled_for && (
            <span className={styles.sidebarDate}>
              {String(c.scheduled_for).slice(8, 10)}/{String(c.scheduled_for).slice(5, 7)}
            </span>
          )}
        </span>
        {i === activeIdx && <ArrowRightIcon size={11} />}
      </button>
    );
  }

  return (
    <nav className={`${styles.sidebarList} animate-slide-in-left`} aria-label="Navegação entre criativos">
      <div className={styles.sidebarTitle}>
        <span className={styles.sidebarTitleDot} /> CRIATIVOS · {creatives.length}
      </div>

      <div className={styles.sidebarItems}>
        {pending.length > 0 && (
          <>
            <div className={styles.sidebarGroupLabel}>
              <span className={styles.sidebarGroupDot} />
              PENDENTES · {pending.length}
            </div>
            {pending.map((x, n) => renderItem(x, Math.min(n, 8) * 50))}
          </>
        )}

        {decided.length > 0 && (
          <>
            <div className={`${styles.sidebarGroupLabel} ${styles.sidebarGroupLabelDone}`}>
              <span className={`${styles.sidebarGroupDot} ${styles.sidebarGroupDotDone}`} />
              JÁ REVISADAS · {decided.length}
            </div>
            {decided.map((x, n) => renderItem(x, Math.min(pending.length + n, 8) * 50))}
          </>
        )}
      </div>
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────────
   Subcomponentes
───────────────────────────────────────────────────────────── */

function ProgressChip({ kind, count }) {
  const cfg = {
    approved: { label: 'Aprovados', cls: styles.chipApproved, Icon: CheckIcon },
    rejected: { label: 'Reprovados', cls: styles.chipRejected, Icon: XIcon },
  }[kind];
  if (!cfg) return null;
  const { Icon } = cfg;
  return (
    <span className={`${styles.progressChip} ${cfg.cls}`}>
      <Icon size={11} />
      <strong>{count}</strong>
      <span>{cfg.label}</span>
    </span>
  );
}

function DecisionBadge({ decision }) {
  // 'adjust' legacy é tratado como rejected
  const norm = decision === 'adjust' ? 'rejected' : decision;
  const cfg = {
    approved: { label: 'Aprovado',  cls: styles.decisionBadgeApproved, Icon: CheckIcon },
    rejected: { label: 'Reprovado', cls: styles.decisionBadgeRejected, Icon: XIcon },
  }[norm];
  if (!cfg) return null;
  const { Icon } = cfg;
  return (
    <span className={`${styles.decisionBadge} ${cfg.cls}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function DecisionDot({ decision }) {
  const norm = decision === 'adjust' ? 'rejected' : decision;
  const map = {
    approved: styles.sidebarDotApproved,
    rejected: styles.sidebarDotRejected,
  };
  return <span className={`${styles.sidebarDot} ${map[norm] || ''}`} aria-hidden="true" />;
}

/* ─ Bloco read-only quando peça já foi decidida ─ */
function DecisionReadOnly({ decision, rating, reason, notes, onChangeStatus }) {
  const isApproved = decision === 'approved';
  return (
    <div className={`${styles.readOnlyBlock} ${isApproved ? styles.readOnlyApproved : styles.readOnlyRejected}`}>
      <div className={styles.readOnlyHeader}>
        <span className={styles.readOnlyIcon}>
          {isApproved ? <CheckIcon size={18} /> : <XIcon size={18} />}
        </span>
        <div className={styles.readOnlyHeaderText}>
          <div className={styles.readOnlyTitle}>
            Você {isApproved ? 'aprovou' : 'reprovou'} esta peça
          </div>
          {rating > 0 && (
            <div className={styles.readOnlyRating}>
              {[1,2,3,4,5].map(n => (
                <StarIconFilled key={n} active={rating >= n} />
              ))}
              <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#F59E0B' }}>
                {rating} de 5
              </span>
            </div>
          )}
        </div>
      </div>

      {!isApproved && reason && (
        <div className={styles.readOnlyField}>
          <div className={styles.readOnlyFieldLabel}>Motivo</div>
          <div className={styles.readOnlyFieldText}>{reason}</div>
        </div>
      )}

      {!isApproved && notes && (
        <div className={styles.readOnlyField}>
          <div className={styles.readOnlyFieldLabel}>Observações</div>
          <div className={styles.readOnlyFieldText}>{notes}</div>
        </div>
      )}

      <button
        type="button"
        className={styles.changeStatusBtn}
        onClick={onChangeStatus}
      >
        <RefreshIcon /> Mudar status
      </button>
    </div>
  );
}

function RefreshIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function PulseDot() {
  return (
    <span className={styles.pulseDot}>
      <span className={styles.pulseDotInner} />
      <span className={styles.pulseDotRipple} />
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Icons (SVG inline — todos coerentes com o sidebar SIGMA)
───────────────────────────────────────────────────────────── */

function CheckIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function XIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function PencilIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function ArrowLeftIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}
function ArrowRightIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
function CalendarIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function ZapIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function StarIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function StarIconFilled({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24"
      fill={active ? '#F59E0B' : 'none'}
      stroke={active ? '#F59E0B' : 'currentColor'}
      strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function AlertIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
function SignalIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16.1A5 5 0 0 1 5.9 20" />
      <path d="M2 12.05A9 9 0 0 1 9.95 20" />
      <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-9" />
      <line x1="2" y1="20" x2="2.01" y2="20" />
    </svg>
  );
}
function TargetIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function FlagIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}
function MapIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}
function PackageIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
function TypeIcon({ kind, size = 12 }) {
  if (kind === 'reel') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </svg>
    );
  }
  if (kind === 'carousel') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="13" height="13" rx="2" />
        <path d="M21 11v8a2 2 0 0 1-2 2h-8" />
      </svg>
    );
  }
  if (kind === 'story') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <circle cx="12" cy="18" r="0.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
