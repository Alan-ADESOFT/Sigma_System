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
      <div style={{ padding: '24px 32px' }}>
        <div className={styles.configHeader}>
          <h1 className="page-title">Configuração do Onboarding</h1>
          <p className="page-subtitle">
            15 dias · 12 etapas com vídeo + perguntas, 3 dias de descanso.
            Edite tudo aqui — cada cliente recebe o link no WhatsApp diariamente.
          </p>
        </div>

        {loading && <div className="skeleton" style={{ height: 200 }} />}

        {!loading && (
          <>
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
          </>
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
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalCard} style={{ maxWidth: 720 }}>
        <button className={styles.modalClose} onClick={onClose}>×</button>
        <h2 className={styles.modalTitle}>
          Editar Etapa {stage.stageNumber}
        </h2>
        <p className={styles.modalSubtitle}>Dia {stage.dayRelease} da jornada</p>

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

        <div className={styles.modalSection}>
          <div className={styles.modalSectionLabel}>URL DO VÍDEO</div>
          <input
            type="text"
            className={styles.input}
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="https://... (Panda, YouTube, MP4 direto, etc)"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className={styles.modalSection}>
            <div className={styles.modalSectionLabel}>DURAÇÃO (segundos)</div>
            <input
              type="number"
              className={styles.input}
              value={videoDuration}
              onChange={e => setVideoDuration(e.target.value)}
              placeholder="ex: 90"
            />
          </div>
          <div className={styles.modalSection}>
            <div className={styles.modalSectionLabel}>TEMPO ESTIMADO</div>
            <input
              type="text"
              className={styles.input}
              value={timeEstimate}
              onChange={e => setTimeEstimate(e.target.value)}
              placeholder="~5 min"
            />
          </div>
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

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className={styles.advanceBtn} onClick={onClose} style={{ flex: 1 }}>
            Cancelar
          </button>
          <button
            className={styles.submitBtn}
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1, marginTop: 0 }}
          >
            {saving ? 'Salvando...' : 'Salvar Etapa'}
          </button>
        </div>
      </div>
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
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalCard}>
        <button className={styles.modalClose} onClick={onClose}>×</button>
        <h2 className={styles.modalTitle}>Dia {rest.dayNumber} — Descanso</h2>
        <p className={styles.modalSubtitle}>
          Mensagem enviada via WhatsApp na manhã desse dia. Sem etapa, sem link.
        </p>

        <div className={styles.modalSection}>
          <div className={styles.modalSectionLabel}>MENSAGEM</div>
          <textarea
            className={styles.textarea}
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={6}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className={styles.advanceBtn} onClick={onClose} style={{ flex: 1 }}>
            Cancelar
          </button>
          <button
            className={styles.submitBtn}
            onClick={handleSave}
            disabled={saving || !message.trim()}
            style={{ flex: 1, marginTop: 0 }}
          >
            {saving ? 'Salvando...' : 'Salvar Mensagem'}
          </button>
        </div>
      </div>
    </div>
  );
}
