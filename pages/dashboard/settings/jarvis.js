/**
 * Página: Config. Jarvis
 * Configura modelo, voz, limites diários, idioma e funções habilitadas.
 */

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/settingsJarvis.module.css';

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-5',   label: 'Claude Opus 4.5 — Mais preciso' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 — Recomendado' },
  { value: 'gpt-4o',            label: 'GPT-4o' },
  { value: 'gpt-4o-mini',       label: 'GPT-4o Mini — Mais rápido' },
];

export default function JarvisSettingsPage() {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [config, setConfig]   = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [usage, setUsage]     = useState(null);
  const [openGroups, setOpenGroups] = useState({}); // grupo -> bool

  /* ── Carregar config ── */
  const loadConfig = useCallback(async () => {
    try {
      const r = await fetch('/api/settings/jarvis-config');
      const d = await r.json();
      if (d.success) {
        setConfig(d.config);
        setCatalog(d.functions_catalog || []);
        // Inicia todos grupos abertos por padrão
        const groups = {};
        for (const fn of (d.functions_catalog || [])) groups[fn.group] = true;
        setOpenGroups(groups);
      }
    } catch (err) {
      console.error('[ERRO][SettingsJarvis] Falha ao carregar', err.message);
    }
    setLoading(false);
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const r = await fetch('/api/jarvis/usage');
      const d = await r.json();
      if (d.success) setUsage(d);
    } catch {}
  }, []);

  useEffect(() => { loadConfig(); loadUsage(); }, [loadConfig, loadUsage]);

  /* ── Salvar uma chave ── */
  async function saveKey(key, value) {
    try {
      const r = await fetch('/api/settings/jarvis-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      const d = await r.json();
      if (d.success) {
        // atualiza estado local sem recarregar
        if (key.startsWith('jarvis_fn_')) {
          const fnId = key.replace('jarvis_fn_', '');
          setConfig(prev => ({
            ...prev,
            functions: { ...prev.functions, [fnId]: value === 'true' },
          }));
        } else {
          setConfig(prev => ({ ...prev, [key]: value }));
        }
      } else {
        notify(d.error || 'Falha ao salvar', 'error');
      }
    } catch (err) {
      notify('Erro ao salvar configuração', 'error');
    }
  }

  /* ── UI helpers ── */
  function Toggle({ checked, onChange }) {
    return (
      <button
        type="button"
        className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
        onClick={() => onChange(!checked)}
        aria-label={checked ? 'Desativar' : 'Ativar'}
      >
        <span className={`${styles.toggleHandle} ${checked ? styles.toggleHandleOn : ''}`} />
      </button>
    );
  }

  if (loading || !config) {
    return (
      <DashboardLayout activeTab="settings/jarvis">
        <div style={{ padding: 40, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Carregando configurações...
        </div>
      </DashboardLayout>
    );
  }

  const isOnline = !!config.jarvis_model;
  const groupedFns = catalog.reduce((acc, fn) => {
    (acc[fn.group] = acc[fn.group] || []).push(fn);
    return acc;
  }, {});

  return (
    <DashboardLayout activeTab="settings/jarvis">
      <div className={styles.pageContainer}>
        {/* HEADER */}
        <div className={styles.pageHeader}>
          <div className={styles.titleBlock}>
            <h1 className="page-title">J.A.R.V.I.S</h1>
            <p className="page-subtitle">Configure o assistente de inteligência artificial da Sigma</p>
          </div>
          <div className={styles.statusBadge}>
            <span className={`${styles.statusDot} ${!isOnline ? styles.statusDotOffline : ''}`} />
            <span className={isOnline ? styles.statusOnline : styles.statusOffline}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* SEÇÃO 1 — MODELO */}
        <div className="set-section-card">
          <div className="set-section-header">
            <div className="set-section-header-left">
              <div className="set-section-title-row">
                <span className="set-section-dot" />
                <span className="set-section-title-text">Modelo de Inteligência</span>
                <span className="set-section-line" />
              </div>
              <div className="set-section-description">
                Qual modelo de IA o Jarvis vai usar para entender seus comandos.
              </div>
            </div>
          </div>
          <div className={styles.fieldRow}>
            <select
              className={styles.select}
              value={config.jarvis_model}
              onChange={e => saveKey('jarvis_model', e.target.value)}
            >
              {MODEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* SEÇÃO 2 — VOZ */}
        <div className="set-section-card">
          <div className="set-section-header">
            <div className="set-section-header-left">
              <div className="set-section-title-row">
                <span className="set-section-dot" />
                <span className="set-section-title-text">Voz do Assistente</span>
                <span className="set-section-line" />
              </div>
              <div className="set-section-description">
                Respostas por voz usando síntese de fala da ElevenLabs.
              </div>
            </div>
          </div>

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>Reprodução de voz</div>
              <div className={styles.toggleDesc}>Quando ativado, o Jarvis responde por áudio além de texto.</div>
            </div>
            <Toggle
              checked={config.jarvis_voice_enabled === 'true'}
              onChange={v => saveKey('jarvis_voice_enabled', v ? 'true' : 'false')}
            />
          </div>

          <div className={styles.fieldRow} style={{ marginTop: 12 }}>
            <div className={styles.fieldLabel}>API Key ElevenLabs</div>
            <input
              type="password"
              className={styles.input}
              disabled={config.jarvis_voice_enabled !== 'true'}
              defaultValue={config.jarvis_elevenlabs_key || ''}
              placeholder="xi-..."
              onBlur={e => saveKey('jarvis_elevenlabs_key', e.target.value)}
            />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.fieldLabel}>ID da Voz</div>
            <input
              type="text"
              className={styles.input}
              disabled={config.jarvis_voice_enabled !== 'true'}
              defaultValue={config.jarvis_voice_id || ''}
              placeholder="21m00Tcm4TlvDq8ikWAM"
              onBlur={e => saveKey('jarvis_voice_id', e.target.value)}
            />
          </div>
        </div>

        {/* SEÇÃO 3 — LIMITES */}
        <div className="set-section-card">
          <div className="set-section-header">
            <div className="set-section-header-left">
              <div className="set-section-title-row">
                <span className="set-section-dot" />
                <span className="set-section-title-text">Limites Diários</span>
                <span className="set-section-line" />
              </div>
              <div className="set-section-description">
                Controla quantos comandos cada tipo de usuário pode fazer por dia. Reseta à meia-noite.
              </div>
            </div>
          </div>

          <div className={styles.inputRow}>
            <div className={styles.fieldRow}>
              <div className={styles.fieldLabel}>Administradores</div>
              <input
                type="number" min={1} max={200}
                className={styles.input}
                defaultValue={config.jarvis_daily_limit_admin}
                onBlur={e => saveKey('jarvis_daily_limit_admin', e.target.value)}
              />
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.fieldLabel}>Usuários</div>
              <input
                type="number" min={1} max={50}
                className={styles.input}
                defaultValue={config.jarvis_daily_limit_user}
                onBlur={e => saveKey('jarvis_daily_limit_user', e.target.value)}
              />
            </div>
          </div>

          {usage && (
            <div className={styles.quotaInfo}>
              Você usou <strong>{usage.today_count}</strong> de <strong>{usage.limit}</strong> comandos hoje
              ({usage.remaining} restante{usage.remaining === 1 ? '' : 's'}).
            </div>
          )}
        </div>

        {/* SEÇÃO 4 — IDIOMA */}
        <div className="set-section-card">
          <div className="set-section-header">
            <div className="set-section-header-left">
              <div className="set-section-title-row">
                <span className="set-section-dot" />
                <span className="set-section-title-text">Idioma Padrão</span>
                <span className="set-section-line" />
              </div>
              <div className="set-section-description">
                Idioma das respostas do Jarvis quando o usuário não especifica.
              </div>
            </div>
          </div>
          <div className={styles.langToggle}>
            {['pt', 'en'].map(lang => (
              <button
                key={lang}
                className={`${styles.langOption} ${config.jarvis_language === lang ? styles.langOptionActive : ''}`}
                onClick={() => saveKey('jarvis_language', lang)}
              >
                {lang === 'pt' ? 'PT-BR' : 'EN'}
              </button>
            ))}
          </div>
        </div>

        {/* SEÇÃO 5 — FUNÇÕES */}
        <div className="set-section-card">
          <div className="set-section-header">
            <div className="set-section-header-left">
              <div className="set-section-title-row">
                <span className="set-section-dot" />
                <span className="set-section-title-text">Funções Disponíveis</span>
                <span className="set-section-line" />
              </div>
              <div className="set-section-description">
                Ative ou desative cada capacidade do Jarvis. Por padrão, todas estão ativas.
              </div>
            </div>
          </div>

          {Object.entries(groupedFns).map(([groupName, fns]) => {
            const activeCount = fns.filter(f => config.functions[f.id]).length;
            const isOpen = !!openGroups[groupName];
            const allOn = activeCount === fns.length;
            return (
              <div key={groupName} className={styles.functionGroup}>
                <div
                  className={styles.groupHeader}
                  onClick={() => setOpenGroups(prev => ({ ...prev, [groupName]: !isOpen }))}
                >
                  <div className={styles.groupTitle}>
                    <span className={`${styles.groupChevron} ${isOpen ? styles.groupChevronOpen : ''}`}>▶</span>
                    {groupName}
                    <span className={styles.groupCount}>{activeCount}/{fns.length} ativas</span>
                  </div>
                  <Toggle
                    checked={allOn}
                    onChange={async (v) => {
                      // toggle de todo o grupo
                      for (const f of fns) {
                        await saveKey(`jarvis_fn_${f.id}`, v ? 'true' : 'false');
                      }
                    }}
                  />
                </div>

                {isOpen && (
                  <div className={styles.groupBody}>
                    {fns.map(fn => {
                      const on = !!config.functions[fn.id];
                      return (
                        <div key={fn.id} className={styles.functionRow}>
                          <div className={styles.functionInfo}>
                            <div className={styles.functionTitle}>
                              {fn.title}
                              <span className={`${styles.functionBadge} ${on ? styles.badgeOn : styles.badgeOff}`}>
                                {on ? 'ATIVO' : 'INATIVO'}
                              </span>
                            </div>
                            <div className={styles.functionDesc}>{fn.description}</div>
                          </div>
                          <Toggle
                            checked={on}
                            onChange={v => saveKey(`jarvis_fn_${fn.id}`, v ? 'true' : 'false')}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
