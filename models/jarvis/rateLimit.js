/**
 * @fileoverview models/jarvis/rateLimit.js
 * Quota diária por usuário (admin=40, user=10 — configurável) e log de uso.
 * Backed by a tabela `jarvis_usage_log`.
 */

const { query } = require('../../infra/db');
const { getDailyLimit, getTodayUsage } = require('./config');

/**
 * Verifica se o usuário ainda tem quota disponível hoje.
 * Limites são lidos das settings do tenant, fallback por role.
 */
async function checkJarvisQuota(tenantId, userId, userRole) {
  const limit = await getDailyLimit(tenantId, userRole);
  const used  = await getTodayUsage(tenantId, userId);
  const remaining = Math.max(0, limit - used);

  console.log('[INFO][Jarvis:RateLimit] checkJarvisQuota', { tenantId, userId, userRole, used, limit, remaining });

  return {
    allowed: used < limit,
    used,
    limit,
    remaining,
  };
}

/**
 * Insere um evento de uso no log do Jarvis.
 */
async function logJarvisUsage(tenantId, userId, command, inputText, response, durationMs, success, error) {
  try {
    await query(
      `INSERT INTO jarvis_usage_log
        (tenant_id, user_id, command, input_text, response, duration_ms, success, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        userId,
        command || 'unknown',
        inputText ? String(inputText).slice(0, 4000) : null,
        response  ? String(response).slice(0, 8000)  : null,
        Number.isFinite(durationMs) ? Math.round(durationMs) : null,
        success !== false,
        error ? String(error).slice(0, 1000) : null,
      ]
    );
  } catch (err) {
    // Nunca quebrar o fluxo principal por causa do log
    console.error('[ERRO][Jarvis:RateLimit] logJarvisUsage falhou', { error: err.message });
  }
}

/**
 * Lista as últimas N interações do usuário com o Jarvis.
 */
async function getRecentUsage(tenantId, userId, limit = 10) {
  const rows = await query(
    `SELECT id, command, input_text, response, duration_ms, success, error, created_at
     FROM jarvis_usage_log
     WHERE tenant_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [tenantId, userId, limit]
  );
  return rows;
}

/**
 * Estatísticas do dia para um usuário (uso por hora + comando mais usado +
 * tempo médio de resposta).
 */
async function getTodayStats(tenantId, userId) {
  const rows = await query(
    `SELECT
       command,
       COUNT(*)::int AS count,
       ROUND(AVG(duration_ms))::int AS avg_ms,
       EXTRACT(HOUR FROM created_at)::int AS hour
     FROM jarvis_usage_log
     WHERE tenant_id = $1 AND user_id = $2
       AND created_at >= date_trunc('day', now())
     GROUP BY command, EXTRACT(HOUR FROM created_at)`,
    [tenantId, userId]
  );

  const total = rows.reduce((s, r) => s + r.count, 0);
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const r of rows) byHour[r.hour] = (byHour[r.hour] || 0) + r.count;

  // Comando mais usado
  const cmdCounts = {};
  let avgMsTotal = 0, avgWeight = 0;
  for (const r of rows) {
    cmdCounts[r.command] = (cmdCounts[r.command] || 0) + r.count;
    if (Number.isFinite(r.avg_ms)) {
      avgMsTotal += r.avg_ms * r.count;
      avgWeight  += r.count;
    }
  }
  let topCommand = null;
  let topCount   = 0;
  for (const c of Object.keys(cmdCounts)) {
    if (cmdCounts[c] > topCount) { topCount = cmdCounts[c]; topCommand = c; }
  }

  return {
    total,
    byHour,
    topCommand,
    topCount,
    avgMs: avgWeight > 0 ? Math.round(avgMsTotal / avgWeight) : 0,
  };
}

module.exports = {
  checkJarvisQuota,
  logJarvisUsage,
  getRecentUsage,
  getTodayStats,
};
