/**
 * pages/api/settings/ads-config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/settings/ads-config         → retorna todas as chaves
 * @route POST /api/settings/ads-config        → salva { key, value }
 *
 * Padrão idêntico a copy-config.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { getSetting, setSetting } from '../../../models/settings.model';

const ALLOWED_KEYS = [
  'ads_model_strong',
  'ads_model_medium',
  'ads_model_weekly',
  'ads_ai_weekly_enabled',
  'ads_anomaly_detection',
  'ads_anomaly_cpa_threshold',
  'ads_anomaly_roas_drop_pct',
  'ads_anomaly_frequency_max',
  'ads_cache_ttl_today_minutes',
  'ads_cache_ttl_history_hours',
  'ads_token_refresh_days_ahead',
];

const DEFAULTS = {
  ads_model_strong:             null,
  ads_model_medium:             null,
  ads_model_weekly:             'claude-sonnet-4-5',
  ads_ai_weekly_enabled:        'false',
  ads_anomaly_detection:        'true',
  ads_anomaly_cpa_threshold:    '3',
  ads_anomaly_roas_drop_pct:    '40',
  ads_anomaly_frequency_max:    '3.5',
  ads_cache_ttl_today_minutes:  '60',
  ads_cache_ttl_history_hours:  '24',
  ads_token_refresh_days_ahead: '15',
};

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  if (req.method === 'GET') {
    try {
      const data = {};
      for (const key of ALLOWED_KEYS) {
        const v = await getSetting(tenantId, key);
        data[key] = v != null ? v : DEFAULTS[key];
      }
      return res.json({ success: true, data });
    } catch (err) {
      console.error('[ERRO][API:ads-config] GET', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { key, value } = req.body || {};
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ success: false, error: 'Chave inválida' });
    }
    try {
      await setSetting(tenantId, key, value == null ? '' : String(value));
      console.log('[SUCESSO][API:ads-config] Configuração salva', { key });
      return res.json({ success: true });
    } catch (err) {
      console.error('[ERRO][API:ads-config] POST', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Método não permitido' });
}
