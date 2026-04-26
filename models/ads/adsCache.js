/**
 * models/ads/adsCache.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cache via tabela ads_insights_cache.
 *
 * TTL é gerenciado em código (não no banco):
 *   · Se o range inclui hoje → ads_cache_ttl_today_minutes  (default 60min)
 *   · Senão                  → ads_cache_ttl_history_hours  (default 24h)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const { query, queryOne } = require('../../infra/db');
const { getSetting } = require('../settings.model');

const DEFAULT_TTL_TODAY_MIN = 60;
const DEFAULT_TTL_HISTORY_H = 24;

function buildCacheKey({ level, targetId, dateStart, dateEnd, breakdowns }) {
  const raw = JSON.stringify({
    level: level || 'account',
    targetId: targetId || '',
    dateStart: dateStart || '',
    dateEnd: dateEnd || '',
    breakdowns: breakdowns || '',
  });
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function rangeIncludesToday(dateEnd) {
  if (!dateEnd) return true;
  const end = new Date(dateEnd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end >= today;
}

async function resolveTtlMs(tenantId, dateEnd) {
  if (rangeIncludesToday(dateEnd)) {
    const minutes = parseInt(await getSetting(tenantId, 'ads_cache_ttl_today_minutes'), 10)
      || DEFAULT_TTL_TODAY_MIN;
    return minutes * 60 * 1000;
  }
  const hours = parseInt(await getSetting(tenantId, 'ads_cache_ttl_history_hours'), 10)
    || DEFAULT_TTL_HISTORY_H;
  return hours * 3600 * 1000;
}

/**
 * Busca cache por (client_id, cache_key). Retorna data ou null.
 * Verifica expires_at.
 */
async function getCached(tenantId, clientId, cacheKey) {
  const row = await queryOne(
    `SELECT * FROM ads_insights_cache
      WHERE tenant_id = $1
        AND client_id = $2
        AND cache_key = $3
        AND expires_at > now()`,
    [tenantId, clientId, cacheKey]
  );
  return row ? row.data : null;
}

/**
 * Salva no cache com TTL automático.
 * @param {Object} params - { level, targetId, dateStart, dateEnd, breakdowns, cacheKey? }
 */
async function setCached(tenantId, clientId, params, data) {
  const cacheKey = params.cacheKey || buildCacheKey(params);
  const ttlMs = await resolveTtlMs(tenantId, params.dateEnd);
  const expiresAt = new Date(Date.now() + ttlMs);

  await query(
    `INSERT INTO ads_insights_cache (
       tenant_id, client_id, cache_key, level, target_id,
       date_start, date_end, breakdowns, data, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (client_id, cache_key) DO UPDATE SET
       data       = EXCLUDED.data,
       fetched_at = now(),
       expires_at = EXCLUDED.expires_at`,
    [
      tenantId, clientId, cacheKey,
      params.level || 'account',
      params.targetId || '',
      params.dateStart || null,
      params.dateEnd || null,
      params.breakdowns || null,
      JSON.stringify(data),
      expiresAt,
    ]
  );
  return cacheKey;
}

/**
 * Remove caches expirados — chamado por cron.
 */
async function deleteExpired() {
  const rows = await query(
    `DELETE FROM ads_insights_cache WHERE expires_at < now() RETURNING id`
  );
  return rows.length;
}

/**
 * Invalida todo o cache de um cliente — chamado após pause/resume/update.
 */
async function invalidateClient(tenantId, clientId) {
  const rows = await query(
    `DELETE FROM ads_insights_cache
      WHERE tenant_id = $1 AND client_id = $2
      RETURNING id`,
    [tenantId, clientId]
  );
  return rows.length;
}

module.exports = {
  buildCacheKey,
  getCached,
  setCached,
  deleteExpired,
  invalidateClient,
};
