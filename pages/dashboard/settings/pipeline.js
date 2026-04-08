import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/settingsPipeline.module.css';

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-5',   label: 'Claude Opus 4.5' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'gpt-4o',            label: 'GPT-4o' },
  { value: 'gpt-4o-mini',       label: 'GPT-4o Mini' },
];

const SEARCH_OPTIONS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4o',      label: 'GPT-4o' },
];

const MODEL_LEVELS = [
  {
    key: 'pipeline_model_weak', label: 'Tarefas rapidas', badge: 'WEAK', badgeClass: 'badgeWeak',
    desc: 'Formatacao de texto, correcao gramatical, polimento de output e melhorias simples',
  },
  {
    key: 'pipeline_model_medium', label: 'Agentes principais', badge: 'MEDIUM', badgeClass: 'badgeMedium',
    desc: 'Diagnostico, analise de concorrentes, publico-alvo — agentes 1, 2A, 2B, 3 e 4A do pipeline',
  },
  {
    key: 'pipeline_model_strong', label: 'Estrategia avancada', badge: 'STRONG', badgeClass: 'badgeStrong',
    desc: 'Construcao do avatar (4B) e posicionamento da marca (5) — exigem raciocinio mais complexo',
  },
  {
    key: 'pipeline_model_search', label: 'Pesquisa na web', badge: 'SEARCH', badgeClass: 'badgeSearch',
    desc: 'Buscas de concorrentes e avatar na internet — agentes 2A e 4A usam web search',
  },
];

const AGENT_LIST = [
  { name: 'agente1',  label: 'Agente 1 — Diagnostico',              desc: 'Analisa dados e monta diagnostico estrategico' },
  { name: 'agente2a', label: 'Agente 2A — Pesquisa de Concorrentes', desc: 'Pesquisa concorrentes na web' },
  { name: 'agente2b', label: 'Agente 2B — Analise de Concorrentes',  desc: 'Analisa dados dos concorrentes' },
  { name: 'agente3',  label: 'Agente 3 — Publico-Alvo',              desc: 'Define perfil do publico' },
  { name: 'agente4a', label: 'Agente 4A — Pesquisa de Avatar',       desc: 'Pesquisa dores e linguagem do publico' },
  { name: 'agente4b', label: 'Agente 4B — Construcao do Avatar',     desc: 'Constroi avatar completo' },
  { name: 'agente5',  label: 'Agente 5 — Posicionamento',            desc: 'Define posicionamento da marca' },
];

export default function PipelineSettingsPage() {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState({});
  const [fallback, setFallback] = useState({ pipeline_fallback_enabled: 'false', pipeline_fallback_model: 'gpt-4o-mini' });
  const [prompts, setPrompts] = useState({});
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [promptText, setPromptText] = useState('');
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const r = await fetch('/api/settings/pipeline-config');
      const d = await r.json();
      if (d.success) {
        setModels(d.data.models);
        setFallback(d.data.fallback);
        setPrompts(d.data.prompts);
      }
    } catch (err) {
      console.error('[ERRO][PipelineSettings] Falha ao carregar config', err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  async function saveModel(key, value) {
    try {
      const r = await fetch('/api/settings/pipeline-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'model', key, value }),
      });
      const d = await r.json();
      if (d.success) {
        setModels(prev => ({ ...prev, [key]: value }));
        notify('Modelo atualizado', 'success');
      }
    } catch { notify('Erro ao salvar modelo', 'error'); }
  }

  async function saveFallback(key, value) {
    try {
      const r = await fetch('/api/settings/pipeline-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'fallback', key, value }),
      });
      const d = await r.json();
      if (d.success) {
        setFallback(prev => ({ ...prev, [key]: value }));
      }
    } catch { notify('Erro ao salvar fallback', 'error'); }
  }

  function handleToggleAgent(agentName) {
    if (expandedAgent === agentName) {
      setExpandedAgent(null);
    } else {
      setExpandedAgent(agentName);
      setPromptText(prompts[agentName]?.prompt || '');
    }
  }

  async function handleSavePrompt() {
    if (!expandedAgent) return;
    setSaving(true);
    try {
      const r = await fetch('/api/settings/pipeline-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'prompt_override', agentName: expandedAgent, value: promptText }),
      });
      const d = await r.json();
      if (d.success) {
        setPrompts(prev => ({ ...prev, [expandedAgent]: { ...prev[expandedAgent], isCustom: true, prompt: promptText } }));
        notify('Prompt salvo', 'success');
      }
    } catch { notify('Erro ao salvar prompt', 'error'); }
    setSaving(false);
  }

  async function handleRestorePrompt() {
    if (!expandedAgent || !confirm('Restaurar prompt ao padrao? A customizacao sera perdida.')) return;
    setSaving(true);
    try {
      const r = await fetch('/api/settings/pipeline-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'prompt_restore', agentName: expandedAgent }),
      });
      const d = await r.json();
      if (d.success) {
        // Recarrega para pegar o prompt padrão
        await loadConfig();
        const updatedPrompt = prompts[expandedAgent]?.defaultPrompt || '';
        setPromptText(updatedPrompt);
        notify('Prompt restaurado ao padrao', 'success');
      }
    } catch { notify('Erro ao restaurar', 'error'); }
    setSaving(false);
  }

  const fallbackEnabled = fallback.pipeline_fallback_enabled === 'true';

  if (loading) {
    return (
      <DashboardLayout activeTab="settings/pipeline">
        <div className={styles.loadingText}>Carregando configuracoes...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="settings/pipeline">
      <div className={styles.pageContainer}>
        <div style={{ marginBottom: 28 }}>
          <h1 className="page-title">Config. Pipeline</h1>
          <p className="page-subtitle">
            Modelos de IA, fallback automático e prompts dos agentes
          </p>
        </div>

        {/* ── Seção 1: Modelos por Nível ── */}
        <div className="set-section-card">
          <div className="set-section-header">
            <div className="set-section-header-left">
              <div className="set-section-title-row">
                <span className="set-section-dot" />
                <span className="set-section-title-text">Modelos do Pipeline</span>
                <span className="set-section-line" />
              </div>
              <div className="set-section-description">
                Escolha qual modelo de IA roda em cada etapa do pipeline.
              </div>
            </div>
          </div>

          {MODEL_LEVELS.map(level => {
            const options = level.key === 'pipeline_model_search' ? SEARCH_OPTIONS : MODEL_OPTIONS;
            return (
              <div key={level.key} className={styles.modelRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={styles.modelLabel}>{level.label}</div>
                    <span className={`${styles.modelBadge} ${styles[level.badgeClass]}`}>{level.badge}</span>
                  </div>
                  <div className={styles.modelDesc}>{level.desc}</div>
                </div>
                <select
                  className={styles.modelSelect}
                  value={models[level.key] || ''}
                  onChange={e => saveModel(level.key, e.target.value)}
                >
                  {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {/* ── Seção 2: Fallback Automático ── */}
        <div className="set-section-card">
          <div className="set-section-header">
            <div className="set-section-header-left">
              <div className="set-section-title-row">
                <span className="set-section-dot" />
                <span className="set-section-title-text">Fallback Automático</span>
                <span className="set-section-line" />
              </div>
              <div className="set-section-description">
                Se o modelo principal falhar por cota ou token, o sistema tenta este modelo automaticamente.
              </div>
            </div>
          </div>

          <div className={styles.fallbackRow}>
            <div
              className={styles.toggleContainer}
              onClick={() => {
                const newVal = fallbackEnabled ? 'false' : 'true';
                saveFallback('pipeline_fallback_enabled', newVal);
              }}
            >
              <div className={`${styles.toggle} ${fallbackEnabled ? styles.active : ''}`}>
                <div className={styles.toggleDot} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-primary)' }}>
                Fallback
              </span>
            </div>

            <span className={`${styles.statusBadge} ${fallbackEnabled ? styles.statusActive : styles.statusInactive}`}>
              {fallbackEnabled ? 'ATIVO' : 'INATIVO'}
            </span>

            <div style={{ flex: 1 }} />

            <select
              className={styles.modelSelect}
              value={fallback.pipeline_fallback_model || 'gpt-4o-mini'}
              onChange={e => saveFallback('pipeline_fallback_model', e.target.value)}
              disabled={!fallbackEnabled}
              style={{ opacity: fallbackEnabled ? 1 : 0.4 }}
            >
              {MODEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Seção 3: Prompts dos Agentes ── */}
        <div className="set-section-card">
          <div className="set-section-header">
            <div className="set-section-header-left">
              <div className="set-section-title-row">
                <span className="set-section-dot" />
                <span className="set-section-title-text">Prompts dos Agentes</span>
                <span className="set-section-line" />
              </div>
              <div className="set-section-description">
                Edite o prompt base de cada agente. Salvar aqui sobrescreve o padrão do sistema.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {AGENT_LIST.map(agent => {
              const isExpanded = expandedAgent === agent.name;
              const isCustom = prompts[agent.name]?.isCustom;

              return (
                <div key={agent.name}>
                  <div
                    className={`${styles.agentHeader} ${isExpanded ? styles.agentHeaderActive : ''}`}
                    onClick={() => handleToggleAgent(agent.name)}
                  >
                    <div>
                      <div className={styles.agentName}>{agent.label}</div>
                      <div className={styles.agentDesc}>{agent.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={isCustom ? styles.promptBadgeCustom : styles.promptBadgeDefault}>
                        {isCustom ? 'CUSTOMIZADO' : 'PADRAO'}
                      </span>
                      <svg
                        width="10" height="10" viewBox="0 0 24 24" fill="none"
                        stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
                      >
                        <polyline points="6,9 12,15 18,9" />
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles.promptEditor}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                        Use placeholders: {'{DADOS_CLIENTE}'}, {'{OUTPUT_DIAGNOSTICO}'}, {'{OUTPUT_AVATAR}'}, etc.
                      </div>
                      <textarea
                        className={styles.promptTextarea}
                        value={promptText}
                        onChange={e => setPromptText(e.target.value)}
                        rows={18}
                      />
                      <div className={styles.promptActions}>
                        {isCustom && (
                          <button className={styles.btnRestore} onClick={handleRestorePrompt} disabled={saving}>
                            Restaurar Padrao
                          </button>
                        )}
                        <button className={styles.btnSave} onClick={handleSavePrompt} disabled={saving}>
                          {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
