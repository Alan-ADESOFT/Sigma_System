/**
 * models/contentPlanning/plan.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD do planejamento mensal de conteúdo por cliente.
 * Cada plano agrega N criativos (content_plan_creatives), tem um status
 * configurável (content_plan_statuses) e pode ser clonado a partir de templates
 * ou de outros planos.
 *
 * Tabela: content_plans
 *
 * Multi-tenant: TODA query filtra por tenant_id.
 * Quando o status muda em updatePlan(), uma atividade é registrada
 * (event_type='status_changed').
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');
const statusModel = require('./status');
const activity = require('./activity');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SELECT_LIST_BASE = `
  SELECT
    p.*,
    mc.company_name      AS client_company_name,
    mc.logo_url          AS client_logo_url,
    s.label              AS status_label,
    s.color              AS status_color,
    s.key                AS status_key,
    s.is_terminal        AS status_is_terminal,
    o.name               AS owner_name,
    (SELECT COUNT(*)::int FROM content_plan_creatives c
       WHERE c.plan_id = p.id) AS creative_count,
    (SELECT COUNT(*)::int FROM content_plan_creatives c
       WHERE c.plan_id = p.id AND c.client_decision = 'approved') AS approved_count,
    (SELECT COUNT(*)::int FROM content_plan_creatives c
       WHERE c.plan_id = p.id AND c.client_decision IN ('rejected','adjust')) AS rejected_count
  FROM content_plans p
  LEFT JOIN marketing_clients mc      ON mc.id = p.client_id
  LEFT JOIN content_plan_statuses s   ON s.id  = p.status_id
  LEFT JOIN tenants o                 ON o.id  = p.owner_id
`;

// ─── Leitura ─────────────────────────────────────────────────────────────────

/**
 * Lista planos com filtros + agregados de criativos.
 * @param {string} tenantId
 * @param {Object} filters
 * @param {string} [filters.clientId]
 * @param {string} [filters.statusId]
 * @param {string} [filters.ownerId]
 * @param {boolean} [filters.isTemplate]
 * @param {string} [filters.search]
 * @param {number} [filters.limit=50]
 * @param {number} [filters.offset=0]
 */
async function listPlans(tenantId, filters = {}) {
  const { clientId, statusId, ownerId, isTemplate, search, limit = 50, offset = 0 } = filters;

  const conditions = ['p.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (clientId) {
    conditions.push(`p.client_id = $${idx}`);
    params.push(clientId);
    idx++;
  }
  if (statusId) {
    conditions.push(`p.status_id = $${idx}`);
    params.push(statusId);
    idx++;
  }
  if (ownerId) {
    conditions.push(`p.owner_id = $${idx}`);
    params.push(ownerId);
    idx++;
  }
  if (typeof isTemplate === 'boolean') {
    conditions.push(`p.is_template = $${idx}`);
    params.push(isTemplate);
    idx++;
  }
  if (search) {
    conditions.push(`(p.title ILIKE $${idx} OR mc.company_name ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  params.push(limit, offset);

  const sql = `${SELECT_LIST_BASE}
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.updated_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}`;

  return query(sql, params);
}

/**
 * Retorna o plano completo (com cliente, status, owner) + criativos ordenados.
 * @param {string} id
 * @param {string} tenantId
 * @returns {Promise<Object|null>}
 */
async function getPlanById(id, tenantId) {
  const plan = await queryOne(
    `${SELECT_LIST_BASE}
      WHERE p.id = $1 AND p.tenant_id = $2`,
    [id, tenantId]
  );

  if (!plan) return null;

  const creatives = await query(
    `SELECT * FROM content_plan_creatives
      WHERE plan_id = $1 AND tenant_id = $2
      ORDER BY sort_order ASC, created_at ASC`,
    [id, tenantId]
  );

  return { ...plan, creatives };
}

/**
 * Lista templates do tenant (is_template = true).
 */
async function listTemplates(tenantId) {
  return query(
    `${SELECT_LIST_BASE}
      WHERE p.tenant_id = $1 AND p.is_template = true
      ORDER BY p.updated_at DESC`,
    [tenantId]
  );
}

/**
 * Métricas agregadas de planos do tenant.
 * @param {string} tenantId
 * @param {Object} filters - { clientId?, from?, to? }
 */
async function getPlanStats(tenantId, filters = {}) {
  const { clientId, from, to } = filters;

  const conditions = ['p.tenant_id = $1', 'p.is_template = false'];
  const params = [tenantId];
  let idx = 2;

  if (clientId) {
    conditions.push(`p.client_id = $${idx}`);
    params.push(clientId);
    idx++;
  }
  if (from) {
    conditions.push(`p.created_at >= $${idx}`);
    params.push(from);
    idx++;
  }
  if (to) {
    conditions.push(`p.created_at <= $${idx}`);
    params.push(to);
    idx++;
  }

  const where = conditions.join(' AND ');

  const total = await queryOne(
    `SELECT COUNT(*)::int AS count FROM content_plans p WHERE ${where}`,
    params
  );

  const byStatus = await query(
    `SELECT s.id, s.key, s.label, s.color, COUNT(p.id)::int AS count
       FROM content_plan_statuses s
       LEFT JOIN content_plans p ON p.status_id = s.id AND ${where}
      WHERE s.tenant_id = $1
      GROUP BY s.id, s.key, s.label, s.color, s.sort_order
      ORDER BY s.sort_order ASC`,
    params
  );

  const approval = await queryOne(
    `SELECT
       COUNT(c.id)::int AS total_creatives,
       COUNT(*) FILTER (WHERE c.client_decision = 'approved')::int  AS approved,
       COUNT(*) FILTER (WHERE c.client_decision IN ('rejected','adjust'))::int AS rejected
     FROM content_plans p
     LEFT JOIN content_plan_creatives c ON c.plan_id = p.id
     WHERE ${where}`,
    params
  );

  const totalCreatives = approval?.total_creatives || 0;
  const approvedCount = approval?.approved || 0;
  const approvalRate = totalCreatives > 0 ? approvedCount / totalCreatives : 0;

  return {
    total: total?.count || 0,
    byStatus,
    approval: {
      total: totalCreatives,
      approved: approvedCount,
      rejected: approval?.rejected || 0,
      rate: Number(approvalRate.toFixed(4)),
    },
  };
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Cria um novo plano. Se status_id não for informado, usa o is_default do tenant.
 * Loga atividade event_type='plan_created'.
 *
 * @param {string} tenantId
 * @param {Object} fields
 * @param {string} fields.client_id
 * @param {string} fields.title
 * @param {string} [fields.month_reference] - 'YYYY-MM-DD'
 * @param {string} [fields.objective]
 * @param {string} [fields.central_promise]
 * @param {string} [fields.strategy_notes]
 * @param {string} [fields.status_id]
 * @param {string} [fields.owner_id]
 * @param {string} [fields.due_date]
 * @param {boolean} [fields.is_template]
 * @param {string} [fields.template_source]
 * @param {Object} [fields.metadata]
 * @param {string} [fields.actor_id] - usado só para o log de atividade
 */
async function createPlan(tenantId, fields) {
  console.log('[INFO][ContentPlanning:Plan] createPlan', { tenantId, title: fields?.title });

  if (!fields || !fields.client_id || !fields.title) {
    console.log('[ERRO][ContentPlanning:Plan] createPlan payload inválido');
    throw new Error('client_id e title são obrigatórios');
  }

  try {
    let statusId = fields.status_id || null;
    if (!statusId) {
      await statusModel.ensureDefaults(tenantId);
      const def = await statusModel.getDefaultStatus(tenantId);
      statusId = def?.id || null;
    }

    const row = await queryOne(
      `INSERT INTO content_plans
         (tenant_id, client_id, title, month_reference, objective, central_promise,
          strategy_notes, status_id, owner_id, due_date, is_template,
          template_source, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        tenantId,
        fields.client_id,
        String(fields.title).slice(0, 240),
        fields.month_reference || null,
        fields.objective || null,
        fields.central_promise || null,
        fields.strategy_notes || null,
        statusId,
        fields.owner_id || null,
        fields.due_date || null,
        Boolean(fields.is_template),
        fields.template_source || null,
        fields.metadata ? JSON.stringify(fields.metadata) : '{}',
      ]
    );

    await activity.logActivity(tenantId, row.id, {
      actorType: 'internal',
      actorId: fields.actor_id || null,
      eventType: 'plan_created',
      payload: { title: row.title, client_id: row.client_id },
    });

    console.log('[SUCESSO][ContentPlanning:Plan] criado', { id: row.id });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Plan] createPlan falhou', { error: err.message });
    throw err;
  }
}

/**
 * Atualiza campos do plano. Loga status_changed quando status_id muda.
 * @param {string} id
 * @param {string} tenantId
 * @param {Object} fields
 */
async function updatePlan(id, tenantId, fields) {
  console.log('[INFO][ContentPlanning:Plan] updatePlan', { id, tenantId });

  if (!fields) return null;

  try {
    const previous = await queryOne(
      `SELECT * FROM content_plans WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!previous) {
      console.log('[ERRO][ContentPlanning:Plan] updatePlan não encontrado', { id });
      return null;
    }

    const row = await queryOne(
      `UPDATE content_plans
          SET title           = COALESCE($3,  title),
              month_reference = COALESCE($4,  month_reference),
              objective       = COALESCE($5,  objective),
              central_promise = COALESCE($6,  central_promise),
              strategy_notes  = COALESCE($7,  strategy_notes),
              status_id       = COALESCE($8,  status_id),
              owner_id        = COALESCE($9,  owner_id),
              due_date        = COALESCE($10, due_date),
              is_template     = COALESCE($11, is_template),
              metadata        = COALESCE($12, metadata),
              updated_at      = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [
        id,
        tenantId,
        fields.title != null ? String(fields.title).slice(0, 240) : null,
        fields.month_reference != null ? fields.month_reference : null,
        fields.objective != null ? fields.objective : null,
        fields.central_promise != null ? fields.central_promise : null,
        fields.strategy_notes != null ? fields.strategy_notes : null,
        fields.status_id != null ? fields.status_id : null,
        fields.owner_id != null ? fields.owner_id : null,
        fields.due_date != null ? fields.due_date : null,
        typeof fields.is_template === 'boolean' ? fields.is_template : null,
        fields.metadata != null ? JSON.stringify(fields.metadata) : null,
      ]
    );

    if (row && fields.status_id && fields.status_id !== previous.status_id) {
      await activity.logActivity(tenantId, id, {
        actorType: 'internal',
        actorId: fields.actor_id || null,
        eventType: 'status_changed',
        payload: { from: previous.status_id, to: row.status_id },
      });
    }

    console.log('[SUCESSO][ContentPlanning:Plan] atualizado', { id });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Plan] updatePlan falhou', { id, error: err.message });
    throw err;
  }
}

/**
 * Remove o plano. CASCADE deleta criativos, tokens, versões e atividades.
 */
async function deletePlan(id, tenantId) {
  console.log('[INFO][ContentPlanning:Plan] deletePlan', { id, tenantId });

  try {
    const row = await queryOne(
      `DELETE FROM content_plans
        WHERE id = $1 AND tenant_id = $2
        RETURNING id`,
      [id, tenantId]
    );

    if (!row) {
      console.log('[ERRO][ContentPlanning:Plan] deletePlan não encontrado', { id });
      return false;
    }

    console.log('[SUCESSO][ContentPlanning:Plan] removido', { id });
    return true;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Plan] deletePlan falhou', { id, error: err.message });
    throw err;
  }
}

/**
 * Clona um plano (e todos os criativos). Marca template_source = sourceId.
 * Os criativos clonados não trazem decisão do cliente (reset).
 *
 * @param {string} sourceId
 * @param {string} tenantId
 * @param {Object} [overrides] - { client_id?, title?, month_reference?, owner_id?, due_date?, is_template? }
 * @returns {Promise<Object>} novo plano
 */
async function clonePlan(sourceId, tenantId, overrides = {}) {
  console.log('[INFO][ContentPlanning:Plan] clonePlan', { sourceId, tenantId });

  try {
    const source = await queryOne(
      `SELECT * FROM content_plans WHERE id = $1 AND tenant_id = $2`,
      [sourceId, tenantId]
    );
    if (!source) {
      console.log('[ERRO][ContentPlanning:Plan] clonePlan source não encontrado', { sourceId });
      throw new Error('source_plan_not_found');
    }

    const newPlan = await queryOne(
      `INSERT INTO content_plans
         (tenant_id, client_id, title, month_reference, objective, central_promise,
          strategy_notes, status_id, owner_id, due_date, is_template,
          template_source, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        tenantId,
        overrides.client_id || source.client_id,
        overrides.title || `${source.title} (cópia)`,
        overrides.month_reference !== undefined ? overrides.month_reference : source.month_reference,
        source.objective,
        source.central_promise,
        source.strategy_notes,
        // sempre começa no status default no destino
        null,
        overrides.owner_id !== undefined ? overrides.owner_id : source.owner_id,
        overrides.due_date !== undefined ? overrides.due_date : source.due_date,
        typeof overrides.is_template === 'boolean' ? overrides.is_template : false,
        sourceId,
        source.metadata ? JSON.stringify(source.metadata) : '{}',
      ]
    );

    // Define o status default se houver
    await statusModel.ensureDefaults(tenantId);
    const def = await statusModel.getDefaultStatus(tenantId);
    if (def) {
      await query(
        `UPDATE content_plans SET status_id = $1, updated_at = now()
          WHERE id = $2 AND tenant_id = $3`,
        [def.id, newPlan.id, tenantId]
      );
      newPlan.status_id = def.id;
    }

    // Clona criativos
    await query(
      `INSERT INTO content_plan_creatives
         (tenant_id, plan_id, sort_order, type, scheduled_for, scheduled_time,
          media_urls, video_url, cover_url, caption, cta, hashtags,
          internal_notes, copy_session_id)
       SELECT
         tenant_id, $1, sort_order, type, scheduled_for, scheduled_time,
         media_urls, video_url, cover_url, caption, cta, hashtags,
         internal_notes, copy_session_id
         FROM content_plan_creatives
        WHERE plan_id = $2 AND tenant_id = $3`,
      [newPlan.id, sourceId, tenantId]
    );

    await activity.logActivity(tenantId, newPlan.id, {
      actorType: 'internal',
      actorId: overrides.actor_id || null,
      eventType: 'plan_created',
      payload: { cloned_from: sourceId, title: newPlan.title },
    });

    console.log('[SUCESSO][ContentPlanning:Plan] clonado', { sourceId, newId: newPlan.id });
    return newPlan;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Plan] clonePlan falhou', { sourceId, error: err.message });
    throw err;
  }
}

module.exports = {
  listPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  clonePlan,
  listTemplates,
  getPlanStats,
};
