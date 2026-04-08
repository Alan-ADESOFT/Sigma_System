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

        {loading && <div className="skeleton" style={{ height: 200 }} />}

        {!loading && (
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
