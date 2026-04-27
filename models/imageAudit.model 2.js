/**
 * @fileoverview Model de auditoria do Gerador de Imagem
 * @description Registra ações sensíveis (troca de chave, hit de rate limit,
 * conteúdo bloqueado, prompt suspeito, etc) na tabela image_audit_log.
 *
 * Append-only: nunca atualiza ou deleta registros (cleanup é via cron 90d).
 */

const { query } = require('../infra/db');

/**
 * Extrai IP de um req do Next, lidando com proxies (x-forwarded-for).
 */
function extractIp(req) {
  if (!req) return null;
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || null;
}

/**
 * Registra uma entrada de auditoria.
 * NUNCA lança erro — falha silenciosamente (sempre registramos best-effort).
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} [params.userId]
 * @param {string} params.action - 'api_key_changed' | 'limit_changed' |
 *   'content_blocked' | 'rate_limit_hit' | 'suspicious_prompt' |
 *   'brandbook_deleted' | 'settings_changed' | etc.
 * @param {object} [params.details] - contexto não-sensível
 * @param {object} [params.req] - opcional, extrai IP e user-agent
 */
async function logAudit(params) {
  try {
    const { tenantId, userId, action, details = {}, req } = params || {};
    if (!tenantId || !action) return;

    const ip = req ? extractIp(req) : (params.ipAddress || null);
    const ua = req ? (req.headers?.['user-agent'] || null) : (params.userAgent || null);

    await query(
      `INSERT INTO image_audit_log
         (tenant_id, user_id, action, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, userId || null, action, JSON.stringify(details), ip, ua]
    );
    console.log('[INFO][ImageAudit] registrado', { tenantId, userId, action });
  } catch (err) {
    console.error('[ERRO][ImageAudit] falha (silenciada)', { error: err.message });
  }
}

/**
 * Lista as últimas entradas de auditoria de um tenant.
 * @param {string} tenantId
 * @param {object} [opts]
 * @param {number} [opts.limit=100]
 * @param {number} [opts.offset=0]
 * @param {string} [opts.action] - filtra por action específico
 */
async function listAudit(tenantId, opts = {}) {
  const { limit = 100, offset = 0, action } = opts;
  const params = [tenantId, limit, offset];
  let where = 'tenant_id = $1';
  if (action) {
    params.splice(1, 0, action);
    where = 'tenant_id = $1 AND action = $2';
    return query(
      `SELECT * FROM image_audit_log WHERE ${where}
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      params
    );
  }
  return query(
    `SELECT * FROM image_audit_log WHERE ${where}
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    params
  );
}

module.exports = { logAudit, listAudit };
