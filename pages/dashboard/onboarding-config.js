/**
 * pages/dashboard/onboarding-config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tela admin para gerenciar a configuração do onboarding por etapas.
 *
 * Permite:
 *   1. Visualizar a timeline completa de 15 dias (12 etapas + 3 descansos)
 *   2. Editar título, descrição, vídeo URL e perguntas de cada etapa
 *   3. Editar a mensagem WhatsApp dos dias de descanso
 *
 * O editor de perguntas é simples — cada pergunta é uma linha com label,
 * tipo e flags. Editar opções de checkbox/radio é via textarea (uma por linha).
 * Pra adicionar pergunta nova, basta clicar no botão +.
 *
 * NOTA: a edição é PARCIAL no PUT — só os campos enviados são atualizados.
 * Os IDs das perguntas são usados como chave; mudar um ID quebra respostas
 * existentes (não fazemos verificação aqui — o admin sabe o que está fazendo).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useNotification } from '../../context/NotificationContext';
import styles from '../../assets/style/onboarding.module.css';

export default function OnboardingConfigPage() {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [stages, setStages]   = useState([]);
  const [restDays, setRestDays] = useState([]);
  const [editing, setEditing] = useState(null); // { type: 'stage'|'rest', data }
  const [activeTab, setActiveTab] = useState('timeline'); // 'timeline' | 'messages'

  /* ─── Carrega config ─── */
  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/admin/stages-config');
      const data = await res.json();
      if (!data.success) {
        notify(data.error || 'Erro ao carregar config', 'error');
        return;
      }
      setStages(data.stages || []);
      setRestDays(data.restDays || []);
    } catch (err) {
      console.error('[OnboardingConfig] erro ao carregar', err);
      notify('Erro de conexão', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadConfig(); }, []);

  /* ─── Salva uma etapa ─── */
  async function saveStage(stageNumber, data) {
    try {
      const res = await fetch('/api/onboarding/admin/stages-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageNumber, data }),
      });
      const result = await res.json();
      if (!result.success) {
        notify(result.error || 'Erro ao salvar', 'error');
        return false;
      }
      notify(`Etapa ${stageNumber} salva`, 'success', 2500);
      await loadConfig();
      return true;
    } catch (err) {
      notify('Erro de conexão', 'error');
      return false;
    }
  }

  /* ─── Salva mensagem de descanso ─── */
  async function saveRestDay(dayNumber, message) {
    try {
      const res = await fetch('/api/onboarding/admin/stages-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restDayNumber: dayNumber, message }),
      });
      const result = await res.json();
      if (!result.success) {
        notify(result.error || 'Erro ao salvar', 'error');
        return false;
      }
      notify(`Mensagem do dia ${dayNumber} salva`, 'success', 2500);
      await loadConfig();
      return true;
    } catch (err) {
      notify('Erro de conexão', 'error');
      return false;
    }
  }

  /* ─── Monta a lista ordenada de "células" da timeline ─── */
  // Mistura etapas + dias de descanso, ordena por dia
  const timeline = [
    ...stages.map(s => ({ kind: 'stage', day: s.dayRelease, data: s })),
    ...restDays.map(r => ({ kind: 'rest', day: r.dayNumber, data: r })),
  ].sort((a, b) => a.day - b.day);

  return (
    <DashboardLayout activeTab="onboarding-config">
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Configuração do Onboarding</h1>
          <p className="page-subtitle">
            15 dias · 12 etapas com vídeo + perguntas, 3 dias de descanso.
            Edite tudo aqui — cada cliente recebe o link no WhatsApp diariamente.
          </p>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[{ id: 'timeline', label: 'Timeline' }, { id: 'messages', label: 'Mensagens WhatsApp' }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: '10px 20px', cursor: 'pointer', background: 'transparent', border: 'none',
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
              letterSpacing: '0.08em', color: activeTab === t.id ? '#ff0033' : 'var(--text-muted)',
              borderBottom: activeTab === t.id ? '2px solid #ff0033' : '2px solid transparent',
              transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {loading && <div className="skeleton" style={{ height: 200 }} />}

        {/* ── TAB: MENSAGENS ── */}
        {!loading && activeTab === 'messages' && <OnboardingMessagesTab notify={notify} />}

        {/* ── TAB: TIMELINE ── */}
        {!loading && activeTab === 'timeline' && (
          <div className="set-section-card">
            <div className="set-section-header">
              <div className="set-section-header-left">
                <div className="set-section-title-row">
                  <span className="set-section-dot" />
                  <span className="set-section-title-text">Timeline da jornada</span>
                  <span className="set-section-line" />
                </div>
                <div className="set-section-description">
                  {timeline.length} célula{timeline.length !== 1 ? 's' : ''} configurada{timeline.length !== 1 ? 's' : ''}. Clique em qualquer card para editar.
                </div>
              </div>
            </div>

            {/* Timeline em grid */}
            <div className={styles.configTimeline}>
              {timeline.map(cell => (
                <TimelineCard
                  key={`${cell.kind}-${cell.day}`}
                  cell={cell}
                  onEdit={() => setEditing({ type: cell.kind, data: cell.data })}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Controle de Dias (God only) ── */}
        {!loading && activeTab === 'timeline' && <DayControlSection />}

        {/* Modal de edição de etapa */}
        {editing?.type === 'stage' && (
          <StageEditModal
            stage={editing.data}
            onClose={() => setEditing(null)}
            onSave={async (data) => {
              const ok = await saveStage(editing.data.stageNumber, data);
              if (ok) setEditing(null);
            }}
          />
        )}

        {/* Modal de edição de dia de descanso */}
        {editing?.type === 'rest' && (
          <RestDayEditModal
            rest={editing.data}
            onClose={() => setEditing(null)}
            onSave={async (message) => {
              const ok = await saveRestDay(editing.data.dayNumber, message);
              if (ok) setEditing(null);
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════
   TIMELINE CARD — uma célula da timeline (etapa OU descanso)
═══════════════════════════════════════════════════════════ */

function TimelineCard({ cell, onEdit }) {
  if (cell.kind === 'rest') {
    return (
      <div className={`${styles.timelineCard} ${styles.rest}`} onClick={onEdit}>
        <div className={styles.timelineCardDay}>DIA {cell.day}</div>
        <div className={styles.timelineCardLabel}>DESCANSO</div>
        <div className={styles.timelineCardMeta}>
          <span>// mensagem WhatsApp</span>
        </div>
      </div>
    );
  }

  const s = cell.data;
  const hasVideo = !!s.videoUrl;

  return (
    <div className={styles.timelineCard} onClick={onEdit}>
      <div className={styles.timelineCardDay}>DIA {cell.day} · ETAPA {s.stageNumber}</div>
      <div className={styles.timelineCardLabel}>{s.title}</div>
      <div className={styles.timelineCardMeta}>
        <span>{s.questionCount || 0} perguntas</span>
        <span className={`${styles.timelineVideo} ${hasVideo ? styles.has : styles.missing}`}>
          {hasVideo ? '✓ vídeo' : '! sem vídeo'}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MODAL DE EDIÇÃO DE ETAPA
═══════════════════════════════════════════════════════════ */

function StageEditModal({ stage, onClose, onSave }) {
  const [title, setTitle]               = useState(stage.title || '');
  const [description, setDescription]   = useState(stage.description || '');
  const [videoUrl, setVideoUrl]         = useState(stage.videoUrl || '');
  const [videoDuration, setVideoDuration] = useState(stage.videoDuration || '');
  const [timeEstimate, setTimeEstimate] = useState(stage.timeEstimate || '');
  const [insightText, setInsightText]   = useState(stage.insightText || '');
  const [questions, setQuestions]       = useState(stage.questions || []);
  const [saving, setSaving]             = useState(false);

  function updateQuestion(idx, patch) {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
  }
  function removeQuestion(idx) {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  }
  function addQuestion() {
    const newId = `${stage.stageNumber}.${questions.length + 1}`;
    setQuestions(prev => [...prev, {
      id: newId,
      label: 'Nova pergunta',
      type: 'text',
      placeholder: '',
      required: false,
    }]);
  }

  async function handleSave() {
    setSaving(true);
    await onSave({
      title,
      description,
      video_url: videoUrl,
      video_duration: videoDuration ? parseInt(videoDuration, 10) : null,
      time_estimate: timeEstimate,
      insight_text: insightText,
      questions_json: questions,
    });
    setSaving(false);
  }

  return (
    <div className="set-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="set-modal" style={{ width: 'min(760px, 100%)' }}>
        <div className="set-modal-header">
          <div className="set-modal-header-title-box">
            <div className="set-modal-header-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <div>
              <h2 className="set-modal-title">Editar Etapa {stage.stageNumber}</h2>
              <div className="set-modal-subtitle">
                Dia {stage.dayRelease} da jornada — vídeo, perguntas e mensagens.
              </div>
            </div>
          </div>
          <button className="set-modal-close-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="set-modal-body">

        <div className={styles.modalSection}>
          <div className={styles.modalSectionLabel}>TÍTULO</div>
          <input
            type="text"
            className={styles.input}
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div className={styles.modalSection}>
          <div className={styles.modalSectionLabel}>DESCRIÇÃO</div>
          <textarea
            className={styles.textarea}
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        {/* ── CARD DE VÍDEO ── preview visual + URL + duração + nota ── */}
        <div className={styles.modalSection}>
          <div className={styles.modalSectionLabel}>VÍDEO DA ETAPA</div>
          <VideoConfigCard
            videoUrl={videoUrl}
            videoDuration={videoDuration}
            onUrlChange={setVideoUrl}
            onDurationChange={setVideoDuration}
          />
        </div>

        <div className={styles.modalSection}>
          <div className={styles.modalSectionLabel}>TEMPO ESTIMADO DO FORMULÁRIO</div>
          <input
            type="text"
            className={styles.input}
            value={timeEstimate}
            onChange={e => setTimeEstimate(e.target.value)}
            placeholder="~5 min"
          />
        </div>

        <div className={styles.modalSection}>
          <div className={styles.modalSectionLabel}>CARD DE INSIGHT</div>
          <textarea
            className={styles.textarea}
            value={insightText}
            onChange={e => setInsightText(e.target.value)}
            rows={2}
            placeholder="Frase curta que aparece no card amarelo da etapa"
          />
        </div>

        <div className={styles.modalSection}>
          <div className={styles.modalSectionLabel}>PERGUNTAS ({questions.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
            {questions.map((q, idx) => (
              <QuestionRow
                key={`${q.id}-${idx}`}
                question={q}
                index={idx}
                onUpdate={(patch) => updateQuestion(idx, patch)}
                onRemove={() => removeQuestion(idx)}
              />
            ))}
          </div>
          <button
            className={styles.advanceBtn}
            onClick={addQuestion}
            style={{ marginTop: 12 }}
          >
            + Adicionar pergunta
          </button>
        </div>

        </div>
        {/* fim set-modal-body */}

        <div className="set-modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="sigma-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Salvando...' : 'Salvar Etapa'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   VIDEO CONFIG CARD — preview + URL + duração + dica
   Substitui o input simples de URL por um cartão visual que
   mostra preview do vídeo (se URL preenchida) ou placeholder.
═══════════════════════════════════════════════════════════ */

function VideoConfigCard({ videoUrl, videoDuration, onUrlChange, onDurationChange }) {
  const hasUrl = !!(videoUrl && videoUrl.trim().length > 0);

  // Detecta provedor pra montar o embed correto. YouTube e Vimeo precisam
  // de URLs específicas; Panda/Bunny/MP4 caem no <video> nativo.
  const embedInfo = (() => {
    if (!hasUrl) return null;
    const url = videoUrl.trim();

    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
    if (ytMatch) {
      return { type: 'iframe', src: `https://www.youtube.com/embed/${ytMatch[1]}` };
    }

    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeoMatch) {
      return { type: 'iframe', src: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
    }

    // Panda Video — já vem com /embed/ na URL normalmente
    if (url.includes('pandavideo')) {
      return { type: 'iframe', src: url };
    }

    // MP4 direto / outros — usa <video> nativo
    if (/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url)) {
      return { type: 'video', src: url };
    }

    // Fallback: tenta iframe
    return { type: 'iframe', src: url };
  })();

  function handleClear() {
    onUrlChange('');
    onDurationChange('');
  }

  return (
    <div style={{
      background: 'rgba(10, 10, 10, 0.6)',
      border: '1px solid var(--border-default)',
      borderRadius: 10,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Header do card */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(255, 0, 51, 0.08)',
          border: '1px solid rgba(255, 0, 51, 0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#ff1a4d',
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Player de Vídeo
          </div>
          <div style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.68rem',
            color: 'var(--text-muted)',
            marginTop: 2,
          }}>
            {hasUrl ? 'Vídeo configurado' : 'Sem vídeo configurado'}
          </div>
        </div>
        {hasUrl && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
              color: 'var(--text-muted)',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
            title="Remover vídeo"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Preview do vídeo OU placeholder */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        background: '#050505',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {embedInfo?.type === 'iframe' && (
          <iframe
            src={embedInfo.src}
            title="Preview do vídeo"
            style={{ width: '100%', height: '100%', border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}
        {embedInfo?.type === 'video' && (
          <video
            src={embedInfo.src}
            controls
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        )}
        {!hasUrl && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: 16,
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              opacity: 0.6,
            }}>
              Nenhum vídeo
            </div>
          </div>
        )}
      </div>

      {/* Inputs de URL e duração */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 4,
          }}>
            URL do vídeo
          </div>
          <input
            type="text"
            className={styles.input}
            value={videoUrl}
            onChange={e => onUrlChange(e.target.value)}
            placeholder="YouTube, Vimeo, Panda, Bunny, MP4 direto..."
          />
        </div>

        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 4,
          }}>
            Duração (segundos)
          </div>
          <input
            type="number"
            className={styles.input}
            value={videoDuration}
            onChange={e => onDurationChange(e.target.value)}
            placeholder="ex: 90"
          />
        </div>
      </div>

      {/* Nota sobre modo teste */}
      {!hasUrl && (
        <div style={{
          padding: '8px 10px',
          background: 'rgba(249, 115, 22, 0.06)',
          border: '1px solid rgba(249, 115, 22, 0.2)',
          borderRadius: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: '0.62rem',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
        }}>
          <span style={{ color: '#f97316', fontSize: '0.75rem', lineHeight: 1 }}>!</span>
          <span>
            Sem vídeo, o formulário libera sem countdown (modo teste).
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Linha de uma pergunta no editor ─── */
function QuestionRow({ question, index, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      padding: 12,
      background: 'rgba(10, 10, 10, 0.6)',
      border: '1px solid var(--border-default)',
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          value={question.id}
          onChange={e => onUpdate({ id: e.target.value })}
          className={styles.input}
          style={{ width: 80, fontFamily: 'var(--font-mono)', fontSize: 12 }}
        />
        <input
          type="text"
          value={question.label}
          onChange={e => onUpdate({ label: e.target.value })}
          className={styles.input}
          style={{ flex: 1, fontSize: 12 }}
        />
        <select
          value={question.type}
          onChange={e => onUpdate({ type: e.target.value })}
          className={styles.select}
          style={{ width: 110, fontSize: 12 }}
        >
          <option value="text">text</option>
          <option value="textarea">textarea</option>
          <option value="radio">radio</option>
          <option value="checkbox">checkbox</option>
          <option value="select">select</option>
          <option value="number">number</option>
          <option value="composite">composite</option>
          <option value="slider">slider</option>
        </select>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'transparent', border: '1px solid var(--border-default)',
                   color: 'var(--text-muted)', borderRadius: 4, padding: '6px 10px',
                   cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11 }}
        >
          {expanded ? '−' : '+'}
        </button>
        <button
          onClick={onRemove}
          style={{ background: 'rgba(255,0,51,0.1)', border: '1px solid rgba(255,0,51,0.3)',
                   color: '#ff1a4d', borderRadius: 4, padding: '6px 10px',
                   cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11 }}
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={!!question.required}
                onChange={e => onUpdate({ required: e.target.checked })}
              />
              Required
            </label>
            <input
              type="text"
              value={question.placeholder || ''}
              onChange={e => onUpdate({ placeholder: e.target.value })}
              className={styles.input}
              style={{ flex: 1, fontSize: 11 }}
              placeholder="Placeholder..."
            />
          </div>
          {(question.type === 'radio' || question.type === 'checkbox' || question.type === 'select') && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                OPÇÕES (uma por linha)
              </div>
              <textarea
                className={styles.textarea}
                value={(question.options || []).join('\n')}
                onChange={e => onUpdate({ options: e.target.value.split('\n').filter(Boolean) })}
                rows={3}
                style={{ fontSize: 11 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MODAL DE EDIÇÃO DE DIA DE DESCANSO
═══════════════════════════════════════════════════════════ */

function RestDayEditModal({ rest, onClose, onSave }) {
  const [message, setMessage] = useState(rest.message || '');
  const [saving, setSaving]   = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(message);
    setSaving(false);
  }

  return (
    <div className="set-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="set-modal" style={{ width: 'min(560px, 100%)' }}>
        <div className="set-modal-header">
          <div className="set-modal-header-title-box">
            <div className="set-modal-header-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </div>
            <div>
              <h2 className="set-modal-title">Dia {rest.dayNumber} — Descanso</h2>
              <div className="set-modal-subtitle">
                Mensagem enviada via WhatsApp na manhã deste dia. Sem etapa, sem link.
              </div>
            </div>
          </div>
          <button className="set-modal-close-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="set-modal-body">
          <div className={styles.modalSection}>
            <div className={styles.modalSectionLabel}>MENSAGEM <span className="set-required">*</span></div>
            <textarea
              className={styles.textarea}
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
            />
          </div>
        </div>

        <div className="set-modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="sigma-btn-primary"
            onClick={handleSave}
            disabled={saving || !message.trim()}
          >
            {saving ? 'Salvando...' : 'Salvar Mensagem'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DAY CONTROL — avança/retrocede o dia de onboarding de um cliente
═══════════════════════════════════════════════════════════ */
function DayControlSection() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [targetDay, setTargetDay] = useState('');
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/clients');
        const d = await r.json();
        if (d.success) setClients((d.clients || []).filter(c => c.status === 'active'));
      } catch {}
    })();
  }, []);

  function handleApplyClick() {
    if (!selectedClient || !targetDay) return;
    const day = parseInt(targetDay, 10);
    if (day < 1 || day > 15) return;
    setShowConfirm(true);
  }

  async function confirmApply() {
    setShowConfirm(false);
    setApplying(true);
    setResult(null);
    try {
      const r = await fetch('/api/onboarding/admin/set-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClient, targetDay: parseInt(targetDay, 10) }),
      });
      const d = await r.json();
      if (d.success) {
        setResult({ type: 'success', message: d.message, detail: `Dia ${d.progress.previousDay} → Dia ${d.progress.currentDay}` });
      } else {
        setResult({ type: 'error', message: d.error });
      }
    } catch {
      setResult({ type: 'error', message: 'Erro de conexão.' });
    }
    setApplying(false);
  }

  const client = clients.find(c => c.id === selectedClient);

  const inputStyle = {
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 6, color: '#f0f0f0',
    fontFamily: 'var(--font-mono)', fontSize: '0.75rem', outline: 'none',
  };

  return (
    <div className="set-section-card" style={{ marginTop: 24 }}>
      <div className="set-section-header">
        <div className="set-section-header-left">
          <div className="set-section-title-row">
            <span className="set-section-dot" />
            <span className="set-section-title-text">Controle de Dias</span>
            <span className="set-section-line" />
          </div>
          <div className="set-section-description">
            Avance ou retroceda o dia do onboarding de um cliente. Ferramenta para testes e correções.
          </div>
        </div>
      </div>

      {/* Aviso */}
      <div style={{
        padding: '14px 18px', borderRadius: 8, marginBottom: 18,
        background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.2)',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'rgba(255,200,100,0.85)', lineHeight: 1.75 }}>
          <strong style={{ color: '#ffaa00', display: 'block', marginBottom: 4 }}>Atenção</strong>
          Alterar o dia do onboarding modifica o ponto de partida (started_at) do cliente.
          O cron diário passará a enviar a etapa do novo dia na próxima execução (8h BRT).
          Respostas já enviadas pelo cliente não são apagadas.
          Use com cuidado — o cliente pode receber mensagens fora de ordem se retroceder para um dia com etapa já respondida.
        </div>
      </div>

      {/* Controles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: 4, display: 'block',
          }}>Cliente</label>
          <select
            style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
            value={selectedClient}
            onChange={e => { setSelectedClient(e.target.value); setResult(null); }}
          >
            <option value="">— Selecione um cliente —</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: 4, display: 'block',
          }}>Dia (1-15)</label>
          <input
            type="number" min="1" max="15"
            style={{ ...inputStyle, width: '100%' }}
            value={targetDay}
            onChange={e => { setTargetDay(e.target.value); setResult(null); }}
            placeholder="1-15"
          />
        </div>
        <button
          onClick={handleApplyClick}
          disabled={applying || !selectedClient || !targetDay}
          style={{
            padding: '10px 20px', borderRadius: 6,
            cursor: (applying || !selectedClient || !targetDay) ? 'not-allowed' : 'pointer',
            background: applying ? 'rgba(255,0,51,0.3)' : 'rgba(255,0,51,0.9)',
            border: 'none', color: '#fff',
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
            letterSpacing: '0.06em', opacity: (applying || !selectedClient || !targetDay) ? 0.5 : 1,
            height: 40,
          }}
        >
          {applying ? 'Aplicando...' : 'Aplicar'}
        </button>
      </div>

      {/* Resultado */}
      {result && (
        <div style={{
          marginTop: 14, padding: '10px 14px', borderRadius: 7,
          background: result.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(255,26,77,0.08)',
          border: `1px solid ${result.type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(255,26,77,0.25)'}`,
          fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
          color: result.type === 'success' ? '#22c55e' : '#ff6680',
        }}>
          {result.message}
          {result.detail && <span style={{ marginLeft: 8, opacity: 0.7 }}>({result.detail})</span>}
        </div>
      )}

      {/* Modal de confirmação */}
      {showConfirm && (
        <div
          onClick={() => setShowConfirm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="glass-card animate-scale-in"
            style={{ width: '100%', maxWidth: 440, padding: '28px 24px' }}
          >
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: '#ffaa00', marginBottom: 14,
            }}>
              Confirmar alteração
            </div>

            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)',
              lineHeight: 1.7, marginBottom: 20,
            }}>
              Alterar o dia do onboarding de <strong style={{ color: '#ff0033' }}>{client?.company_name}</strong> para <strong style={{ color: '#ff0033' }}>dia {targetDay}</strong>.
              <br /><br />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                Isso recalcula o ponto de partida da jornada. O cron de envio diário usará o novo dia
                na próxima execução. Respostas já enviadas não são apagadas.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmApply}
                style={{
                  padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(255,170,0,0.9)', border: 'none', color: '#000',
                  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700,
                }}
              >
                Confirmar Alteração
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: MENSAGENS — templates WhatsApp editáveis
═══════════════════════════════════════════════════════════ */

const MSG_TEMPLATES = [
  {
    key: 'onboarding_msg_stage_link',
    label: 'Link da Etapa (diário)',
    description: 'Enviada toda manhã quando uma etapa é liberada.',
    placeholders: ['{NOME}', '{ETAPA}', '{TITULO}', '{LINK}'],
    defaultValue: `Bom dia, *{NOME}*.

Etapa *{ETAPA}* liberada: _{TITULO}_
Hoje o dia é teu. Pega 5-7 minutos, assiste o vídeo e responde sem pressa.

{LINK}

Quanto mais real, mais a estratégia vira teu jeito — não um molde genérico.`,
  },
  {
    key: 'onboarding_msg_reminder',
    label: 'Lembrete (fim do dia)',
    description: 'Enviada no fim do dia se o cliente não respondeu a etapa.',
    placeholders: ['{NOME}', '{ETAPA}', '{LINK}'],
    defaultValue: `Oi, *{NOME}*.

A etapa *{ETAPA}* de hoje ainda tá te esperando.
Sem pressão — só pra lembrar que o link tá aqui:

{LINK}

Se hoje não rolar, amanhã libera a próxima do mesmo jeito.`,
  },
  {
    key: 'onboarding_msg_rest_4',
    label: 'Dia de Descanso 4',
    description: 'Mensagem motivacional do 4o dia (primeiro descanso).',
    placeholders: [],
    defaultValue: `Tá indo muito bem. Suas respostas já mostram muita coisa.
Amanhã: campo de batalha — *concorrentes*.
Hoje, descansa. Sem etapa, sem link, sem cobrança.`,
  },
  {
    key: 'onboarding_msg_rest_8',
    label: 'Dia de Descanso 8',
    description: 'Mensagem motivacional do 8o dia (metade da jornada).',
    placeholders: [],
    defaultValue: `*Metade*. Você tá na frente de 99% dos empresários que abriram a empresa e nunca pararam pra pensar nela.
Segunda metade: dados, números, vendas.
Amanhã: história da sua marca. A etapa mais bonita do briefing. Prepara o coração.`,
  },
  {
    key: 'onboarding_msg_rest_13',
    label: 'Dia de Descanso 13',
    description: 'Mensagem motivacional do 13o dia (penúltimo descanso).',
    placeholders: [],
    defaultValue: `Último respiro antes do fechamento.
Você já olhou seu negócio com lupa por 12 dias.
Amanhã e depois: objetivos e fechamento. Vamos terminar com força.`,
  },
  {
    key: 'onboarding_msg_completion',
    label: 'Conclusão',
    description: 'Enviada quando o cliente completa todas as 12 etapas.',
    placeholders: ['{NOME}'],
    defaultValue: `*{NOME}*, terminamos.

15 dias. 12 etapas. 157 perguntas.
Você fez algo que 99% dos empresários nunca fizeram: parar e olhar o próprio negócio do começo ao fim.

Agora é com a Sigma. Em até 7 dias o time devolve:
- Posicionamento estratégico
- Avatar e mapa de objeções
- Plano de conteúdo do primeiro mês
- Próximos passos comerciais

Obrigado pela honestidade nas respostas. Foi ela que fez esse trabalho valer.`,
  },
];

function OnboardingMessagesTab({ notify }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});

  // Carrega valores customizados do banco
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/settings/jarvis-config'); // reutiliza a API de settings
        const d = await r.json();
        if (d.success && d.config) {
          const loaded = {};
          MSG_TEMPLATES.forEach(t => {
            loaded[t.key] = d.config[t.key] || '';
          });
          setValues(loaded);
        }
      } catch {}
    })();
  }, []);

  async function handleSave(key) {
    setSaving(s => ({ ...s, [key]: true }));
    try {
      const r = await fetch('/api/settings/jarvis-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: values[key] || '' }),
      });
      const d = await r.json();
      if (d.success) {
        setSaved(s => ({ ...s, [key]: true }));
        setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000);
        notify('Mensagem salva.', 'success');
      } else {
        notify(d.error || 'Erro.', 'error');
      }
    } catch {
      notify('Erro de conexão.', 'error');
    }
    setSaving(s => ({ ...s, [key]: false }));
  }

  function handleReset(key, defaultValue) {
    setValues(v => ({ ...v, [key]: defaultValue }));
    setSaved(s => ({ ...s, [key]: false }));
  }

  const textareaStyle = {
    width: '100%', padding: '12px 14px', resize: 'vertical',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, color: '#f0f0f0',
    fontFamily: 'var(--font-mono)', fontSize: '0.72rem', lineHeight: 1.7,
    outline: 'none', transition: 'border-color 0.15s',
  };

  return (
    <div>
      {/* Aviso */}
      <div style={{
        padding: '14px 18px', borderRadius: 8, marginBottom: 20,
        background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'rgba(165,180,252,0.75)', lineHeight: 1.75 }}>
          <strong style={{ color: 'rgba(165,180,252,0.95)', display: 'block', marginBottom: 4 }}>Como funciona</strong>
          O cron diário (8h BRT) envia uma mensagem diferente por dia via WhatsApp.
          Nos dias de etapa, envia o link. Nos dias de descanso, a mensagem motivacional.
          Se o cliente não responder, envia o lembrete no fim do dia.
          Edite qualquer template abaixo — deixe vazio para usar o padrão.
        </div>
      </div>

      {MSG_TEMPLATES.map((tmpl, idx) => {
        const val = values[tmpl.key] || tmpl.defaultValue;
        const isSaving = saving[tmpl.key];
        const isSaved = saved[tmpl.key];

        return (
          <div key={tmpl.key} className="glass-card" style={{ padding: '20px 24px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
                  color: 'var(--text-primary)',
                }}>
                  {tmpl.label}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                  color: 'var(--text-muted)', marginTop: 2,
                }}>
                  {tmpl.description}
                </div>
              </div>
            </div>

            <textarea
              value={val}
              onChange={e => { setValues(v => ({ ...v, [tmpl.key]: e.target.value })); setSaved(s => ({ ...s, [tmpl.key]: false })); }}
              rows={tmpl.key.includes('rest') ? 4 : 7}
              style={textareaStyle}
              onFocus={e => { e.target.style.borderColor = 'rgba(255,0,51,0.3)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />

            {/* Placeholders clicáveis */}
            {tmpl.placeholders.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {tmpl.placeholders.map(ph => (
                  <span key={ph} style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
                    padding: '2px 8px', borderRadius: 4,
                    background: 'rgba(255,0,51,0.06)', border: '1px solid rgba(255,0,51,0.15)',
                    color: '#ff6680', cursor: 'pointer',
                  }}
                    title={`Inserir ${ph}`}
                    onClick={() => setValues(v => ({ ...v, [tmpl.key]: (v[tmpl.key] || tmpl.defaultValue) + ph }))}
                  >
                    {ph}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => handleSave(tmpl.key)}
                disabled={isSaving}
                style={{
                  padding: '7px 18px', borderRadius: 6,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  background: isSaved ? 'rgba(34,197,94,0.12)' : 'rgba(255,0,51,0.1)',
                  border: isSaved ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,0,51,0.25)',
                  color: isSaved ? '#22c55e' : '#ff6680',
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 600,
                }}
              >
                {isSaving ? 'Salvando...' : isSaved ? 'Salvo' : 'Salvar'}
              </button>
              <button
                onClick={() => handleReset(tmpl.key, tmpl.defaultValue)}
                style={{
                  padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                }}
              >
                Restaurar padrão
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
