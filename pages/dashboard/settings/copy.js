import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/settingsCopy.module.css';

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-5',   label: 'Claude Opus 4.5' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'gpt-4o',            label: 'GPT-4o' },
  { value: 'gpt-4o-mini',       label: 'GPT-4o Mini' },
];

/* ════════════════════════════════════════════════════════════════════════════
   AIStructureModal — popup assistido por IA para criar estruturas
═══════════════════════════════════════════════════════════════════════════ */
function AIStructureModal({ onClose, onGenerated }) {
  const { notify } = useNotification();
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecording(false);
        setTranscribing(true);
        try {
          const b64 = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(blob); });
          const r = await fetch('/api/copy/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: b64, mimeType }) });
          const d = await r.json();
          if (d.success && d.text) { setDescription(prev => prev ? prev + ' ' + d.text : d.text); notify('Audio transcrito', 'success'); }
          else { notify('Falha na transcricao', 'error'); }
        } catch { notify('Erro ao transcrever', 'error'); }
        finally { setTranscribing(false); }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch { notify('Erro ao acessar microfone', 'error'); }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  }

  async function handleGenerate() {
    if (!description.trim()) { notify('Descreva o tipo de copy que precisa', 'warning'); return; }
    setGenerating(true);
    try {
      const imagesB64 = [];
      for (const img of uploadedImages) {
        const b64 = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(img.file); });
        imagesB64.push({ base64: b64, mimeType: img.file.type });
      }
      const filesB64 = [];
      for (const doc of uploadedDocs) {
        const b64 = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(doc.file); });
        filesB64.push({ base64: b64, mimeType: doc.file.type, fileName: doc.name });
      }

      const r = await fetch('/api/copy/generate-structure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          ...(imagesB64.length ? { images: imagesB64 } : {}),
          ...(filesB64.length ? { files: filesB64 } : {}),
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);

      onGenerated(d.data);
      notify('Estrutura gerada pela IA — revise e salve', 'success');
      onClose();
    } catch (err) {
      notify(err.message || 'Falha ao gerar estrutura', 'error');
    } finally { setGenerating(false); }
  }

  const inputS = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'rgba(10,10,10,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', outline: 'none' };

  return (
    <div className="set-modal-overlay" onClick={onClose}>
      <div className="set-modal" onClick={e => e.stopPropagation()} style={{ width: 'min(580px, 100%)' }}>
        <div className="set-modal-header">
          <div className="set-modal-header-title-box">
            <div className="set-modal-header-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <div>
              <h2 className="set-modal-title">Criar Estrutura com IA</h2>
              <div className="set-modal-subtitle">
                Descreva o tipo de copy e a IA gera o prompt base + perguntas-chave automaticamente.
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

        <div style={{ marginBottom: 0 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' }}>O que voce precisa gerar?</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Ex: Preciso de uma estrutura para criar paginas de captura de leads para cursos online..."
            style={{ ...inputS, resize: 'vertical', minHeight: 100, fontSize: '0.68rem', lineHeight: 1.6 }}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input ref={imageInputRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); setUploadedImages(p => [...p, ...f.slice(0, 5 - p.length).map(x => ({ name: x.name, file: x }))]); e.target.value = ''; }} />
          <button onClick={() => imageInputRef.current?.click()} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            {uploadedImages.length > 0 ? uploadedImages.length + ' img' : 'Imagens'}
          </button>
          <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); setUploadedDocs(p => [...p, ...f.slice(0, 3 - p.length).map(x => ({ name: x.name, file: x }))]); e.target.value = ''; }} />
          <button onClick={() => docInputRef.current?.click()} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {uploadedDocs.length > 0 ? uploadedDocs.length + ' doc' : 'Docs'}
          </button>
          <button onClick={recording ? stopRecording : startRecording} disabled={transcribing} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px dashed ' + (recording ? 'rgba(255,51,51,0.3)' : 'rgba(255,255,255,0.1)'), background: recording ? 'rgba(255,51,51,0.06)' : 'transparent', color: recording ? 'var(--status-error)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, animation: recording ? 'pulse 1.2s ease-in-out infinite' : 'none' }}>
            {transcribing ? (
              <><div style={{ width: 8, height: 8, border: '1.5px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--brand-300)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Transcrevendo</>
            ) : (
              <><svg width="10" height="10" viewBox="0 0 24 24" fill={recording ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>{recording ? 'Parar' : 'Audio'}</>
            )}
          </button>
        </div>

        {(uploadedImages.length > 0 || uploadedDocs.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {uploadedImages.map((f, i) => (
              <span key={'img' + i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', padding: '1px 6px', borderRadius: 3, background: 'rgba(59,130,246,0.08)', color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                {f.name.substring(0, 20)}
                <button onClick={() => setUploadedImages(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 0, fontSize: '0.5rem' }}>&times;</button>
              </span>
            ))}
            {uploadedDocs.map((f, i) => (
              <span key={'doc' + i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', padding: '1px 6px', borderRadius: 3, background: 'rgba(34,197,94,0.08)', color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                {f.name.substring(0, 20)}
                <button onClick={() => setUploadedDocs(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', padding: 0, fontSize: '0.5rem' }}>&times;</button>
              </span>
            ))}
          </div>
        )}

        </div>
        {/* fim set-modal-body */}

        <div className="set-modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancelar</button>
          <button onClick={handleGenerate} disabled={generating || !description.trim()} className="sigma-btn-primary">
            {generating ? (
              <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Gerando...</>
            ) : (
              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>Gerar com IA</>
            )}
          </button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Page Export
═══════════════════════════════════════════════════════════════════════════ */
export default function CopySettingsPage() {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [copyModel, setCopyModel] = useState('gpt-4o-mini');

  // ── Structures state ──
  const [structures, setStructures] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', prompt_base: '', icon: 'file', questions: [] });
  const [saving, setSaving] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  useEffect(() => {
    Promise.all([loadCopyConfig(), loadStructures()]).then(() => setLoading(false));
  }, []);

  async function loadCopyConfig() {
    try {
      const r = await fetch('/api/settings/copy-config');
      const d = await r.json();
      if (d.success) setCopyModel(d.data.copy_model || 'gpt-4o-mini');
    } catch (err) {
      console.error('[ERRO][CopySettings] Falha ao carregar config', err.message);
    }
  }

  async function loadStructures() {
    try {
      const r = await fetch('/api/copy/structures');
      const d = await r.json();
      if (d.success) setStructures(d.data || []);
    } catch (err) {
      console.error('[ERRO][CopySettings] Falha ao carregar estruturas', err.message);
    }
  }

  async function saveModel(value) {
    try {
      const r = await fetch('/api/settings/copy-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'copy_model', value }),
      });
      const d = await r.json();
      if (d.success) {
        setCopyModel(value);
        notify('Modelo do copy atualizado', 'success');
      }
    } catch { notify('Erro ao salvar modelo', 'error'); }
  }

  // ── Structure CRUD ──
  function startEdit(s) {
    setEditing(s.id);
    setForm({ name: s.name, description: s.description || '', prompt_base: s.prompt_base, icon: s.icon || 'file', questions: s.questions || [] });
  }

  function startNew() {
    setEditing('new');
    setForm({ name: '', description: '', prompt_base: '', icon: 'file', questions: [] });
  }

  function addQuestion() {
    setForm(f => ({ ...f, questions: [...f.questions, { id: 'q' + Date.now(), label: '', placeholder: '', required: false }] }));
  }

  function updateQuestion(idx, field, value) {
    setForm(f => { const qs = [...f.questions]; qs[idx] = { ...qs[idx], [field]: value }; return { ...f, questions: qs }; });
  }

  function removeQuestion(idx) {
    setForm(f => ({ ...f, questions: f.questions.filter((_, i) => i !== idx) }));
  }

  async function handleSaveStructure() {
    if (!form.name.trim() || !form.prompt_base.trim()) { notify('Nome e prompt base sao obrigatorios', 'warning'); return; }
    setSaving(true);
    try {
      if (editing === 'new') {
        await fetch('/api/copy/structures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        notify('Estrutura criada', 'success');
      } else {
        await fetch('/api/copy/structures?id=' + editing, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        notify('Estrutura atualizada', 'success');
      }
      setEditing(null);
      loadStructures();
    } catch { notify('Erro ao salvar', 'error'); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(id) {
    try {
      const r = await fetch('/api/copy/structures?id=' + id, { method: 'DELETE' });
      const d = await r.json();
      if (!d.success) { notify(d.error, 'error'); return; }
      notify('Estrutura desativada', 'success');
      loadStructures();
    } catch { notify('Erro ao desativar', 'error'); }
  }

  // ── Shared styles ──
  const cardStyle = { padding: '16px 20px', marginBottom: 10, borderRadius: 10, background: 'linear-gradient(145deg, rgba(17,17,17,0.95), rgba(10,10,10,0.98))', border: '1px solid rgba(255,255,255,0.04)' };
  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'rgba(10,10,10,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', outline: 'none' };
  const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: 120, fontSize: '0.65rem', lineHeight: 1.6 };
  const labelStyle = { fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' };
  const btnPrimary = { padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, var(--action-primary), var(--brand-600))', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700 };
  const btnSecondary = { padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', cursor: 'pointer' };
  const badgeStyle = (bg, color) => ({ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: bg, color });

  if (loading) {
    return (
      <DashboardLayout activeTab="settings/copy">
        <div className={styles.loadingText}>Carregando configuracoes...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="settings/copy">
      <div className={styles.pageContainer}>
        <div style={{ marginBottom: 28 }}>
          <h1 className="page-title">Config. Copy</h1>
          <p className="page-subtitle">
            Modelo de geração e estruturas de copy
          </p>
        </div>

        {/* ── Seção 1: Modelo de Geração ── */}
        <div className="set-section-card">
          <div className="set-section-header">
            <div className="set-section-header-left">
              <div className="set-section-title-row">
                <span className="set-section-dot" />
                <span className="set-section-title-text">Modelo de Geração</span>
                <span className="set-section-line" />
              </div>
              <div className="set-section-description">
                IA usada para criar copies, legendas e roteiros.
              </div>
            </div>
          </div>
          <div className={styles.modelRow}>
            <div className={styles.modelLabel}>Modelo padrão</div>
            <select className={styles.modelSelect} value={copyModel} onChange={e => saveModel(e.target.value)}>
              {MODEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Seção 2: Estruturas de Copy (completa) ── */}
        <div className="set-section-card">
          <div className="set-section-header">
            <div className="set-section-header-left">
              <div className="set-section-title-row">
                <span className="set-section-dot" />
                <span className="set-section-title-text">Estruturas Cadastradas</span>
                <span className="set-section-line" />
              </div>
              <div className="set-section-description">
                Templates usados pelo gerador de copy. Cada estrutura tem prompt base + perguntas-chave.
              </div>
            </div>
          </div>

          {structures.map(s => (
            <div key={s.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</span>
                  <span style={badgeStyle(s.is_default ? 'rgba(59,130,246,0.08)' : 'rgba(34,197,94,0.08)', s.is_default ? '#3b82f6' : '#22c55e')}>{s.is_default ? 'PADRAO' : 'CUSTOM'}</span>
                  {(s.questions || []).length > 0 && <span style={badgeStyle('rgba(249,115,22,0.08)', '#f97316')}>{s.questions.length} pergunta(s)</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEdit(s)} style={{ ...btnSecondary, fontSize: '0.5rem', padding: '3px 10px' }}>Editar</button>
                  {!s.is_default && <button onClick={() => handleDeactivate(s.id)} style={{ ...btnSecondary, fontSize: '0.5rem', padding: '3px 10px', borderColor: 'rgba(255,51,51,0.2)', color: 'var(--status-error)' }}>Desativar</button>}
                </div>
              </div>
              {s.description && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginTop: 4 }}>{s.description}</div>}
            </div>
          ))}

          {structures.length === 0 && (
            <div style={{ padding: '28px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Nenhuma estrutura cadastrada
              </div>
            </div>
          )}

          {/* Botões de criação */}
          <div style={{ display: 'flex', gap: 8, marginTop: structures.length > 0 ? 12 : 0 }}>
            <button
              onClick={() => setShowAIModal(true)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(255,0,51,0.08), rgba(255,0,51,0.04))',
                border: '1px solid rgba(255,0,51,0.2)',
                color: 'var(--brand-300)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              Criar com IA
            </button>
            <button
              onClick={startNew}
              style={{
                padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'all 0.15s',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Manual
            </button>
          </div>
        </div>

        {/* Modal de edição/criação split-pane */}
        {editing && (
          <div className="set-modal-overlay" onClick={() => setEditing(null)}>
            <div className="set-modal set-modal-wide" onClick={e => e.stopPropagation()} style={{ height: 'min(720px, 88vh)' }}>

              {/* Header padronizado */}
              <div className="set-modal-header">
                <div className="set-modal-header-title-box">
                  <div className="set-modal-header-badge">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="9" y1="13" x2="15" y2="13" />
                      <line x1="9" y1="17" x2="13" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="set-modal-title">
                      {editing === 'new' ? 'Nova Estrutura' : 'Editar Estrutura'}
                    </h2>
                    <div className="set-modal-subtitle">
                      Configure o prompt base e as perguntas-chave preenchidas pelo operador.
                    </div>
                    {(editing !== 'new' || (form.questions?.length > 0)) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        {editing !== 'new' && (() => {
                          const s = structures.find(x => x.id === editing);
                          return s ? <span style={badgeStyle(s.is_default ? 'rgba(59,130,246,0.08)' : 'rgba(34,197,94,0.08)', s.is_default ? '#3b82f6' : '#22c55e')}>{s.is_default ? 'PADRÃO' : 'CUSTOM'}</span> : null;
                        })()}
                        {form.questions?.length > 0 && <span style={badgeStyle('rgba(249,115,22,0.08)', '#f97316')}>{form.questions.length} pergunta{form.questions.length !== 1 ? 's' : ''}</span>}
                      </div>
                    )}
                  </div>
                </div>
                <button className="set-modal-close-btn" onClick={() => setEditing(null)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Body split */}
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                {/* Esquerda: campos */}
                <div style={{ flex: '0 0 55%', padding: '20px 24px', overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Nome</label>
                    <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Landing Page, Roteiro de Reels..." />
                  </div>
                  <div>
                    <label style={labelStyle}>Descricao</label>
                    <input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descricao curta do que a estrutura gera" />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <label style={labelStyle}>Prompt Base</label>
                    <textarea style={{ ...textareaStyle, flex: 1, minHeight: 200 }} value={form.prompt_base} onChange={e => setForm(f => ({ ...f, prompt_base: e.target.value }))} placeholder="Instrucoes de como a IA deve gerar a copy nesta estrutura..." />
                  </div>
                </div>

                {/* Direita: perguntas */}
                <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  <label style={{ ...labelStyle, marginBottom: 10 }}>Perguntas-Chave</label>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', color: 'var(--text-muted)', marginBottom: 12, marginTop: -8 }}>Preenchidas pelo operador ao gerar copy</div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(form.questions || []).map((q, i) => (
                      <div key={q.id || i} style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <input style={{ ...inputStyle, marginBottom: 6, fontSize: '0.65rem' }} value={q.label} onChange={e => updateQuestion(i, 'label', e.target.value)} placeholder="Pergunta (ex: Qual o objetivo?)" />
                            <input style={{ ...inputStyle, fontSize: '0.58rem', color: 'var(--text-muted)' }} value={q.placeholder} onChange={e => updateQuestion(i, 'placeholder', e.target.value)} placeholder="Placeholder de ajuda" />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, flexShrink: 0 }}>
                            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.46rem', color: q.required ? '#22c55e' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input type="checkbox" checked={q.required} onChange={e => updateQuestion(i, 'required', e.target.checked)} style={{ width: 13, height: 13, accentColor: '#22c55e' }} />
                              Obrig.
                            </label>
                            <button onClick={() => removeQuestion(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-error)', fontSize: '0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600, padding: 0, textAlign: 'left' }}>Remover</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={addQuestion} style={{ marginTop: 10, padding: '8px 14px', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.56rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Adicionar pergunta
                  </button>
                </div>
              </div>

              {/* Footer padronizado */}
              <div className="set-modal-footer">
                <button onClick={() => setEditing(null)} className="btn btn-secondary">Cancelar</button>
                <button onClick={handleSaveStructure} disabled={saving} className="sigma-btn-primary">
                  {saving ? 'Salvando...' : editing === 'new' ? 'Criar Estrutura' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showAIModal && (
          <AIStructureModal
            onClose={() => setShowAIModal(false)}
            onGenerated={(data) => {
              setEditing('new');
              setForm({ name: data.name || '', description: data.description || '', prompt_base: data.prompt_base || '', icon: 'file', questions: data.questions || [] });
              setShowAIModal(false);
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
