/**
 * @fileoverview Model de uso de tokens de IA
 * @description Log centralizado de consumo de tokens por tenant.
 * Alimentado por TODA chamada de IA do sistema (pipeline, copy, modificacoes).
 * Calcula custo estimado em USD com base na tabela de precos.
 *
 * Tabela: ai_token_usage
 */

const { query, queryOne } = require('../../infra/db');

// ── Tabela de precos por modelo (USD por token) ─────────────

/** @type {Record<string, { input: number, output: number }>} */
const PRICES = {
  'gpt-4o':                     { input: 0.000005,   output: 0.000015   },
  'gpt-4o-mini':                { input: 0.00000015, output: 0.0000006  },
  'claude-opus-4-20250514':     { input: 0.000015,   output: 0.000075   },
  'claude-sonnet-4-6-20250514': { input: 0.000003,   output: 0.000015   },
  'sonar-pro':                  { input: 0.000003,   output: 0.000015   },
  'sonar':                      { input: 0.000001,   output: 0.000001   },
};

/**
 * Calcula custo estimado em USD
 * @param {string} model - Model ID
 * @param {number} tokensInput - Tokens de entrada
 * @param {number} tokensOutput - Tokens de saida
 * @returns {number|null} Custo em USD ou null se modelo desconhecido
 */
function estimateCost(model, tokensInput, tokensOutput) {
  // Tenta match exato primeiro, depois parcial
  let price = PRICES[model];
  if (!price) {
    const key = Object.keys(PRICES).find(k => model.includes(k) || k.includes(model));
    price = key ? PRICES[key] : null;
  }
  if (!price) return null;
  return (tokensInput * price.input) + (tokensOutput * price.output);
}

// ── Registro de uso ──────────────────────────────────────────

/**
 * Registra uso de tokens no log centralizado.
 * NUNCA lanca erro — falha silenciosamente para nao bloquear o fluxo principal.
 *
 * @param {object} params
 * @param {string} params.tenantId - ID do tenant
 * @param {string} params.modelUsed - Model ID usado
 * @param {string} params.provider - 'openai' | 'anthropic' | 'perplexity'
 * @param {string} params.operationType - 'pipeline' | 'copy_generate' | 'apply_modification' | etc.
 * @param {string} [params.clientId] - ID do cliente associado
 * @param {string} [params.sessionId] - ID da sessao (job, copy session, etc.)
 * @param {number} params.tokensInput - Tokens de entrada
 * @param {number} params.tokensOutput - Tokens de saida
 * @param {object} [params.metadata] - Dados extras
 */
async function logUsage(params) {
  try {
    const {
      tenantId, modelUsed, provider, operationType,
      clientId, sessionId,
      tokensInput = 0, tokensOutput = 0,
      metadata = {},
    } = params;

    if (!tenantId || !modelUsed || !operationType) return;

    const tokensTotal = tokensInput + tokensOutput;
    const cost = estimateCost(modelUsed, tokensInput, tokensOutput);

    await queryOne(
      `INSERT INTO ai_token_usage
       (tenant_id, model_used, provider, operation_type, client_id, session_id,
        tokens_input, tokens_output, tokens_total, estimated_cost_usd, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        tenantId, modelUsed, provider || 'openai', operationType,
        clientId || null, sessionId || null,
        tokensInput, tokensOutput, tokensTotal,
        cost, JSON.stringify(metadata),
      ]
    );

    console.log('[INFO][TokenUsage] Uso registrado', {
      model: modelUsed, provider, operation: operationType,
      tokens: tokensTotal, cost: cost ? `$${cost.toFixed(6)}` : 'n/a',
    });
  } catch (err) {
    // Falha silenciosa — nunca bloquear o fluxo principal
    console.error('[ERRO][TokenUsage] Falha ao registrar uso (silenciado)', { error: err.message });
  }
}

// ── Consultas de uso ─────────────────────────────────────────

/**
 * Retorna resumo de uso de tokens para o dashboard
 * @param {string} tenantId - ID do tenant
 * @param {object} [filters]
 * @param {string} [filters.period] - 'month' | 'custom' | 'all'
 * @param {string} [filters.startDate] - Data inicio (ISO)
 * @param {string} [filters.endDate] - Data fim (ISO)
 * @returns {Promise<object>} Resumo completo
 */
async function getUsageSummary(tenantId, filters = {}) {
  console.log('[INFO][TokenUsage] getUsageSummary', { tenantId, filters });

  const { period = 'month', startDate, endDate } = filters;

  // Monta filtro de data
  let dateFilter = '';
  const baseParams = [tenantId];
  let paramIdx = 2;

  if (period === 'month') {
    dateFilter = `AND created_at >= date_trunc('month', now())`;
  } else if (period === 'custom' && startDate && endDate) {
    dateFilter = `AND created_at >= $${paramIdx} AND created_at <= $${paramIdx + 1}`;
    baseParams.push(startDate, endDate);
    paramIdx += 2;
  }
  // 'all' = sem filtro de data

  // Total geral
  const totals = await queryOne(
    `SELECT COALESCE(SUM(tokens_total), 0)::int AS total_tokens,
            COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total_cost,
            COUNT(*)::int AS total_requests
     FROM ai_token_usage WHERE tenant_id = $1 ${dateFilter}`,
    baseParams
  );

  // Por modelo
  const byModel = await query(
    `SELECT model_used, provider,
            SUM(tokens_total)::int AS tokens,
            SUM(estimated_cost_usd)::numeric AS cost,
            COUNT(*)::int AS count
     FROM ai_token_usage WHERE tenant_id = $1 ${dateFilter}
     GROUP BY model_used, provider ORDER BY tokens DESC`,
    baseParams
  );

  // Por operacao
  const byOperation = await query(
    `SELECT operation_type,
            SUM(tokens_total)::int AS tokens,
            SUM(estimated_cost_usd)::numeric AS cost,
            COUNT(*)::int AS count
     FROM ai_token_usage WHERE tenant_id = $1 ${dateFilter}
     GROUP BY operation_type ORDER BY tokens DESC`,
    baseParams
  );

  // Por dia (ultimos 30 dias)
  const byDay = await query(
    `SELECT date_trunc('day', created_at)::date AS date,
            SUM(tokens_total)::int AS tokens,
            SUM(estimated_cost_usd)::numeric AS cost,
            COUNT(*)::int AS count
     FROM ai_token_usage WHERE tenant_id = $1
       AND created_at >= now() - interval '30 days'
     GROUP BY date ORDER BY date ASC`,
    [tenantId]
  );

  return {
    totalTokens: totals?.total_tokens || 0,
    totalCostUsd: parseFloat(totals?.total_cost || 0),
    totalRequests: totals?.total_requests || 0,
    byModel,
    byOperation,
    byDay,
  };
}

/**
 * Busca as ultimas requisicoes de IA do tenant
 * @param {string} tenantId - ID do tenant
 * @param {number} [limit=20] - Limite de registros
 * @returns {Promise<Array>} Lista de requisicoes formatadas
 */
async function getLastRequests(tenantId, limit = 20) {
  console.log('[INFO][TokenUsage] getLastRequests', { tenantId, limit });

  const rows = await query(
    `SELECT u.*, c.company_name
     FROM ai_token_usage u
     LEFT JOIN marketing_clients c ON c.id = u.client_id
     WHERE u.tenant_id = $1
     ORDER BY u.created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );

  return rows;
}

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  logUsage,
  estimateCost,
  getUsageSummary,
  getLastRequests,
  PRICES,
};
