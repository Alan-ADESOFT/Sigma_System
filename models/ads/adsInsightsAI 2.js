/**
 * models/ads/adsInsightsAI.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Núcleo de IA do módulo Ads.
 *
 * Tracking obrigatório: TODA chamada a runCompletion passa
 * { tenantId, operationType, clientId } pra log em ai_token_usage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { runCompletion, runCompletionWithModel } = require('../ia/completion');
const { getSetting } = require('../settings.model');
const { query, queryOne } = require('../../infra/db');
const adsService = require('./adsService');
const adsPrompts = require('./adsPrompts');

/* ─── Resolução de modelo + prompt ──────────────────────────────────────── */

/**
 * Default do modelo do relatório semanal.
 * Sonnet 4 (mais barato que Opus, suficiente pra relatórios executivos).
 */
const DEFAULT_WEEKLY_MODEL = 'claude-sonnet-4-5';

/**
 * Resolve qual modelo usar para uma operação de Ads.
 *
 * level:
 *   · 'strong' → diagnóstico on-demand (usa ads_model_strong, fallback AI_MODEL_STRONG)
 *   · 'medium' → explicações curtas (usa ads_model_medium, fallback AI_MODEL_MEDIUM)
 *   · 'weekly' → relatório semanal (usa ads_model_weekly, fallback DEFAULT_WEEKLY_MODEL)
 *
 * Retorna o model ID direto OU null pra cair no resolver por nível do completion.
 */
async function resolveAdsModel(tenantId, level = 'strong') {
  if (level === 'weekly') {
    const override = await getSetting(tenantId, 'ads_model_weekly');
    return override || DEFAULT_WEEKLY_MODEL;
  }
  const settingKey = level === 'medium' ? 'ads_model_medium' : 'ads_model_strong';
  const override = await getSetting(tenantId, settingKey);
  if (override) return override;
  return null; // null = usa runCompletion(level) que resolve via env
}

async function getDiagnosisPrompt(tenantId) {
  const override = await getSetting(tenantId, 'prompt_library_ads_insights_diagnosis');
  return override || adsPrompts.DEFAULT_DIAGNOSIS_PROMPT;
}
async function getWeeklyReportPrompt(tenantId) {
  const override = await getSetting(tenantId, 'prompt_library_ads_weekly_report');
  return override || adsPrompts.DEFAULT_WEEKLY_REPORT_PROMPT;
}
async function getAnomalyExplanationPrompt(tenantId) {
  const override = await getSetting(tenantId, 'prompt_library_ads_anomaly_explanation');
  return override || adsPrompts.DEFAULT_ANOMALY_EXPLANATION_PROMPT;
}

/* ─── Helper para chamar IA respeitando override de modelo ──────────────── */

async function callAI(tenantId, level, system, user, maxTokens, opts) {
  const overrideModel = await resolveAdsModel(tenantId, level);
  if (overrideModel) {
    return runCompletionWithModel(overrideModel, system, user, maxTokens, opts);
  }
  // 'weekly' sempre tem default — nunca chega aqui. Para 'strong'/'medium',
  // null = usa o resolver de níveis do completion (AI_MODEL_STRONG/MEDIUM do .env).
  const completionLevel = level === 'weekly' ? 'strong' : level;
  return runCompletion(completionLevel, system, user, maxTokens, opts);
}

/* ─── Helper de extração de JSON do output ──────────────────────────────── */

function extractJsonBlock(text) {
  if (!text) return { recommendations: null, flowchart_path: null };
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return { recommendations: null, flowchart_path: null };
  try {
    const parsed = JSON.parse(match[1].trim());
    return {
      recommendations: parsed.recommendations || null,
      flowchart_path: parsed.flowchart_path || null,
    };
  } catch {
    return { recommendations: null, flowchart_path: null };
  }
}

/* ─── Persistência ──────────────────────────────────────────────────────── */

async function saveReport({
  tenantId, clientId, scope, targetId, targetName,
  dateRange, triggerType, inputSnapshot, diagnosis,
  recommendations, flowchartPath,
  modelUsed, tokensUsed, costUsd,
}) {
  const row = await queryOne(
    `INSERT INTO ads_ai_reports (
       tenant_id, client_id, scope, target_id, target_name,
       date_start, date_end, trigger_type,
       input_snapshot, diagnosis, recommendations, flowchart_path,
       model_used, tokens_used, cost_usd
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8,
       $9, $10, $11, $12,
       $13, $14, $15
     )
     RETURNING *`,
    [
      tenantId, clientId, scope, targetId || null, targetName || null,
      dateRange.since, dateRange.until, triggerType || 'on_demand',
      JSON.stringify(inputSnapshot),
      diagnosis,
      recommendations ? JSON.stringify(recommendations) : null,
      flowchartPath ? JSON.stringify(flowchartPath) : null,
      modelUsed || null, tokensUsed || null, costUsd || null,
    ]
  );
  return row;
}

async function getReportById(tenantId, id) {
  return queryOne(
    `SELECT * FROM ads_ai_reports WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
}

async function listReports(tenantId, clientId, opts = {}) {
  const limit = Math.min(opts.limit || 20, 100);
  const rows = await query(
    `SELECT id, scope, target_id, target_name, date_start, date_end,
            trigger_type, model_used, tokens_used, created_at
       FROM ads_ai_reports
      WHERE tenant_id = $1 AND client_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [tenantId, clientId, limit]
  );
  return rows;
}

/* ─── Diagnóstico on demand ─────────────────────────────────────────────── */

/**
 * @param {string} tenantId
 * @param {string} clientId
 * @param {Object} params
 * @param {'account'|'campaign'|'adset'|'ad'} params.scope
 * @param {string} [params.targetId]
 * @param {string} [params.targetName]
 * @param {Object} params.dateRange - { datePreset } | { timeRange }
 */
async function generateDiagnosis(tenantId, clientId, params) {
  const { scope, targetId, targetName, dateRange } = params;

  const client = await queryOne(
    `SELECT id, company_name, niche, main_product
       FROM marketing_clients
      WHERE id = $1 AND tenant_id = $2`,
    [clientId, tenantId]
  );
  if (!client) throw new Error('Cliente não encontrado');

  // Coleta dados reais (KPIs + comparação + diário recente)
  const range = adsService.resolveRange(dateRange);
  const previous = adsService.previousRange(range);

  const [currentKpi, prevKpi, timeline] = await Promise.all([
    adsService.fetchAccountKPIs(tenantId, clientId, { timeRange: range.timeRange }),
    adsService.fetchAccountKPIs(tenantId, clientId, { timeRange: previous }),
    adsService.fetchTimeline(tenantId, clientId, { timeRange: range.timeRange }),
  ]);

  const comparison = adsService.computeComparison(currentKpi.summary, prevKpi.summary);

  const inputSnapshot = {
    scope,
    targetId,
    targetName,
    range,
    kpis: currentKpi.summary,
    comparison,
    timeline: timeline.timeline.slice(-14), // últimos 14 dias é o suficiente
  };

  const systemPrompt = await getDiagnosisPrompt(tenantId);
  const userMessage = buildDiagnosisUserMessage({
    client, scope, targetId, targetName, range, snapshot: inputSnapshot,
  });

  const result = await callAI(tenantId, 'strong', systemPrompt, userMessage, 4000, {
    tenantId, clientId, operationType: 'ads_insights',
  });

  const { recommendations, flowchart_path } = extractJsonBlock(result.text);

  const saved = await saveReport({
    tenantId, clientId, scope, targetId, targetName,
    dateRange: range, triggerType: 'on_demand',
    inputSnapshot,
    diagnosis: result.text,
    recommendations,
    flowchartPath: flowchart_path,
    modelUsed: result.modelUsed,
    tokensUsed: result.usage?.total || 0,
  });

  return {
    id: saved.id,
    scope,
    targetId,
    targetName,
    dateRange: range,
    diagnosis: saved.diagnosis,
    recommendations: saved.recommendations,
    flowchartPath: saved.flowchart_path,
    modelUsed: saved.model_used,
    tokensUsed: saved.tokens_used,
    createdAt: saved.created_at,
  };
}

function buildDiagnosisUserMessage({ client, scope, targetId, targetName, range, snapshot }) {
  const kpiList = Object.entries(snapshot.kpis)
    .map(([k, v]) => `- ${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
    .join('\n');

  const comparisonList = snapshot.comparison
    .map((c) => `- ${c.metric}: ${c.current.toFixed(2)} (anterior ${c.previous.toFixed(2)}, Δ ${c.deltaPct?.toFixed(1)}%)`)
    .join('\n');

  const timelineList = snapshot.timeline
    .map((d) => `${d.date}: spend=${d.spend.toFixed(2)} clicks=${d.clicks} ctr=${d.ctr.toFixed(2)} conv=${d.conversions} roas=${d.roas.toFixed(2)}`)
    .join('\n');

  return `CLIENTE: ${client.company_name}
NICHO: ${client.niche || 'não informado'}
PRODUTO: ${client.main_product || 'não informado'}

ESCOPO: ${scope}${targetId ? ` (id=${targetId}, nome="${targetName || ''}")` : ''}
PERÍODO: ${range.since} até ${range.until}

KPIs DO PERÍODO:
${kpiList}

COMPARAÇÃO COM PERÍODO ANTERIOR:
${comparisonList}

ÚLTIMOS DIAS:
${timelineList}

Aplique o framework e responda no formato exigido (Markdown + JSON).`;
}

/* ─── Relatório semanal automático ──────────────────────────────────────── */

async function generateWeeklyReport(tenantId, clientId) {
  const client = await queryOne(
    `SELECT id, company_name, niche, main_product
       FROM marketing_clients
      WHERE id = $1 AND tenant_id = $2`,
    [clientId, tenantId]
  );
  if (!client) throw new Error('Cliente não encontrado');

  const range = adsService.resolveRange({ datePreset: 'last_7d' });
  const previous = adsService.previousRange(range);

  const [currentKpi, prevKpi, hierarchy, anomalies] = await Promise.all([
    adsService.fetchAccountKPIs(tenantId, clientId, { timeRange: range.timeRange }),
    adsService.fetchAccountKPIs(tenantId, clientId, { timeRange: previous }),
    adsService.fetchCampaignsHierarchy(tenantId, clientId, { timeRange: range.timeRange }),
    query(
      `SELECT * FROM ads_anomalies
        WHERE tenant_id = $1 AND client_id = $2 AND status = 'open'
        ORDER BY detected_at DESC LIMIT 10`,
      [tenantId, clientId]
    ),
  ]);

  const comparison = adsService.computeComparison(currentKpi.summary, prevKpi.summary);
  const sortedByRoas = [...hierarchy.campaigns]
    .filter((c) => c.insights)
    .sort((a, b) => parseFloat(b.insights?.purchase_roas?.[0]?.value || 0) - parseFloat(a.insights?.purchase_roas?.[0]?.value || 0));
  const top3 = sortedByRoas.slice(0, 3);
  const bottom3 = sortedByRoas.slice(-3).reverse();

  const inputSnapshot = {
    range,
    kpis: currentKpi.summary,
    comparison,
    top3: top3.map((c) => ({ id: c.id, name: c.name, insights: c.insights })),
    bottom3: bottom3.map((c) => ({ id: c.id, name: c.name, insights: c.insights })),
    anomalies: anomalies.map((a) => ({
      type: a.anomaly_type,
      severity: a.severity,
      target: a.target_name,
      description: a.description,
    })),
  };

  const systemPrompt = await getWeeklyReportPrompt(tenantId);
  const userMessage = `CLIENTE: ${client.company_name}
NICHO: ${client.niche || 'não informado'}
PRODUTO: ${client.main_product || 'não informado'}

PERÍODO: ${range.since} a ${range.until}

KPIs DA SEMANA:
${Object.entries(currentKpi.summary).map(([k, v]) => `- ${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`).join('\n')}

COMPARAÇÃO vs SEMANA ANTERIOR:
${comparison.map((c) => `- ${c.metric}: ${c.current.toFixed(2)} (Δ ${c.deltaPct?.toFixed(1)}%)`).join('\n')}

TOP 3 CAMPANHAS POR ROAS:
${top3.map((c) => `- ${c.name}: ROAS=${c.insights?.purchase_roas?.[0]?.value || 0}, spend=${c.insights?.spend || 0}`).join('\n')}

BOTTOM 3 CAMPANHAS POR ROAS:
${bottom3.map((c) => `- ${c.name}: ROAS=${c.insights?.purchase_roas?.[0]?.value || 0}, spend=${c.insights?.spend || 0}`).join('\n')}

ANOMALIAS ABERTAS (${anomalies.length}):
${anomalies.length > 0 ? anomalies.map((a) => `- [${a.severity}] ${a.anomaly_type} em ${a.target_name}: ${a.description}`).join('\n') : '(nenhuma)'}

Gere o relatório executivo no formato exigido.`;

  const result = await callAI(tenantId, 'weekly', systemPrompt, userMessage, 3000, {
    tenantId, clientId, operationType: 'ads_weekly_report',
  });

  const saved = await saveReport({
    tenantId, clientId,
    scope: 'account',
    targetId: null,
    targetName: client.company_name,
    dateRange: range,
    triggerType: 'weekly_cron',
    inputSnapshot,
    diagnosis: result.text,
    recommendations: null,
    flowchartPath: null,
    modelUsed: result.modelUsed,
    tokensUsed: result.usage?.total || 0,
  });

  return saved;
}

/* ─── Explicação curta de anomalia ──────────────────────────────────────── */

async function explainAnomaly(tenantId, clientId, anomaly) {
  const systemPrompt = await getAnomalyExplanationPrompt(tenantId);

  const userMessage = `Anomalia detectada:
- Tipo: ${anomaly.anomaly_type}
- Escopo: ${anomaly.scope}
- Alvo: ${anomaly.target_name || anomaly.target_id}
- Severidade: ${anomaly.severity}
- Métrica: ${anomaly.metric_name} = ${anomaly.metric_value}
- Baseline: ${anomaly.baseline_value}
- Variação: ${anomaly.delta_pct}%
- Descrição automática: ${anomaly.description}`;

  const result = await callAI(tenantId, 'medium', systemPrompt, userMessage, 400, {
    tenantId, clientId, operationType: 'ads_anomaly',
  });
  return result.text;
}

module.exports = {
  // Prompt loaders
  getDiagnosisPrompt,
  getWeeklyReportPrompt,
  getAnomalyExplanationPrompt,
  // Model
  resolveAdsModel,
  // Generators
  generateDiagnosis,
  generateWeeklyReport,
  explainAnomaly,
  // Reports
  saveReport,
  getReportById,
  listReports,
};
