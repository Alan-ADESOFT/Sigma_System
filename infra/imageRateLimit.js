/**
 * @fileoverview Rate limit do Gerador de Imagem (3 camadas)
 * @description Diferente do rateLimit.js padrão (que usa rate_limit_log),
 * este reusa a própria image_jobs como fonte da verdade — assim o contador
 * é sempre fiel ao que realmente foi gerado.
 *
 * Camadas (avaliadas em ordem):
 *   1. Concurrent: queued + running por tenant (image_settings.concurrent_limit_per_tenant)
 *   2. Hourly:     últimos 60 min do user (hourly_limit_admin/user)
 *   3. Daily:      últimas 24h do user (daily_limit_admin/user)
 *
 * Em qualquer falha: registra em audit log com action='rate_limit_hit'.
 */

const { countActiveJobs, countJobsByUserInWindow } = require('../models/imageJob.model');
const { getOrCreate: getSettings } = require('../models/imageSettings.model');
const { logAudit } = require('../models/imageAudit.model');

/**
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.userId
 * @param {boolean} params.isAdmin
 * @param {object} [params.settings] - opcional, evita um SELECT extra
 * @param {object} [params.req]
 * @returns {Promise<{
 *   allowed: boolean,
 *   reason?: string,
 *   retryAfter?: number,
 *   remaining: { hourly: number, daily: number },
 *   used: { hourly: number, daily: number, concurrent: number },
 *   limits: { hourly: number, daily: number, concurrent: number }
 * }>}
 */
async function checkImageRateLimit(params) {
  const { tenantId, userId, isAdmin, req } = params;
  if (!tenantId || !userId) {
    throw new Error('checkImageRateLimit: tenantId e userId obrigatórios');
  }

  const settings = params.settings || await getSettings(tenantId);

  const hourlyLimit = isAdmin ? settings.hourly_limit_admin : settings.hourly_limit_user;
  const dailyLimit  = isAdmin ? settings.daily_limit_admin  : settings.daily_limit_user;
  const concurrentLimit = settings.concurrent_limit_per_tenant;

  // Camada 1 — concurrent (por tenant)
  const concurrent = await countActiveJobs(tenantId);
  if (concurrent >= concurrentLimit) {
    await logAudit({
      tenantId, userId, req,
      action: 'rate_limit_hit',
      details: { layer: 'concurrent', used: concurrent, limit: concurrentLimit },
    });
    return {
      allowed: false,
      reason: `Limite de gerações simultâneas atingido (${concurrent}/${concurrentLimit}). Aguarde uma terminar.`,
      retryAfter: 30,
      remaining: { hourly: hourlyLimit, daily: dailyLimit },
      used:      { hourly: 0, daily: 0, concurrent },
      limits:    { hourly: hourlyLimit, daily: dailyLimit, concurrent: concurrentLimit },
    };
  }

  // Camada 2 — hourly (por user)
  const hourly = await countJobsByUserInWindow(userId, 1);
  if (hourly >= hourlyLimit) {
    await logAudit({
      tenantId, userId, req,
      action: 'rate_limit_hit',
      details: { layer: 'hourly', used: hourly, limit: hourlyLimit },
    });
    return {
      allowed: false,
      reason: `Limite por hora atingido (${hourly}/${hourlyLimit}). Tente em ~1 hora.`,
      retryAfter: 3600,
      remaining: { hourly: 0, daily: Math.max(0, dailyLimit - hourly) },
      used:      { hourly, daily: hourly, concurrent },
      limits:    { hourly: hourlyLimit, daily: dailyLimit, concurrent: concurrentLimit },
    };
  }

  // Camada 3 — daily (por user)
  const daily = await countJobsByUserInWindow(userId, 24);
  if (daily >= dailyLimit) {
    await logAudit({
      tenantId, userId, req,
      action: 'rate_limit_hit',
      details: { layer: 'daily', used: daily, limit: dailyLimit },
    });
    return {
      allowed: false,
      reason: `Limite diário atingido (${daily}/${dailyLimit}). Tente novamente amanhã.`,
      retryAfter: 24 * 3600,
      remaining: { hourly: Math.max(0, hourlyLimit - hourly), daily: 0 },
      used:      { hourly, daily, concurrent },
      limits:    { hourly: hourlyLimit, daily: dailyLimit, concurrent: concurrentLimit },
    };
  }

  return {
    allowed: true,
    remaining: {
      hourly: Math.max(0, hourlyLimit - hourly),
      daily:  Math.max(0, dailyLimit - daily),
    },
    used:   { hourly, daily, concurrent },
    limits: { hourly: hourlyLimit, daily: dailyLimit, concurrent: concurrentLimit },
  };
}

/**
 * Variante "consulta-only" — retorna o estado atual SEM registrar audit.
 * Usado pelo endpoint /api/image/rate-limit/check.
 */
async function getRateLimitStatus({ tenantId, userId, isAdmin }) {
  const settings = await getSettings(tenantId);
  const hourlyLimit = isAdmin ? settings.hourly_limit_admin : settings.hourly_limit_user;
  const dailyLimit  = isAdmin ? settings.daily_limit_admin  : settings.daily_limit_user;
  const concurrentLimit = settings.concurrent_limit_per_tenant;

  const concurrent = await countActiveJobs(tenantId);
  const hourly     = await countJobsByUserInWindow(userId, 1);
  const daily      = await countJobsByUserInWindow(userId, 24);

  return {
    remaining: {
      hourly: Math.max(0, hourlyLimit - hourly),
      daily:  Math.max(0, dailyLimit - daily),
    },
    limits:     { hourly: hourlyLimit, daily: dailyLimit },
    concurrent: { current: concurrent, max: concurrentLimit },
    isAdmin:    !!isAdmin,
  };
}

module.exports = { checkImageRateLimit, getRateLimitStatus };
