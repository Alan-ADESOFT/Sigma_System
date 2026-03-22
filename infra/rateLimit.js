/**
 * @fileoverview Rate limiter baseado em banco de dados
 * @description Controla limites de requisicoes por tenant usando a tabela
 * rate_limit_log. Cada chamada registra um evento e verifica se o limite
 * foi atingido na janela de tempo configurada.
 *
 * Uso:
 *   const { ok, remaining, resetIn } = await checkRateLimit(tenantId, 'pipeline', 5, 30);
 *   if (!ok) return res.status(429).json({ error: '...' });
 */

const { query, queryOne } = require('./db');

/**
 * Verifica se o tenant pode executar a acao dentro do limite
 * @param {string} tenantId - ID do tenant
 * @param {string} action - Nome da acao (ex: 'pipeline', 'modification')
 * @param {number} maxRequests - Maximo de requisicoes permitidas na janela
 * @param {number} windowMinutes - Janela de tempo em minutos
 * @returns {Promise<{ ok: boolean, count: number, remaining: number, resetIn: number }>}
 *   ok: true se pode prosseguir
 *   count: quantas requisicoes ja foram feitas na janela
 *   remaining: quantas ainda restam
 *   resetIn: segundos ate a janela mais antiga expirar
 */
async function checkRateLimit(tenantId, action, maxRequests, windowMinutes) {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  // Conta requisicoes na janela
  const result = await queryOne(
    `SELECT COUNT(*)::int AS count, MIN(created_at) AS oldest
     FROM rate_limit_log
     WHERE tenant_id = $1 AND action = $2 AND created_at > $3`,
    [tenantId, action, windowStart.toISOString()]
  );

  const count = result?.count || 0;
  const remaining = Math.max(0, maxRequests - count);

  // Calcula segundos ate a entrada mais antiga expirar
  let resetIn = 0;
  if (count >= maxRequests && result?.oldest) {
    const oldestTime = new Date(result.oldest).getTime();
    const expiresAt = oldestTime + windowMinutes * 60 * 1000;
    resetIn = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  }

  return {
    ok: count < maxRequests,
    count,
    remaining,
    resetIn,
  };
}

/**
 * Registra uma requisicao no log de rate limit
 * @param {string} tenantId - ID do tenant
 * @param {string} action - Nome da acao
 * @param {object} [metadata={}] - Dados extras (ex: clientId)
 */
async function logRateLimitEvent(tenantId, action, metadata = {}) {
  await query(
    `INSERT INTO rate_limit_log (tenant_id, action, metadata) VALUES ($1, $2, $3)`,
    [tenantId, action, JSON.stringify(metadata)]
  );
}

/**
 * Limpa entradas antigas do log (manter tabela leve)
 * Chamar periodicamente ou em cron
 * @param {number} [daysToKeep=7] - Manter entradas dos ultimos N dias
 */
async function cleanupRateLimitLog(daysToKeep = 7) {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  await query(
    `DELETE FROM rate_limit_log WHERE created_at < $1`,
    [cutoff.toISOString()]
  );
}

module.exports = { checkRateLimit, logRateLimitEvent, cleanupRateLimitLog };
