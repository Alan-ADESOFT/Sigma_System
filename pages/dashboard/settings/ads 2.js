/**
 * pages/dashboard/settings/ads.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Configurações do módulo Ads — modelos de IA, thresholds de anomalia, cache
 * e refresh de token.
 *
 * Cada campo salva via POST /api/settings/ads-config (key/value).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { useNotification } from '../../../context/NotificationContext';
import styles from '../../../assets/style/adsSettings.module.css';

const MODEL_OPTIONS = [
  { value: '',                          label: 'Padrão (do .env)' },
  { value: 'claude-opus-4-20250514',    label: 'Claude Opus 4 (caro, mais profundo)' },
  { value: 'claude-sonnet-4-5',         label: 'Claude Sonnet 4.5 (recomendado)' },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5',          label: 'Claude Haiku 4.5 (rápido, barato)' },
  { value: 'gpt-4o',                    label: 'GPT-4o' },
  { value: 'gpt-4o-mini',               label: 'GPT-4o Mini' },
];

export default function AdsSettingsPage() {
  const { notify } = useNotification();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    fetch('/api/settings/ads-config')
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data); else notify(d.error || 'Falha ao carregar', 'error'); })
      .catch(() => notify('Falha ao carregar configurações', 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function save(key, value) {
    setSavingKey(key);
    setData((prev) => ({ ...prev, [key]: value }));
    try {
      const r = await fetch('/api/settings/ads-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: value == null ? '' : String(value) }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      notify('Configuração salva', 'success');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return (
      <DashboardLayout activeTab="settings/ads">
        <div className={styles.loadingText}>Carregando configurações...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="settings/ads">
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">Config. Ads</h1>
        <p className="page-subtitle">Modelos de IA, detecção de anomalias e cache do módulo de Ads</p>
      </div>

      {/* Seção: Modelos */}
      <section className="set-section-card">
        <header className="set-section-header">
          <div className="set-section-header-left">
            <div className="set-section-title-row">
              <span className="set-section-dot" />
              <span className="set-section-title-text">Modelos de IA</span>
              <span className="set-section-line" />
            </div>
            <div className="set-section-description">
              Cada operação usa um modelo configurável. Deixe vazio para herdar do .env.
            </div>
          </div>
        </header>
        <div className={styles.row}>
          <div className={styles.toggleInfo}>
            <div className={styles.label}>Diagnóstico on-demand (Strong)</div>
            <div className={styles.helpText}>
              Usado quando você clica "Analisar com IA". Análise profunda aplicando o framework — recomenda-se Opus.
            </div>
          </div>
          <select
            className={styles.select}
            value={data?.ads_model_strong ?? ''}
            onChange={(e) => save('ads_model_strong', e.target.value)}
            disabled={savingKey === 'ads_model_strong'}
          >
            {MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className={styles.row}>
          <div className={styles.toggleInfo}>
            <div className={styles.label}>Relatório semanal (Weekly)</div>
            <div className={styles.helpText}>
              Cron de segunda-feira gera 1 relatório executivo por cliente. Sonnet é mais barato e suficiente — padrão.
            </div>
          </div>
          <select
            className={styles.select}
            value={data?.ads_model_weekly ?? 'claude-sonnet-4-5'}
            onChange={(e) => save('ads_model_weekly', e.target.value)}
            disabled={savingKey === 'ads_model_weekly'}
          >
            {MODEL_OPTIONS.filter((o) => o.value !== '').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className={styles.row}>
          <div className={styles.toggleInfo}>
            <div className={styles.label}>Explicação de anomalia (Medium)</div>
            <div className={styles.helpText}>
              Resposta curta de 3 frases sobre anomalias detectadas. Pode usar um modelo barato.
            </div>
          </div>
          <select
            className={styles.select}
            value={data?.ads_model_medium ?? ''}
            onChange={(e) => save('ads_model_medium', e.target.value)}
            disabled={savingKey === 'ads_model_medium'}
          >
            {MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </section>

      {/* Seção: Análise automática */}
      <section className="set-section-card">
        <header className="set-section-header">
          <div className="set-section-header-left">
            <div className="set-section-title-row">
              <span className="set-section-dot" />
              <span className="set-section-title-text">Análise Automática</span>
              <span className="set-section-line" />
            </div>
            <div className="set-section-description">
              Crons que rodam diariamente / semanalmente em background.
            </div>
          </div>
        </header>
        <ToggleRow
          label="Relatório semanal automático"
          description="Toda segunda-feira de manhã gera um relatório executivo e notifica o tenant."
          value={data?.ads_ai_weekly_enabled === 'true'}
          saving={savingKey === 'ads_ai_weekly_enabled'}
          onChange={(checked) => save('ads_ai_weekly_enabled', checked ? 'true' : 'false')}
        />
        <ToggleRow
          label="Detecção diária de anomalias"
          description="Cron diário detecta picos de CPA, queda de ROAS, frequência alta etc."
          value={data?.ads_anomaly_detection !== 'false'}
          saving={savingKey === 'ads_anomaly_detection'}
          onChange={(checked) => save('ads_anomaly_detection', checked ? 'true' : 'false')}
        />
      </section>

      {/* Seção: Thresholds */}
      <section className="set-section-card">
        <header className="set-section-header">
          <div className="set-section-header-left">
            <div className="set-section-title-row">
              <span className="set-section-dot" />
              <span className="set-section-title-text">Thresholds de Anomalia</span>
              <span className="set-section-line" />
            </div>
            <div className="set-section-description">
              Ajuste os limites que disparam alertas automáticos.
            </div>
          </div>
        </header>
        <NumberRow
          label="Multiplicador de CPA"
          help="Alerta quando CPA dos últimos 7d > N × média histórica"
          value={data?.ads_anomaly_cpa_threshold || '3'}
          step="0.1"
          saving={savingKey === 'ads_anomaly_cpa_threshold'}
          onCommit={(v) => save('ads_anomaly_cpa_threshold', v)}
        />
        <NumberRow
          label="% de queda de ROAS"
          help="Alerta quando ROAS cai mais de N% vs média histórica"
          value={data?.ads_anomaly_roas_drop_pct || '40'}
          saving={savingKey === 'ads_anomaly_roas_drop_pct'}
          onCommit={(v) => save('ads_anomaly_roas_drop_pct', v)}
        />
        <NumberRow
          label="Frequência máxima"
          help="Alerta quando frequency > este limite"
          value={data?.ads_anomaly_frequency_max || '3.5'}
          step="0.1"
          saving={savingKey === 'ads_anomaly_frequency_max'}
          onCommit={(v) => save('ads_anomaly_frequency_max', v)}
        />
      </section>

      {/* Seção: Cache */}
      <section className="set-section-card">
        <header className="set-section-header">
          <div className="set-section-header-left">
            <div className="set-section-title-row">
              <span className="set-section-dot" />
              <span className="set-section-title-text">Cache</span>
              <span className="set-section-line" />
            </div>
            <div className="set-section-description">
              TTL do cache de insights por tipo de range.
            </div>
          </div>
        </header>
        <NumberRow
          label="TTL hoje (minutos)"
          help="Para ranges que incluem o dia atual"
          value={data?.ads_cache_ttl_today_minutes || '60'}
          saving={savingKey === 'ads_cache_ttl_today_minutes'}
          onCommit={(v) => save('ads_cache_ttl_today_minutes', v)}
        />
        <NumberRow
          label="TTL histórico (horas)"
          help="Para ranges puramente passados"
          value={data?.ads_cache_ttl_history_hours || '24'}
          saving={savingKey === 'ads_cache_ttl_history_hours'}
          onCommit={(v) => save('ads_cache_ttl_history_hours', v)}
        />
      </section>

      {/* Seção: Token */}
      <section className="set-section-card">
        <header className="set-section-header">
          <div className="set-section-header-left">
            <div className="set-section-title-row">
              <span className="set-section-dot" />
              <span className="set-section-title-text">Token Meta</span>
              <span className="set-section-line" />
            </div>
            <div className="set-section-description">
              Quando renovar tokens long-lived antes de expirarem.
            </div>
          </div>
        </header>
        <NumberRow
          label="Dias antes de expirar para refresh"
          help="O cron de refresh roda quando faltam ≤ N dias"
          value={data?.ads_token_refresh_days_ahead || '15'}
          saving={savingKey === 'ads_token_refresh_days_ahead'}
          onCommit={(v) => save('ads_token_refresh_days_ahead', v)}
        />
      </section>
    </DashboardLayout>
  );
}

/* ─── Subcomponentes locais ─────────────────────────────────────────────── */

function ToggleRow({ label, description, value, saving, onChange }) {
  return (
    <div className={styles.row}>
      <div className={styles.toggleInfo}>
        <div className={styles.label}>{label}</div>
        {description && <div className={styles.helpText}>{description}</div>}
      </div>
      <button
        type="button"
        className={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
        onClick={() => onChange(!value)}
        disabled={saving}
        aria-pressed={value}
      >
        <span className={styles.toggleKnob} />
      </button>
    </div>
  );
}

function NumberRow({ label, help, value, step, saving, onCommit }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className={styles.row}>
      <div className={styles.toggleInfo}>
        <div className={styles.label}>{label}</div>
        {help && <div className={styles.helpText}>{help}</div>}
      </div>
      <input
        type="number"
        step={step || '1'}
        className={styles.numberInput}
        value={local}
        disabled={saving}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (String(local) !== String(value)) onCommit(local); }}
      />
    </div>
  );
}
