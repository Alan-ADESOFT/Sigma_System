import { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useNotification } from '../../context/NotificationContext';

const AGENT_LIST = [
  { name: 'agente1',  label: 'Agente 01 - Diagnostico',         desc: 'Analisa dados e monta diagnostico estrategico' },
  { name: 'agente2a', label: 'Agente 2A - Pesquisador',         desc: 'Pesquisa concorrentes na web' },
  { name: 'agente2b', label: 'Agente 2B - Analista',            desc: 'Analisa dados dos concorrentes' },
  { name: 'agente3',  label: 'Agente 03 - Publico-Alvo',        desc: 'Define perfil do publico' },
  { name: 'agente4a', label: 'Agente 4A - Pesquisador Avatar',  desc: 'Pesquisa dores e linguagem do publico' },
  { name: 'agente4b', label: 'Agente 4B - Construtor Avatar',   desc: 'Constroi avatar completo' },
  { name: 'agente5',  label: 'Agente 05 - Posicionamento',      desc: 'Define posicionamento da marca' },
];

function PromptsSection() {
  const { notify } = useNotification();
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [promptText, setPromptText]       = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [isCustom, setIsCustom]           = useState(false);
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);

  const loadPrompt = useCallback(async (agentName) => {
    setLoading(true);
    try {
      const r = await fetch('/api/agentes/prompts/' + agentName);
      const d = await r.json();
      if (d.success) {
        setPromptText(d.data.prompt);
        setDefaultPrompt(d.data.defaultPrompt);
        setIsCustom(d.data.isCustom);
      }
    } catch {}
    setLoading(false);
  }, []);

  function handleToggle(agentName) {
    if (expandedAgent === agentName) {
      setExpandedAgent(null);
    } else {
      setExpandedAgent(agentName);
      loadPrompt(agentName);
    }
  }

  async function handleSave() {
    if (!expandedAgent) return;
    setSaving(true);
    try {
      const r = await fetch('/api/agentes/prompts/' + expandedAgent, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
      });
      const d = await r.json();
      if (d.success) {
        setIsCustom(true);
        notify('Prompt salvo!', 'success');
      } else {
        notify(d.error || 'Erro ao salvar', 'error');
      }
    } catch { notify('Erro ao salvar prompt', 'error'); }
    setSaving(false);
  }

  async function handleReset() {
    if (!expandedAgent || !confirm('Restaurar prompt ao padrao? A customizacao sera perdida.')) return;
    setSaving(true);
    try {
      const r = await fetch('/api/agentes/prompts/' + expandedAgent, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) {
        setPromptText(defaultPrompt);
        setIsCustom(false);
        notify('Prompt restaurado ao padrao', 'success');
      }
    } catch { notify('Erro ao restaurar', 'error'); }
    setSaving(false);
  }

  return (
    <div className="glass-card" style={{ padding: '20px 24px', marginTop: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Prompts dos Agentes
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Customize os prompts base usados por cada agente. Alteracoes afetam todas as execucoes futuras.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {AGENT_LIST.map(agent => (
          <div key={agent.name}>
            {/* Card do agente */}
            <div
              onClick={() => handleToggle(agent.name)}
              style={{
                padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                background: expandedAgent === agent.name ? 'rgba(255,0,51,0.03)' : 'rgba(255,255,255,0.01)',
                border: '1px solid ' + (expandedAgent === agent.name ? 'rgba(255,0,51,0.15)' : 'rgba(255,255,255,0.05)'),
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'all 0.15s',
              }}
            >
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {agent.label}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {agent.desc}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {expandedAgent === agent.name && isCustom && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.48rem', fontWeight: 600,
                    padding: '1px 6px', borderRadius: 3,
                    background: 'rgba(249,115,22,0.1)', color: '#f97316',
                  }}>
                    CUSTOMIZADO
                  </span>
                )}
                {expandedAgent === agent.name && !isCustom && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.48rem', fontWeight: 600,
                    padding: '1px 6px', borderRadius: 3,
                    background: 'rgba(82,82,82,0.15)', color: '#525252',
                  }}>
                    PADRAO
                  </span>
                )}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"
                  style={{ transform: expandedAgent === agent.name ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                  <polyline points="6,9 12,15 18,9" />
                </svg>
              </div>
            </div>

            {/* Editor expandido */}
            {expandedAgent === agent.name && (
              <div style={{ padding: '12px 14px', marginTop: 4, borderRadius: 8, background: 'rgba(10,10,10,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                {loading ? (
                  <div style={{ padding: 20, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>Carregando prompt...</div>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                      Use placeholders: {'{DADOS_CLIENTE}'}, {'{OUTPUT_DIAGNOSTICO}'}, {'{OUTPUT_AVATAR}'}, etc.
                    </div>
                    <textarea
                      value={promptText}
                      onChange={e => setPromptText(e.target.value)}
                      rows={18}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                        background: 'rgba(5,5,5,0.8)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8, color: 'var(--text-secondary)', fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)', lineHeight: 1.6, outline: 'none', resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                      {isCustom && (
                        <button
                          onClick={handleReset}
                          disabled={saving}
                          style={{
                            padding: '5px 14px', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer',
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
                          }}
                        >
                          Restaurar Padrao
                        </button>
                      )}
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                          padding: '5px 14px', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer',
                          background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.25)',
                          color: '#ff6680', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
                        }}
                      >
                        {saving ? 'Salvando...' : 'Salvar Alteracoes'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   CopyStructuresSection — gestao de estruturas de copy com perguntas-chave
═══════════════════════════════════════════════════════════════════════════ */
function CopyStructuresSection() {
  const { notify } = useNotification();
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // structure.id or 'new'
  const [form, setForm] = useState({ name: '', description: '', prompt_base: '', icon: 'file', questions: [] });
  const [saving, setSaving] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  useEffect(() => { loadStructures(); }, []);

  async function loadStructures() {
    setLoading(true);
    try {
      const r = await fetch('/api/copy/structures');
      const d = await r.json();
      if (d.success) setStructures(d.data || []);
    } catch {}
    setLoading(false);
  }

  function startEdit(s) {
    setEditing(s.id);
    setForm({
      name: s.name, description: s.description || '', prompt_base: s.prompt_base,
      icon: s.icon || 'file', questions: s.questions || [],
    });
  }

  function startNew() {
    setEditing('new');
    setForm({ name: '', description: '', prompt_base: '', icon: 'file', questions: [] });
  }

  function addQuestion() {
    setForm(f => ({ ...f, questions: [...f.questions, { id: 'q' + Date.now(), label: '', placeholder: '', required: false }] }));
  }

  function updateQuestion(idx, field, value) {
    setForm(f => {
      const qs = [...f.questions];
      qs[idx] = { ...qs[idx], [field]: value };
      return { ...f, questions: qs };
    });
  }

  function removeQuestion(idx) {
    setForm(f => ({ ...f, questions: f.questions.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
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

  const sectionStyle = { marginTop: 32 };
  const titleStyle = { fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 };
  const cardStyle = { padding: '16px 20px', marginBottom: 10, borderRadius: 10, background: 'linear-gradient(145deg, rgba(17,17,17,0.95), rgba(10,10,10,0.98))', border: '1px solid rgba(255,255,255,0.04)' };
  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'rgba(10,10,10,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', outline: 'none' };
  const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: 120, fontSize: '0.65rem', lineHeight: 1.6 };
  const labelStyle = { fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' };
  const btnPrimary = { padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, var(--action-primary), var(--brand-600))', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700 };
  const btnSecondary = { padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', cursor: 'pointer' };
  const badgeStyle = (bg, color) => ({ fontFamily: 'var(--font-mono)', fontSize: '0.42rem', fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: bg, color });

  return (
    <div style={sectionStyle}>
      <div style={titleStyle}>Estruturas de Copy</div>

      {loading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>Carregando...</div>}

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
              {!s.is_default && <button onClick={() => handleDeactivate(s.id)} style={{ ...btnSecondary, fontSize: '0.5rem', padding: '3px 10px', borderColor: 'rgba(255,51,51,0.2)', color: 'var(--error)' }}>Desativar</button>}
            </div>
          </div>
          {s.description && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)', marginTop: 4 }}>{s.description}</div>}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button onClick={() => setShowAIModal(true)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px dashed rgba(255,0,51,0.2)', background: 'rgba(255,0,51,0.03)', color: 'var(--brand-300)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Criar com IA
        </button>
        <button onClick={startNew} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', cursor: 'pointer' }}>Manual</button>
      </div>

      {/* Modal de edicao/criacao split-pane */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 1000, maxHeight: '88vh', borderRadius: 16, background: 'linear-gradient(145deg, rgba(14,14,14,0.99), rgba(8,8,8,0.99))', border: '1px solid rgba(255,255,255,0.06)', borderTop: '2px solid var(--action-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{editing === 'new' ? 'Nova Estrutura' : form.name || 'Editar'}</span>
                {editing !== 'new' && (() => { const s = structures.find(x => x.id === editing); return s ? <span style={badgeStyle(s.is_default ? 'rgba(59,130,246,0.08)' : 'rgba(34,197,94,0.08)', s.is_default ? '#3b82f6' : '#22c55e')}>{s.is_default ? 'PADRAO' : 'CUSTOM'}</span> : null; })()}
                {form.questions?.length > 0 && <span style={badgeStyle('rgba(249,115,22,0.08)', '#f97316')}>{form.questions.length} pergunta(s)</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditing(null)} style={btnSecondary}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>

            {/* Body split */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

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
                          <button onClick={() => removeQuestion(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: '0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600, padding: 0, textAlign: 'left' }}>Remover</button>
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
          </div>
        </div>
      )}

      {showAIModal && (
        <AIStructureModal
          onClose={() => setShowAIModal(false)}
          onGenerated={(data) => {
            setEditing('new');
            setForm({
              name: data.name || '',
              description: data.description || '',
              prompt_base: data.prompt_base || '',
              icon: 'file',
              questions: data.questions || [],
            });
            setShowAIModal(false);
          }}
        />
      )}
    </div>
  );
}

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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, padding: '28px 32px', borderRadius: 16, background: 'linear-gradient(145deg, rgba(14,14,14,0.99), rgba(8,8,8,0.99))', border: '1px solid rgba(255,255,255,0.06)', borderTop: '2px solid var(--action-primary)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6680" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Criar Estrutura com IA</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: 'var(--text-muted)' }}>Descreva o tipo de copy e a IA gera o prompt + perguntas-chave</div>
          </div>
        </div>

        {/* Descricao */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' }}>O que voce precisa gerar?</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Ex: Preciso de uma estrutura para criar paginas de captura de leads para cursos online. Deve ter headline, sub-headline, beneficios, depoimentos, FAQ e CTA forte..."
            style={{ ...inputS, resize: 'vertical', minHeight: 100, fontSize: '0.68rem', lineHeight: 1.6 }}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
          />
        </div>

        {/* Complementos: imagens + docs + audio */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {/* Imagens */}
          <input ref={imageInputRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); setUploadedImages(p => [...p, ...f.slice(0, 5 - p.length).map(x => ({ name: x.name, file: x }))]); e.target.value = ''; }} />
          <button onClick={() => imageInputRef.current?.click()} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            {uploadedImages.length > 0 ? uploadedImages.length + ' img' : 'Imagens'}
          </button>

          {/* Docs */}
          <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); setUploadedDocs(p => [...p, ...f.slice(0, 3 - p.length).map(x => ({ name: x.name, file: x }))]); e.target.value = ''; }} />
          <button onClick={() => docInputRef.current?.click()} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {uploadedDocs.length > 0 ? uploadedDocs.length + ' doc' : 'Docs'}
          </button>

          {/* Audio */}
          <button onClick={recording ? stopRecording : startRecording} disabled={transcribing} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px dashed ' + (recording ? 'rgba(255,51,51,0.3)' : 'rgba(255,255,255,0.1)'), background: recording ? 'rgba(255,51,51,0.06)' : 'transparent', color: recording ? '#ff3333' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, animation: recording ? 'pulse 1.2s ease-in-out infinite' : 'none' }}>
            {transcribing ? (
              <><div style={{ width: 8, height: 8, border: '1.5px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--brand-300)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Transcrevendo</>
            ) : (
              <><svg width="10" height="10" viewBox="0 0 24 24" fill={recording ? '#ff3333' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>{recording ? 'Parar' : 'Audio'}</>
            )}
          </button>
        </div>

        {/* Arquivos listados */}
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

        {/* Botoes */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600 }}>Cancelar</button>
          <button onClick={handleGenerate} disabled={generating || !description.trim()} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: generating || !description.trim() ? 'not-allowed' : 'pointer', background: generating || !description.trim() ? 'rgba(255,0,51,0.15)' : 'linear-gradient(135deg, var(--action-primary), var(--brand-600))', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, opacity: generating || !description.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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

/* StructureForm removido — substituido pelo modal split-pane inline na CopyStructuresSection */

export default function SettingsPage() {
  const { notify } = useNotification();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [message, setMessage] = useState(null);

  // Form para adicionar conta manual
  const [accountForm, setAccountForm] = useState({
    name: '',
    handle: '',
    adsToken: '',
    adsAccountId: '',
  });

  useEffect(() => {
    loadAccounts();
    // Verificar params de retorno do OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'meta_connected') {
      setMessage({ type: 'success', text: `Conta @${params.get('username')} conectada com sucesso via Meta!` });
    } else if (params.get('error')) {
      setMessage({ type: 'error', text: `Erro na autenticacao: ${params.get('error')}` });
    }
  }, []);

  async function loadAccounts() {
    try {
      console.log('[INFO][Frontend:Settings] Carregando contas...');
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts || []);
        console.log('[SUCESSO][Frontend:Settings] Contas carregadas', { total: (data.accounts || []).length });
      }
    } catch (err) {
      console.error('[ERRO][Frontend:Settings] Erro ao carregar contas', { error: err.message });
      notify('Erro ao carregar contas', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleConnectMeta() {
    // Redireciona para o fluxo OAuth do Instagram
    window.location.href = '/api/auth/instagram';
  }

  async function handleSaveAccount() {
    if (!accountForm.handle.trim()) return alert('Handle obrigatorio');

    try {
      console.log('[INFO][Frontend:Settings] Salvando nova conta', { handle: accountForm.handle });
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `acc_${Date.now()}`,
          name: accountForm.name || accountForm.handle,
          handle: accountForm.handle.startsWith('@') ? accountForm.handle : `@${accountForm.handle}`,
          avatarUrl: null,
          notes: null,
          oauthToken: null,
          adsToken: accountForm.adsToken || null,
          adsAccountId: accountForm.adsAccountId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddAccount(false);
        setAccountForm({ name: '', handle: '', adsToken: '', adsAccountId: '' });
        loadAccounts();
        setMessage({ type: 'success', text: 'Conta adicionada! Agora conecte via Meta OAuth.' });
        console.log('[SUCESSO][Frontend:Settings] Conta salva com sucesso', { handle: accountForm.handle });
        notify('Conta adicionada com sucesso!', 'success');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      console.error('[ERRO][Frontend:Settings] Erro ao salvar conta', { error: err.message });
      notify('Erro ao salvar conta', 'error');
    }
  }

  async function handleDeleteAccount(id) {
    if (!confirm('Tem certeza que deseja remover esta conta?')) return;
    try {
      console.log('[INFO][Frontend:Settings] Removendo conta', { id });
      const res = await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadAccounts();
        console.log('[SUCESSO][Frontend:Settings] Conta removida', { id });
        notify('Conta removida com sucesso', 'success');
      }
    } catch (err) {
      console.error('[ERRO][Frontend:Settings] Erro ao remover conta', { error: err.message });
      notify('Erro ao remover conta', 'error');
    }
  }

  async function handleUpdateAds(accountId, adsToken, adsAccountId) {
    try {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;

      console.log('[INFO][Frontend:Settings] Atualizando configuracoes de Ads', { accountId });
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...account,
          adsToken,
          adsAccountId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        loadAccounts();
        setMessage({ type: 'success', text: 'Configuracoes de Ads atualizadas!' });
        console.log('[SUCESSO][Frontend:Settings] Configuracoes de Ads atualizadas', { accountId });
        notify('Configuracoes de Ads atualizadas!', 'success');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      console.error('[ERRO][Frontend:Settings] Erro ao atualizar Ads', { error: err.message });
      notify('Erro ao atualizar configuracoes de Ads', 'error');
    }
  }

  return (
    <DashboardLayout activeTab="settings">
      <div className="page-header">
        <h1 className="page-title">Configuracoes</h1>
        <p className="page-subtitle">Gerencie contas, tokens e integracoes</p>
      </div>

      {message && (
        <div
          className="card"
          style={{
            borderColor: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
            marginBottom: 16,
            padding: 14,
          }}
        >
          <p style={{ color: message.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
            {message.text}
          </p>
        </div>
      )}

      {/* Conectar via Meta OAuth */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Conectar Instagram via Meta</h3>
        </div>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Conecte sua conta Instagram Business/Creator via OAuth para habilitar publicacao automatica,
          insights avancados e gerenciamento de campanhas.
        </p>
        <button className="btn btn-instagram" onClick={handleConnectMeta}>
          Conectar com Instagram
        </button>
      </div>

      {/* Contas */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Contas ({accounts.length})</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddAccount(true)}>
            + Adicionar Manual
          </button>
        </div>

        {loading ? (
          <div className="spinner" style={{ margin: '20px auto' }} />
        ) : accounts.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>
            Nenhuma conta adicionada.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="card"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {acc.avatarUrl ? (
                    <img src={acc.avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      @
                    </div>
                  )}
                  <div>
                    <strong>{acc.name}</strong>
                    <div className="text-sm text-muted">{acc.handle}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${acc.oauthToken ? 'badge-active' : 'badge-error'}`}>
                    {acc.oauthToken ? 'Meta OK' : 'Sem Token'}
                  </span>
                  <span className={`badge ${acc.adsToken ? 'badge-active' : 'badge-paused'}`}>
                    {acc.adsToken ? 'Ads OK' : 'Sem Ads'}
                  </span>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAccount(acc.id)}>
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal - Adicionar Conta Manual */}
      {showAddAccount && (
        <div className="modal-overlay" onClick={() => setShowAddAccount(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Adicionar Conta</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Nome</label>
                <input
                  className="input"
                  value={accountForm.name}
                  onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nome da conta"
                />
              </div>
              <div>
                <label className="label">Handle *</label>
                <input
                  className="input"
                  value={accountForm.handle}
                  onChange={(e) => setAccountForm((p) => ({ ...p, handle: e.target.value }))}
                  placeholder="@username"
                />
              </div>
              <div>
                <label className="label">Token de Ads (opcional)</label>
                <input
                  className="input"
                  value={accountForm.adsToken}
                  onChange={(e) => setAccountForm((p) => ({ ...p, adsToken: e.target.value }))}
                  placeholder="Token do Facebook Ads"
                />
              </div>
              <div>
                <label className="label">Account ID de Ads (opcional)</label>
                <input
                  className="input"
                  value={accountForm.adsAccountId}
                  onChange={(e) => setAccountForm((p) => ({ ...p, adsAccountId: e.target.value }))}
                  placeholder="act_XXXXXXXXXXXXX"
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddAccount(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveAccount}>Salvar</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Prompts dos Agentes ── */}
      <PromptsSection />

      {/* ── Estruturas de Copy ── */}
      <CopyStructuresSection />

    </DashboardLayout>
  );
}
