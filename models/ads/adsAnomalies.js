/**
 * models/ads/adsAnomalies.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Detecção e CRUD de anomalias de campanhas Meta Ads.
 *
 * Tipos:
 *   · cpa_spike       — CPA dos últimos 7d > N × média dos 30d anteriores
 *   · roas_drop       — ROAS dos últimos 7d caiu > N% vs média histórica
 *   · frequency_high  — frequency atual > limite
 *   · no_sales_3d     — campanha ativa há 3+ dias sem conversão mas com spend
 *   · budget_burn     — gasto > 80% do daily_budget consistentemente
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');
const { getSetting } = require('../settings.model');
const { createNotification } = require('../clientForm');
const adsService = require('./adsService');

const DEFAULT_CPA_MULTIPLIER     = 3;
const DEFAULT_ROAS_DROP_PCT      = 40;
const DEFAULT_FREQUENCY_MAX      = 3.5;

/* ─── CRUD ──────────────────────────────────────────────────────────────── */

async function createAnomaly(tenantId, clientId, params) {
  const {
    scope, targetId, targetName, anomalyType, severity = 'medium',
    metricName, metricValue, baselineValue, deltaPct, description,
  } = params;

  // Evita duplicatas: se já existe anomalia ABERTA do mesmo tipo+target nas últimas 24h, ignora
  const existing = await queryOne(
    `SELECT id FROM ads_anomalies
      WHERE tenant_id = $1 AND client_id = $2
        AND scope = $3 AND target_id = $4 AND anomaly_type = $5
        AND status = 'open'
        AND detected_at > now() - interval '24 hours'
      LIMIT 1`,
    [tenantId, clientId, scope, targetId, anomalyType]
  );
  if (existing) return null;

  const row = await queryOne(
    `INSERT INTO ads_anomalies (
       tenant_id, client_id, scope, target_id, target_name,
       anomaly_type, severity, metric_name, metric_value,
       baseline_value, delta_pct, description
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
     ) RETURNING *`,
    [
      tenantId, clientId, scope, targetId, targetName,
      anomalyType, severity, metricName, metricValue,
      baselineValue || null, deltaPct || null, description,
    ]
  );

  // Notificação no sininho
  try {
    await createNotificationFor(row);
  } catch (e) {
    console.warn('[WARN][adsAnomalies] notification failed:', e.message);
  }

  return row;
}

async function createNotificationFor(anomaly) {
  const titles = {
    cpa_spike:      'CPA disparou em campanha de ads',
    roas_drop:      'Queda de ROAS detectada em ads',
    frequency_high: 'Frequência alta em campanha de ads',
    no_sales_3d:    'Campanha de ads sem conversões há 3+ dias',
    budget_burn:    'Campanha de ads queimando budget',
  };
  const title = titles[anomaly.anomaly_type] || 'Anomalia detectada em ads';
  const message = `${anomaly.target_name || anomaly.target_id}: ${anomaly.description}`;
  return createNotification(
    anomaly.tenant_id,
    'ads_anomaly_detected',
    title,
    message,
    anomaly.client_id,
    {
      anomalyId: anomaly.id,
      type: anomaly.anomaly_type,
      severity: anomaly.severity,
      metricValue: anomaly.metric_value,
      baselineValue: anomaly.baseline_value,
      deltaPct: anomaly.delta_pct,
    }
  );
}

async function getOpenAnomalies(tenantId, clientId) {
  return query(
    `SELECT * FROM ads_anomalies
      WHERE tenant_id = $1 AND client_id = $2 AND status = 'open'
      ORDER BY detected_at DESC`,
    [tenantId, clientId]
  );
}

async function getAllForTenant(tenantId, opts = {}) {
  const limit = Math.min(opts.limit || 50, 200);
  const conditions = ['tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;
  if (opts.clientId) { conditions.push(`client_id = $${idx++}`); params.push(opts.clientId); }
  if (opts.status)   { conditions.push(`status = $${idx++}`);    params.push(opts.status); }
  if (opts.severity) { conditions.push(`severity = $${idx++}`);  params.push(opts.severity); }
  params.push(limit);

  return query(
    `SELECT * FROM ads_anomalies
      WHERE ${conditions.join(' AND ')}
      ORDER BY detected_at DESC
      LIMIT $${idx}`,
    params
  );
}

async function acknowledge(tenantId, anomalyId) {
  return queryOne(
    `UPDATE ads_anomalies
        SET status          = 'acknowledged',
            acknowledged_at = now(),
            updated_at      = now()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [anomalyId, tenantId]
  );
}

async function resolve(tenantId, anomalyId) {
  return queryOne(
    `UPDATE ads_anomalies
        SET status      = 'resolved',
            resolved_at = now(),
            updated_at  = now()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [anomalyId, tenantId]
  );
}

/* ─── Detector ──────────────────────────────────────────────────────────── */

async function loadThresholds(tenantId) {
  const [cpaT, roasT, freqT] = await Promise.all([
    getSetting(tenantId, 'ads_anomaly_cpa_threshold'),
    getSetting(tenantId, 'ads_anomaly_roas_drop_pct'),
    getSetting(tenantId, 'ads_anomaly_frequency_max'),
  ]);
  return {
    cpaMultiplier: parseFloat(cpaT) || DEFAULT_CPA_MULTIPLIER,
    roasDropPct:   parseFloat(roasT) || DEFAULT_ROAS_DROP_PCT,
    frequencyMax:  parseFloat(freqT) || DEFAULT_FREQUENCY_MAX,
  };
}

function metric(insights, key) {
  if (!insights) return 0;
  const v = insights[key];
  if (typeof v === 'string') return parseFloat(v) || 0;
  if (typeof v === 'number') return v;
  return 0;
}

/**
 * Detecta anomalias para um cliente. Retorna a lista criada.
 */
async function detectForClient(tenantId, clientId) {
  const created = [];

  let recent7, recent30;
  try {
    recent7 = await adsService.fetchCampaignsHierarchy(tenantId, clientId, {
      datePreset: 'last_7d',
    });
    recent30 = await adsService.fetchCampaignsHierarchy(tenantId, clientId, {
      datePreset: 'last_30d',
    });
  } catch (e) {
    console.warn('[WARN][adsAnomalies] erro ao coletar dados', { clientId, error: e.message });
    return [];
  }

  const thresholds = await loadThresholds(tenantId);
  const baselineByCampaign = new Map(
    recent30.campaigns.map((c) => [c.id, c.insights])
  );

  for (const campaign of recent7.campaigns) {
    if (campaign.effective_status !== 'ACTIVE') continue;
    const ins = campaign.insights;
    if (!ins) continue;
    const baseline = baselineByCampaign.get(campaign.id);

    // CPA
    const conversions7 = adsService.sumActions(ins.actions, ['offsite_conversion', 'lead', 'purchase', 'complete_registration']);
    const spend7 = metric(ins, 'spend');
    const cpa7 = conversions7 > 0 ? spend7 / conversions7 : null;

    if (baseline) {
      const baseConversions = adsService.sumActions(baseline.actions, ['offsite_conversion', 'lead', 'purchase', 'complete_registration']);
      const baseSpend = metric(baseline, 'spend');
      const baseCpa = baseConversions > 0 ? baseSpend / baseConversions : null;

      if (cpa7 != null && baseCpa != null && baseCpa > 0 && cpa7 > thresholds.cpaMultiplier * baseCpa) {
        const a = await createAnomaly(tenantId, clientId, {
          scope: 'campaign',
          targetId: campaign.id,
          targetName: campaign.name,
          anomalyType: 'cpa_spike',
          severity: cpa7 > 5 * baseCpa ? 'high' : 'medium',
          metricName: 'cpa',
          metricValue: cpa7,
          baselineValue: baseCpa,
          deltaPct: ((cpa7 - baseCpa) / baseCpa) * 100,
          description: `CPA dos últimos 7d (${cpa7.toFixed(2)}) está ${(cpa7 / baseCpa).toFixed(1)}x maior que a média histórica (${baseCpa.toFixed(2)}).`,
        });
        if (a) created.push(a);
      }

      // ROAS drop
      const roas7 = parseFloat(ins.purchase_roas?.[0]?.value || 0);
      const baseRoas = parseFloat(baseline.purchase_roas?.[0]?.value || 0);
      if (baseRoas > 0 && roas7 < baseRoas * (1 - thresholds.roasDropPct / 100)) {
        const a = await createAnomaly(tenantId, clientId, {
          scope: 'campaign',
          targetId: campaign.id,
          targetName: campaign.name,
          anomalyType: 'roas_drop',
          severity: 'high',
          metricName: 'roas',
          metricValue: roas7,
          baselineValue: baseRoas,
          deltaPct: ((roas7 - baseRoas) / baseRoas) * 100,
          description: `ROAS caiu ${(((baseRoas - roas7) / baseRoas) * 100).toFixed(1)}% (de ${baseRoas.toFixed(2)} para ${roas7.toFixed(2)}).`,
        });
        if (a) created.push(a);
      }
    }

    // Frequência alta
    const freq7 = metric(ins, 'frequency');
    if (freq7 > thresholds.frequencyMax) {
      const a = await createAnomaly(tenantId, clientId, {
        scope: 'campaign',
        targetId: campaign.id,
        targetName: campaign.name,
        anomalyType: 'frequency_high',
        severity: freq7 > thresholds.frequencyMax * 1.5 ? 'high' : 'medium',
        metricName: 'frequency',
        metricValue: freq7,
        baselineValue: thresholds.frequencyMax,
        deltaPct: ((freq7 - thresholds.frequencyMax) / thresholds.frequencyMax) * 100,
        description: `Frequência ${freq7.toFixed(2)} acima do limite (${thresholds.frequencyMax}).`,
      });
      if (a) created.push(a);
    }

    // Sem vendas 3d (proxy: 7d sem conversões mas spend > 0)
    if (conversions7 === 0 && spend7 > 0) {
      const a = await createAnomaly(tenantId, clientId, {
        scope: 'campaign',
        targetId: campaign.id,
        targetName: campaign.name,
        anomalyType: 'no_sales_3d',
        severity: 'medium',
        metricName: 'conversions',
        metricValue: 0,
        baselineValue: null,
        deltaPct: -100,
        description: `Campanha gastou ${spend7.toFixed(2)} nos últimos 7d sem nenhuma conversão registrada.`,
      });
      if (a) created.push(a);
    }
  }

  return created;
}

/**
 * Detecta anomalias para todos os clientes com conta ativa.
 * SEM filtro de tenant — uso de cron.
 */
async function detectForAllClients() {
  const accounts = await query(
    `SELECT tenant_id, client_id FROM client_ads_accounts
      WHERE health_status IN ('healthy', 'expiring_soon')`
  );
  const summary = { totalClients: accounts.length, anomaliesCreated: 0, errors: 0 };
  for (const a of accounts) {
    try {
      const created = await detectForClient(a.tenant_id, a.client_id);
      summary.anomaliesCreated += created.length;
    } catch (e) {
      summary.errors++;
      console.error('[ERRO][adsAnomalies:detectForAllClients]', {
        clientId: a.client_id,
        error: e.message,
      });
    }
  }
  return summary;
}

module.exports = {
  // Detector
  detectForClient,
  detectForAllClients,
  // CRUD
  createAnomaly,
  getOpenAnomalies,
  getAllForTenant,
  acknowledge,
  resolve,
  createNotificationFor,
};
