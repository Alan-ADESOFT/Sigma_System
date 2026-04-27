/**
 * pages/dashboard/settings/image.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Configurações do Gerador de Imagem (5 seções colapsáveis).
 *   1. Modelos disponíveis (toggle on/off + default)
 *   2. Chaves de API (Vertex/OpenAI/Fal/Gemini) — encriptadas no backend
 *   3. Prompt Engineer (modelos do otimizador + janela de cache)
 *   4. Limites (sliders)
 *   5. Outros (brandbook obrigatório, auto-cleanup)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '../../../components/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../context/NotificationContext';
import { Icon } from '../../../components/image/ImageIcons';
import HowItWorksImage from '../../../components/image/HowItWorksImage';
import styles from '../../../assets/style/imageSettings.module.css';

const PROVIDERS = [
  {
    id: 'vertex',
    name: 'Google Vertex AI',
    sub: 'Para Imagen 4 / Imagen 3. Use credenciais JSON de service account.',
    statusKey: 'has_vertex_credentials',
    fields: ['vertex_project_id', 'vertex_location'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    sub: 'Para gpt-image-1 (também usado para o Prompt Engineer).',
    statusKey: 'has_openai_key',
  },
  {
    id: 'fal',
    name: 'Fal.ai',
    sub: 'Para Flux 1.1 Pro.',
    statusKey: 'has_fal_key',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    sub: 'Para Nano Banana (gemini-2.0-flash-preview-image-generation).',
    statusKey: 'has_gemini_key',
  },
];

const PROMPT_LLM_OPTIONS = [
  { id: 'gpt-4o-mini',      label: 'GPT-4o mini ($)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 ($$)' },
  { id: 'gpt-4o',           label: 'GPT-4o ($$$)' },
];

const ALL_MODELS = [
  { id: 'imagen-4',     name: 'Imagen 4',      provider: 'vertex' },
  { id: 'gpt-image-1',  name: 'GPT Image 1',   provider: 'openai' },
  { id: 'flux-1.1-pro', name: 'Flux 1.1 Pro',  provider: 'fal' },
  { id: 'nano-banana',  name: 'Nano Banana',   provider: 'gemini' },
];

function Switch({ on, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={`${styles.switch} ${on ? styles.on : ''}`}
      onClick={() => onChange?.(!on)}
    >
      <span className={styles.switchKnob} />
    </button>
  );
}

function Section({ title, icon, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className={`glass-card ${styles.section}`}>
      <div className={styles.sectionHeader} onClick={() => setOpen(v => !v)}>
        <div className={styles.sectionTitle}>
          {icon && <Icon name={icon} size={13} />}
          {title}
        </div>
        <span className={styles.sectionToggle}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        </span>
      </div>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

function Slider({ value, min, max, step, onChange, suffix }) {
  return (
    <div className={styles.sliderRow}>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className={styles.sliderValue}>{value}{suffix || ''}</span>
    </div>
  );
}

export default function SettingsImagePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { notify } = useNotification();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estado dos editores de chaves
  const [openProvider, setOpenProvider] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [vertexJson, setVertexJson] = useState('');
  const [vertexProject, setVertexProject] = useState('');
  const [vertexLocation, setVertexLocation] = useState('us-central1');

  const isGod = user?.role === 'god' || user?.role === 'admin';

  useEffect(() => {
    if (!authLoading && user && !isGod) {
      notify('Acesso restrito', 'error');
      router.replace('/dashboard');
    }
  }, [authLoading, user, isGod, router, notify]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/image/settings');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json.data);
      setVertexProject(json.data.vertex_project_id || '');
      setVertexLocation(json.data.vertex_location || 'us-central1');
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isGod) load(); /* eslint-disable-next-line */ }, [isGod]);

  async function saveField(patch) {
    setSaving(true);
    try {
      const res = await fetch('/api/image/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json.data);
      notify('Salvo', 'success', 1800);
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveApiKey(provider) {
    setSaving(true);
    try {
      let body;
      if (provider === 'vertex') {
        // valida JSON
        try { JSON.parse(vertexJson); } catch { throw new Error('JSON inválido da service account'); }
        // Atualiza tb project/location (campo regular)
        await fetch('/api/image/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vertex_project_id: vertexProject || null,
            vertex_location: vertexLocation || 'us-central1',
          }),
        });
        body = { provider: 'vertex', credentials: vertexJson };
      } else {
        body = { provider, apiKey: keyInput };
      }
      const res = await fetch('/api/image/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json.data);
      notify('Chave salva', 'success');
      setOpenProvider(null);
      setKeyInput('');
      setVertexJson('');
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeApiKey(provider) {
    if (!window.confirm(`Remover chave de ${provider}?`)) return;
    setSaving(true);
    try {
      const body = provider === 'vertex' ? { provider, credentials: '' } : { provider, apiKey: '' };
      const res = await fetch('/api/image/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json.data);
      notify('Chave removida', 'success');
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function testKey(provider) {
    setSaving(true);
    try {
      const body = provider === 'vertex'
        ? { provider, credentials: vertexJson }
        : { provider, apiKey: keyInput };
      const res = await fetch('/api/image/settings/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.valid) notify('Chave válida', 'success');
      else notify(`Inválida: ${json.error || 'erro desconhecido'}`, 'error', 8000);
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  function toggleModel(id) {
    const cur = Array.isArray(data.enabled_models) ? data.enabled_models : [];
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    saveField({ enabled_models: next });
  }

  if (authLoading || loading) {
    return (
      <DashboardLayout activeTab="settings/image">
        <div style={{ padding: 40, textAlign: 'center' }}>
          <span className="spinner" style={{ width: 22, height: 22, margin: '0 auto' }} />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  const enabled = Array.isArray(data.enabled_models) ? data.enabled_models : [];

  return (
    <DashboardLayout activeTab="settings/image">
      <div className={styles.page}>
        <div className="page-header">
          <h1 className="page-title">Configurações do Gerador de Imagem</h1>
          <p className="page-subtitle">
            Modelos, chaves de API, limites e comportamento do gerador
          </p>
        </div>

        <HowItWorksImage variant="settings" />

        {/* ─── Modelos ───────────────────────────────────────────── */}
        <Section title="Modelos disponíveis" icon="layers">
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Modelo padrão</span>
            <select
              className="select"
              value={data.default_model}
              onChange={e => saveField({ default_model: e.target.value })}
            >
              {ALL_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <span className={styles.hint}>Usado por padrão ao abrir o workspace.</span>
          </div>

          <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>Habilitados no workspace</div>
          <div className={styles.modelGrid}>
            {ALL_MODELS.map(m => {
              const on = enabled.includes(m.id);
              return (
                <div key={m.id} className={`${styles.modelRow} ${on ? styles.active : ''}`}>
                  <div className={styles.modelInfo}>
                    <div className={styles.modelName}>{m.name}</div>
                    <div className={styles.modelSub}>via {m.provider}</div>
                  </div>
                  <Switch on={on} onChange={() => toggleModel(m.id)} ariaLabel={`Toggle ${m.name}`} />
                </div>
              );
            })}
          </div>
        </Section>

        {/* ─── Chaves de API ─────────────────────────────────────── */}
        <Section title="Chaves de API" icon="zap">
          {PROVIDERS.map(p => {
            const connected = !!data[p.statusKey];
            const editing = openProvider === p.id;
            return (
              <div key={p.id} className={styles.providerCard}>
                <div className={styles.providerHeader}>
                  <div>
                    <div className={styles.providerName}>{p.name}</div>
                    <div className={styles.providerStatus}>
                      <span className={`${styles.statusDot} ${connected ? styles.connected : styles.missing}`} />
                      <span style={{ color: connected ? 'var(--success)' : 'var(--text-muted)' }}>
                        {connected ? 'CONECTADA' : 'NÃO CONFIGURADA'}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.4 }}>
                      {p.sub}
                    </div>
                  </div>
                  <div className={styles.providerActions}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        if (editing) { setOpenProvider(null); }
                        else {
                          setOpenProvider(p.id);
                          setKeyInput('');
                          setVertexJson('');
                        }
                      }}
                    >
                      {editing ? 'Fechar' : connected ? 'Trocar' : 'Configurar'}
                    </button>
                    {connected && (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeApiKey(p.id)}>
                        Remover
                      </button>
                    )}
                  </div>
                </div>

                {editing && (
                  <div className={styles.providerEdit}>
                    {p.id === 'vertex' ? (
                      <>
                        <div className={styles.fieldRow}>
                          <div className={styles.field}>
                            <label className={styles.fieldLabel}>Project ID</label>
                            <input
                              className="sigma-input"
                              value={vertexProject}
                              onChange={e => setVertexProject(e.target.value)}
                              placeholder="meu-projeto-gcp"
                            />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.fieldLabel}>Location</label>
                            <input
                              className="sigma-input"
                              value={vertexLocation}
                              onChange={e => setVertexLocation(e.target.value)}
                              placeholder="us-central1"
                            />
                          </div>
                        </div>
                        <label className={styles.fieldLabel}>Service Account JSON</label>
                        <textarea
                          className={styles.vertexJson}
                          value={vertexJson}
                          onChange={e => setVertexJson(e.target.value)}
                          placeholder='{"type":"service_account","project_id":"...",...}'
                        />
                      </>
                    ) : (
                      <>
                        <label className={styles.fieldLabel}>API key</label>
                        <input
                          type="password"
                          className="sigma-input"
                          value={keyInput}
                          onChange={e => setKeyInput(e.target.value)}
                          placeholder={p.id === 'openai' ? 'sk-...' : p.id === 'fal' ? 'fal_...' : 'AIza...'}
                          autoComplete="new-password"
                        />
                      </>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => testKey(p.id)}
                        disabled={saving || (p.id === 'vertex' ? !vertexJson : !keyInput)}
                      >
                        Testar agora
                      </button>
                      <button
                        type="button"
                        className="sigma-btn-primary btn-sm"
                        onClick={() => saveApiKey(p.id)}
                        disabled={saving || (p.id === 'vertex' ? !vertexJson : !keyInput)}
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Section>

        {/* ─── Prompt Engineer ───────────────────────────────────── */}
        <Section title="Prompt Engineer" icon="terminal" defaultOpen={false}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>LLM do otimizador</label>
              <select
                className="select"
                value={data.prompt_engineer_model}
                onChange={e => saveField({ prompt_engineer_model: e.target.value })}
              >
                {PROMPT_LLM_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <span className={styles.hint}>Modelo usado para otimizar o prompt do usuário.</span>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>LLM do extrator de brandbook</label>
              <select
                className="select"
                value={data.brandbook_extractor_model}
                onChange={e => saveField({ brandbook_extractor_model: e.target.value })}
              >
                {PROMPT_LLM_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <span className={styles.hint}>Modelo usado para estruturar PDFs e gerar brandbook.</span>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Janela de cache de prompt</label>
            <Slider
              value={data.prompt_reuse_window_hours}
              min={0} max={72} step={1}
              suffix="h"
              onChange={v => saveField({ prompt_reuse_window_hours: v })}
            />
            <span className={styles.hint}>Tempo durante o qual prompts otimizados podem ser reusados (cache por hash MD5).</span>
          </div>
        </Section>

        {/* ─── Limites ───────────────────────────────────────────── */}
        <Section title="Limites" icon="alert" defaultOpen={false}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Daily — admin</label>
              <Slider value={data.daily_limit_admin} min={1} max={500} step={1} onChange={v => saveField({ daily_limit_admin: v })} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Daily — user</label>
              <Slider value={data.daily_limit_user} min={1} max={500} step={1} onChange={v => saveField({ daily_limit_user: v })} />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Hourly — admin</label>
              <Slider value={data.hourly_limit_admin} min={1} max={200} step={1} onChange={v => saveField({ hourly_limit_admin: v })} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Hourly — user</label>
              <Slider value={data.hourly_limit_user} min={1} max={200} step={1} onChange={v => saveField({ hourly_limit_user: v })} />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Concorrentes por tenant</label>
              <Slider value={data.concurrent_limit_per_tenant} min={1} max={20} step={1} onChange={v => saveField({ concurrent_limit_per_tenant: v })} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Templates / cliente</label>
              <Slider value={data.max_template_per_client} min={1} max={100} step={1} onChange={v => saveField({ max_template_per_client: v })} />
            </div>
          </div>
        </Section>

        {/* ─── Outros ────────────────────────────────────────────── */}
        <Section title="Outros" icon="settings" defaultOpen={false}>
          <div className={styles.toggleRow}>
            <div className={styles.toggleRowInfo}>
              <div className={styles.fieldLabel}>Brandbook obrigatório</div>
              <div className={styles.hint}>Quando ligado, gerar imagem para um cliente exige brandbook ativo.</div>
            </div>
            <Switch on={!!data.brandbook_required} onChange={v => saveField({ brandbook_required: v })} ariaLabel="Brandbook obrigatório" />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Auto-cleanup de jobs (dias)</label>
            <Slider value={data.auto_cleanup_days} min={1} max={90} step={1} suffix="d" onChange={v => saveField({ auto_cleanup_days: v })} />
            <span className={styles.hint}>Jobs concluídos/erro são removidos após este período. O cron interno roda diariamente às 03:00.</span>
          </div>
        </Section>

        {saving && (
          <div style={{ position: 'fixed', bottom: 20, left: 20, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5, marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
            salvando...
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
