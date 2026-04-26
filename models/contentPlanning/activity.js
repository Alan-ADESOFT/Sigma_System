/**
 * models/contentPlanning/activity.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Log de atividades do módulo de planejamento — alimenta o sininho do dashboard
 * e a timeline de cada plano.
 *
 * Tabela: content_plan_activity
 *
 * Eventos suportados:
 *   plan_created | status_changed | link_generated | client_opened
 *   client_approved | client_rejected | client_finalized | ai_generated
 *   version_saved
 *
 * logActivity é tolerante a falhas — nunca lança exceção, só loga.
 * Isso evita que um erro no log derrube uma operação principal (ex:
 * salvar um criativo).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Registra uma atividade. Nunca lança erro.
 *
 * @param {string} tenantId
 * @param {string} planId
 * @param {Object} opts
 * @param {string} [opts.creativeId]
 * @param {'internal'|'client'} opts.actorType
 * @param {string} [opts.actorId]
 * @param {string} opts.eventType
 * @param {Object} [opts.payload]
 */
async function logActivity(tenantId, planId, { creativeId, actorType, actorId, eventType, payload } = {}) {
  if (!tenantId || !planId || !eventType) return null;

  try {
    return await queryOne(
      `INSERT INTO content_plan_activity
         (tenant_id, plan_id, creative_id, actor_type, actor_id, event_type, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        planId,
        creativeId || null,
        actorType || 'internal',
        actorId || null,
        eventType,
        JSON.stringify(payload || {}),
      ]
    );
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Activity] logActivity falhou (silencioso)', {
      tenantId, planId, eventType, error: err.message,
    });
    return null;
  }
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

/**
 * Lista atividades não-lidas do tenant — usado pelo sininho.
 * Faz JOIN com content_plans + marketing_clients para enriquecer.
 */
async function listUnreadActivities(tenantId, { limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return query(
    `SELECT
        a.*,
        p.title         AS plan_title,
        p.client_id     AS plan_client_id,
        mc.company_name AS client_company_name,
        mc.logo_url     AS client_logo_url
       FROM content_plan_activity a
       JOIN content_plans p     ON p.id  = a.plan_id
  LEFT JOIN marketing_clients mc ON mc.id = p.client_id
      WHERE a.tenant_id = $1 AND a.read = false
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [tenantId, safeLimit]
  );
}

/**
 * Marca um conjunto de atividades como lidas.
 */
async function markAsRead(activityIds, tenantId) {
  console.log('[INFO][ContentPlanning:Activity] markAsRead', { tenantId, count: activityIds?.length });

  if (!Array.isArray(activityIds) || activityIds.length === 0) return 0;

  try {
    const result = await query(
      `UPDATE content_plan_activity
          SET read = true
        WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [tenantId, activityIds]
    );
    console.log('[SUCESSO][ContentPlanning:Activity] markAsRead', { count: activityIds.length });
    return result;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Activity] markAsRead falhou', { error: err.message });
    throw err;
  }
}

/**
 * Marca todas as atividades do tenant como lidas.
 */
async function markAllAsRead(tenantId) {
  console.log('[INFO][ContentPlanning:Activity] markAllAsRead', { tenantId });
  try {
    await query(
      `UPDATE content_plan_activity
          SET read = true
        WHERE tenant_id = $1 AND read = false`,
      [tenantId]
    );
    console.log('[SUCESSO][ContentPlanning:Activity] markAllAsRead', { tenantId });
    return true;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Activity] markAllAsRead falhou', { error: err.message });
    throw err;
  }
}

/**
 * Timeline de atividades de um plano.
 */
async function listPlanActivities(planId, tenantId, { limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  return query(
    `SELECT a.*, t.name AS actor_name
       FROM content_plan_activity a
  LEFT JOIN tenants t ON t.id = a.actor_id
      WHERE a.plan_id = $1 AND a.tenant_id = $2
      ORDER BY a.created_at DESC
      LIMIT $3`,
    [planId, tenantId, safeLimit]
  );
}

module.exports = {
  logActivity,
  listUnreadActivities,
  markAsRead,
  markAllAsRead,
  listPlanActivities,
};
