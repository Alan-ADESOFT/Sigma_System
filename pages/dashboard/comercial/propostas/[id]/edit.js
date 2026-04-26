/**
 * pages/dashboard/comercial/propostas/[id]/edit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor split-screen de proposta:
 *   · Esquerda: seções colapsáveis editáveis com botão "Gerar com IA" por seção.
 *   · Direita: preview live via <ProposalTemplate data={localData}/>.
 *   · Auto-save com debounce 1.5s.
 *   · Botões "Gerar tudo com IA" (drawer SSE) e "Publicar".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../../../components/DashboardLayout';
import ProposalTemplate from '../../../../../components/comercial/ProposalTemplate';
import AIStreamDrawer from '../../../../../components/comercial/AIStreamDrawer';
import PublishProposalModal from '../../../../../components/comercial/PublishProposalModal';
import ConfirmModal from '../../../../../components/comercial/ConfirmModal';
import { useNotification } from '../../../../../context/NotificationContext';
import styles from '../../../../../assets/style/proposalEditor.module.css';

const PROPOSAL_AI_PHASES = [
  { key: 'diagnostic',  label: 'Diagnóstico' },
  { key: 'opportunity', label: 'Oportunidade' },
  { key: 'pillars',     label: 'Pilares' },
  { key: 'projection',  label: 'Projeção' },
];

const ICON_AI = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15 9 22 9 16 14 18 21 12 17 6 21 8 14 2 9 9 9 12 2" />
  </svg>
);
const ICON_PLAY = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="6 4 20 12 6 20 6 4" />
  </svg>
);
const ICON_LOCK = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export default function ProposalEditPage() {
  const router = useRouter();
  const { notify } = useNotification();
  const { id } = router.query;
  const isEmbed = router.query.embed === '1';

  function handleBack() {
    if (isEmbed && typeof window !== 'undefined' && window.parent !== window) {
      // Modal-mode → notifica o parent pra fechar
      try { window.parent.postMessage('sigma:close-proposal-modal', '*'); } catch {}
      return;
    }
    router.push('/dashboard/comercial/propostas');
  }

  const [proposal, setProposal] = useState(null);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [savingState, setSavingState] = useState('idle'); // idle|saving|saved
  const saveTimerRef = useRef(null);
  const isFirstLoadRef = useRef(true);
  const [openSections, setOpenSections] = useState({
    cover: true, diagnostic: true, opportunity: true, pillars: true,
    scope: false, timeline: false, investment: true, projection: false,
    next: false, message: false,
  });

  // AI drawer state
  const [aiDrawerOpen, setAIDrawerOpen] = useState(false);
  const [aiJobId, setAIJobId] = useState(null);
  const [aiSections, setAISections] = useState(['diagnostic','opportunity','pillars','projection']);
  const [showPublish, setShowPublish] = useState(false);

  // Carrega proposta
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/comercial/proposals/${id}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setProposal(j.proposal);
          setData(j.proposal.data || {});
        } else {
          notify(j.error || 'Falha ao carregar', 'error');
        }
      })
      .finally(() => {
        setLoading(false);
        // Se URL tem ?ai=1, dispara automaticamente
        if (router.query.ai === '1') {
          setTimeout(() => startGenerateAll(), 600);
        }
      });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [id]);

  // Auto-save com debounce 1.5s
  useEffect(() => {
    if (!proposal || !data) return;
    if (isFirstLoadRef.current) { isFirstLoadRef.current = false; return; }
    setSavingState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/comercial/proposals/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        });
        const j = await res.json();
        if (!res.ok || !j.success) throw new Error(j.error || 'Falha ao salvar');
        setSavingState('saved');
        setTimeout(() => setSavingState('idle'), 1500);
      } catch (err) {
        notify('Falha no auto-save: ' + err.message, 'error');
        setSavingState('idle');
      }
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [data, id, proposal, notify]);

  function setField(key, value) {
    setData(prev => ({ ...prev, [key]: value }));
  }
  function setNestedField(path, value) {
    setData(prev => {
      const next = { ...prev };
      const parts = path.split('.');
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = { ...(cur[parts[i]] || {}) };
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  }

  function toggle(key) {
    setOpenSections(s => ({ ...s, [key]: !s[key] }));
  }

  // ── Generate AI ──
  const streamUrl = useCallback(
    (jobId) => `/api/comercial/proposals/${id}/generate-ai-stream?jobId=${encodeURIComponent(jobId)}`,
    [id]
  );

  const [pendingSection, setPendingSection] = useState(null);

  function startGenerateSection(section) {
    setPendingSection(section);
  }

  async function confirmGenerateSection() {
    const section = pendingSection;
    setPendingSection(null);
    if (!section) return;
    setAISections([section]);
    await launchAI([section]);
  }

  async function startGenerateAll() {
    setAISections(['diagnostic','opportunity','pillars','projection']);
    await launchAI(['diagnostic','opportunity','pillars','projection']);
  }

  async function launchAI(sections, opts = {}) {
    setAIDrawerOpen(true);
    setAIJobId(null);
    try {
      const res = await fetch(`/api/comercial/proposals/${id}/generate-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, force: !!opts.force }),
      });
      const j = await res.json();
      if (res.status === 429) {
        notify(j.error, 'warning');
        setAIDrawerOpen(false);
        return;
      }
      if (res.status === 409) {
        // Já gerado — backend bloqueou pra economizar tokens
        notify(j.error || 'Proposta já foi gerada com IA', 'warning', { duration: 6000 });
        setAIDrawerOpen(false);
        return;
      }
      if (!res.ok || !j.success) throw new Error(j.error || 'Falha');
      setAIJobId(j.jobId);
    } catch (err) {
      notify(err.message, 'error');
      setAIDrawerOpen(false);
    }
  }

  function handleAIDone() {
    // Recarrega proposta pra pegar dados atualizados pelo backend
    fetch(`/api/comercial/proposals/${id}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.proposal.data || {}); });
  }

  if (loading || !proposal || !data) {
    const loader = (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        Carregando proposta...
      </div>
    );
    if (isEmbed) return loader;
    return <DashboardLayout activeTab="comercial/propostas">{loader}</DashboardLayout>;
  }

  const aiPhasesForDrawer = aiSections.map(k => {
    const found = PROPOSAL_AI_PHASES.find(p => p.key === k);
    return found || { key: k, label: k };
  });

  const editorBody = (
    <>
      <div className={styles.shell}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <button className={styles.topbarBack} onClick={handleBack}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            {isEmbed ? 'Fechar' : 'Voltar'}
          </button>
          <div className={styles.topbarTitle}>
            Editar Proposta
            {data.client_name && <span className={styles.topbarSubtle}>· {data.client_name}</span>}
            <span className={`${styles.savingDot} ${savingState === 'saving' ? 'saving' : savingState === 'saved' ? 'saved' : ''}`}
                  title={savingState === 'saving' ? 'Salvando...' : savingState === 'saved' ? 'Salvo' : ''} />
          </div>
          {data.ai_generated_at ? (
            <button
              className="btn btn-secondary"
              disabled
              title={`Geração IA já executada em ${new Date(data.ai_generated_at).toLocaleString('pt-BR')}. Edite manualmente para preservar tokens.`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: 0.55, cursor: 'not-allowed' }}
            >
              {ICON_LOCK}
              IA já gerada · {new Date(data.ai_generated_at).toLocaleDateString('pt-BR')}
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={startGenerateAll}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {ICON_AI}
              Gerar tudo com IA
            </button>
          )}
          <button
            className="sigma-btn-primary"
            onClick={() => setShowPublish(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {ICON_PLAY}
            Publicar
          </button>
        </header>

        {/* Split */}
        <div className={styles.split}>
          {/* Editor */}
          <div className={styles.editor}>

            <Section
              keyId="cover" title="Cabeçalho" open={openSections.cover} onToggle={() => toggle('cover')}
            >
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Nome do cliente</label>
                  <input className="sigma-input" value={data.client_name || ''}
                         onChange={e => setField('client_name', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Doc ID</label>
                  <input className="sigma-input" value={data.doc_id || ''}
                         onChange={e => setField('doc_id', e.target.value)}
                         placeholder="ex: SIG-PROP-2026-0042" />
                </div>
              </div>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Logo URL</label>
                  <input className="sigma-input" value={data.client_logo_url || ''}
                         onChange={e => setField('client_logo_url', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Validade visual</label>
                  <input className="sigma-input" type="date"
                         value={data.valid_until ? String(data.valid_until).slice(0, 10) : ''}
                         onChange={e => setField('valid_until', e.target.value || null)} />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Pitch da capa (opcional)</label>
                <textarea className={styles.textarea} value={data.cover_pitch || ''}
                          onChange={e => setField('cover_pitch', e.target.value)}
                          placeholder="Frase curta abaixo do nome do cliente, 1-2 linhas." />
              </div>
            </Section>

            <Section
              keyId="diagnostic" title="Diagnóstico"
              open={openSections.diagnostic} onToggle={() => toggle('diagnostic')}
              onAI={data.ai_generated_at ? null : () => startGenerateSection('diagnostic')}
              aiLockedAt={data.ai_generated_at}
            >
              <textarea className={styles.textarea}
                        style={{ minHeight: 200 }}
                        value={data.diagnostic_text || ''}
                        onChange={e => setField('diagnostic_text', e.target.value)}
                        placeholder="3 parágrafos de prosa, último com <em>frase de impacto</em>." />
            </Section>

            <Section
              keyId="opportunity" title="Oportunidade"
              open={openSections.opportunity} onToggle={() => toggle('opportunity')}
              onAI={data.ai_generated_at ? null : () => startGenerateSection('opportunity')}
              aiLockedAt={data.ai_generated_at}
            >
              <textarea className={styles.textarea}
                        style={{ minHeight: 200 }}
                        value={data.opportunity_text || ''}
                        onChange={e => setField('opportunity_text', e.target.value)}
                        placeholder="2-3 parágrafos conectando gap → ação Sigma → resultado." />
            </Section>

            <Section
              keyId="pillars" title="3 Pilares"
              open={openSections.pillars} onToggle={() => toggle('pillars')}
              onAI={data.ai_generated_at ? null : () => startGenerateSection('pillars')}
              aiLockedAt={data.ai_generated_at}
            >
              {(data.pillars || []).map((p, i) => (
                <div key={i} className={styles.pillarBlock}>
                  <div className={styles.pillarHeader}>
                    <span className={styles.pillarNum}>
                      {p.icon_num || String(i + 1).padStart(2, '0')}
                    </span>
                    <input className="sigma-input" value={p.title || ''}
                           placeholder="Título do pilar"
                           onChange={e => setField('pillars',
                             data.pillars.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Descrição</label>
                    <textarea className={styles.textarea}
                              value={p.desc || ''}
                              onChange={e => setField('pillars',
                                data.pillars.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Bullets ({(p.bullets || []).length})</label>
                    <div className={styles.itemList}>
                      {(p.bullets || []).map((b, j) => (
                        <div key={j} className={styles.itemRow}>
                          <input className="sigma-input" value={b}
                                 onChange={e => setField('pillars',
                                   data.pillars.map((x, k) => k === i
                                     ? { ...x, bullets: x.bullets.map((bb, m) => m === j ? e.target.value : bb) }
                                     : x))} />
                          <button className={styles.removeBtn}
                                  onClick={() => setField('pillars',
                                    data.pillars.map((x, k) => k === i
                                      ? { ...x, bullets: x.bullets.filter((_, m) => m !== j) }
                                      : x))}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      ))}
                      <button className={styles.addBtn}
                              onClick={() => setField('pillars',
                                data.pillars.map((x, k) => k === i
                                  ? { ...x, bullets: [...(x.bullets || []), ''] }
                                  : x))}>+ bullet</button>
                    </div>
                  </div>
                </div>
              ))}
              <button className={styles.addBtn}
                      onClick={() => setField('pillars', [
                        ...(data.pillars || []),
                        { icon_num: String((data.pillars || []).length + 1).padStart(2, '0'),
                          title: '', desc: '', bullets: [] },
                      ])}>+ pilar</button>
            </Section>

            <Section
              keyId="scope" title="Escopo (opcional)"
              open={openSections.scope} onToggle={() => toggle('scope')}
            >
              <ItemListEditor
                items={data.scope_items || []}
                fields={['name', 'description', 'frequency', 'badge_type']}
                placeholders={['Nome', 'Descrição', 'Frequência', 'incluido|extra']}
                onChange={(arr) => setField('scope_items', arr)}
                addLabel="+ item de escopo"
              />
            </Section>

            <Section
              keyId="timeline" title="Cronograma (opcional)"
              open={openSections.timeline} onToggle={() => toggle('timeline')}
            >
              <ItemListEditor
                items={data.timeline || []}
                fields={['phase', 'title', 'desc']}
                placeholders={['Mês 1', 'Título', 'Descrição']}
                onChange={(arr) => setField('timeline', arr)}
                addLabel="+ fase"
              />
            </Section>

            <Section
              keyId="investment" title="Investimento"
              open={openSections.investment} onToggle={() => toggle('investment')}
            >
              <div className={styles.row3}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Valor mensal (R$)</label>
                  <input className="sigma-input" type="number"
                         value={data.investment?.full_price ?? ''}
                         onChange={e => setNestedField('investment.full_price',
                           e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Parcelado em</label>
                  <input className="sigma-input" type="number"
                         value={data.investment?.parcelado_count ?? ''}
                         onChange={e => setNestedField('investment.parcelado_count',
                           e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Valor da parcela (R$)</label>
                  <input className="sigma-input" type="number"
                         value={data.investment?.parcelado_value ?? ''}
                         onChange={e => setNestedField('investment.parcelado_value',
                           e.target.value ? Number(e.target.value) : null)} />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Itens inclusos (1 por linha)</label>
                <textarea className={styles.textarea}
                          value={(data.investment?.items || []).join('\n')}
                          onChange={e => setNestedField('investment.items',
                            e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} />
              </div>
            </Section>

            <Section
              keyId="projection" title="Projeção"
              open={openSections.projection} onToggle={() => toggle('projection')}
              onAI={data.ai_generated_at ? null : () => startGenerateSection('projection')}
              aiLockedAt={data.ai_generated_at}
            >
              <ItemListEditor
                items={data.projection_stats || []}
                fields={['label', 'value', 'desc']}
                placeholders={['ALCANCE', '+45%', 'Descrição curta']}
                onChange={(arr) => setField('projection_stats', arr)}
                addLabel="+ stat"
              />
              <div className={styles.field} style={{ marginTop: 10 }}>
                <label className={styles.fieldLabel}>Disclaimer</label>
                <textarea className={styles.textarea} style={{ minHeight: 60 }}
                          value={data.projection_disclaimer || ''}
                          onChange={e => setField('projection_disclaimer', e.target.value)} />
              </div>
            </Section>

            <Section
              keyId="next" title="Próximos passos (opcional)"
              open={openSections.next} onToggle={() => toggle('next')}
            >
              <ItemListEditor
                items={data.next_steps || []}
                fields={['step_number', 'title', 'desc']}
                placeholders={['01', 'Reunião de kick-off', 'Descrição']}
                onChange={(arr) => setField('next_steps', arr)}
                addLabel="+ passo"
              />
            </Section>

            <Section
              keyId="message" title="Mensagem WhatsApp (ao copiar)"
              open={openSections.message} onToggle={() => toggle('message')}
            >
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Variáveis: {'{nome}'}, {'{link}'}</label>
                <textarea className={styles.textarea} style={{ minHeight: 120 }}
                          value={data.custom_message || ''}
                          onChange={e => setField('custom_message', e.target.value)}
                          placeholder="Olá {nome}, segue a proposta SIGMA personalizada para você. Acesse pelo link: {link}" />
              </div>
            </Section>

          </div>

          {/* Preview */}
          <div className={styles.preview}>
            <ProposalTemplate data={data} />
          </div>
        </div>
      </div>

      {/* AI drawer */}
      {aiDrawerOpen && (
        <AIStreamDrawer
          title={aiSections.length === 1 ? `Gerando ${aiSections[0]}` : 'Gerando proposta'}
          phases={aiPhasesForDrawer}
          jobId={aiJobId}
          streamUrl={streamUrl}
          onDone={() => { handleAIDone(); }}
          onClose={() => setAIDrawerOpen(false)}
          onMinimize={() => {
            // Backend continua rodando (fire-and-forget no setImmediate).
            // Fechamos só a UI; quando terminar, o sininho dispara via system_notifications.
            setAIDrawerOpen(false);
            notify(
              'Geração rodando em segundo plano. Você será notificado quando terminar.',
              'info',
              { duration: 5500 }
            );
          }}
          footerActions={
            <button className="btn btn-secondary" onClick={() => setAIDrawerOpen(false)}>Fechar</button>
          }
        />
      )}

      {/* Publish modal */}
      {showPublish && (
        <PublishProposalModal
          proposal={{ ...proposal, data }}
          onClose={() => setShowPublish(false)}
          onPublished={() => {
            setShowPublish(false);
            // recarrega
            fetch(`/api/comercial/proposals/${id}`)
              .then(r => r.json())
              .then(j => { if (j.success) { setProposal(j.proposal); setData(j.proposal.data); } });
          }}
        />
      )}

      {/* Confirm generate IA por seção */}
      <ConfirmModal
        open={!!pendingSection}
        onClose={() => setPendingSection(null)}
        onConfirm={confirmGenerateSection}
        variant="ai"
        title={pendingSection ? `Regenerar "${pendingSection}" com IA?` : ''}
        description="O conteúdo atual desta seção será substituído pelo gerado pela IA. Use 'Cancelar' se quiser preservar o que está escrito."
        confirmLabel="Regenerar com IA"
        cancelLabel="Cancelar"
      />
    </>
  );

  if (isEmbed) return editorBody;
  return (
    <DashboardLayout activeTab="comercial/propostas">
      {editorBody}
    </DashboardLayout>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function Section({ keyId, title, open, onToggle, onAI, aiLockedAt, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader} onClick={onToggle}>
        <span className={`${styles.sectionToggle} ${open ? styles.sectionToggleOpen : ''}`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
        <span className={styles.sectionTitle}>{title}</span>
        {onAI && (
          <button
            className={styles.aiBtn}
            onClick={(e) => { e.stopPropagation(); onAI(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            {ICON_AI}
            Gerar com IA
          </button>
        )}
        {!onAI && aiLockedAt && (
          <span
            title={`IA já executada em ${new Date(aiLockedAt).toLocaleString('pt-BR')}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 8px', borderRadius: 4,
              border: '1px solid var(--border-default)',
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
              color: 'var(--text-muted)', letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {ICON_LOCK}
            IA gerada
          </span>
        )}
      </div>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

function ItemListEditor({ items, fields, placeholders = [], onChange, addLabel }) {
  function update(i, key, val) {
    const next = [...items];
    next[i] = { ...next[i], [key]: val };
    onChange(next);
  }
  function remove(i) { onChange(items.filter((_, j) => j !== i)); }
  function add() {
    const fresh = {};
    for (const f of fields) fresh[f] = '';
    onChange([...items, fresh]);
  }

  return (
    <div className={styles.itemList}>
      {items.map((it, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6, background: 'rgba(8,8,8,0.4)',
          border: '1px solid var(--border-default)',
          marginBottom: 6,
        }}>
          {fields.map((f, k) => (
            <div key={f} style={{ marginBottom: 6 }}>
              <input
                className="sigma-input"
                value={it[f] || ''}
                placeholder={placeholders[k] || f}
                onChange={e => update(i, f, e.target.value)}
                style={{ padding: '6px 10px', fontSize: '0.82rem' }}
              />
            </div>
          ))}
          <button className={styles.addBtn}
                  onClick={() => remove(i)}
                  style={{ borderColor: 'rgba(255,0,51,0.3)', color: 'var(--brand-400)' }}>
            Remover
          </button>
        </div>
      ))}
      <button className={styles.addBtn} onClick={add}>{addLabel}</button>
    </div>
  );
}
