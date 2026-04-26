/**
 * models/contentPlanning/creative.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD dos criativos (peças) de um planejamento. Cada plano tem N criativos
 * com mídia (urls/video/cover) separada da copy (caption/cta/hashtags).
 *
 * Tabela: content_plan_creatives
 *
 * Multi-tenant: TODA query filtra por tenant_id (e por plan_id quando aplicável).
 * Decisões do cliente (approved | rejected | adjust) são registradas no log
 * de atividade via setClientDecision().
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');
const activity = require('./activity');

const VALID_TYPES = new Set(['post', 'reel', 'carousel', 'story']);
const VALID_DECISIONS = new Set(['approved', 'rejected', 'adjust']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeMediaUrls(value) {
  if (Array.isArray(value)) return value.map((u) => String(u).slice(0, 2048));
  return [];
}

function pickType(t) {
  if (typeof t !== 'string') return 'post';
  return VALID_TYPES.has(t) ? t : 'post';
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

async function listCreatives(planId, tenantId) {
  return query(
    `SELECT * FROM content_plan_creatives
      WHERE plan_id = $1 AND tenant_id = $2
      ORDER BY sort_order ASC, created_at ASC`,
    [planId, tenantId]
  );
}

async function getCreativeById(id, tenantId) {
  return queryOne(
    `SELECT * FROM content_plan_creatives
      WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Cria um criativo dentro de um plano.
 * Se sort_order não vier, usa MAX(sort_order)+1 do plano.
 */
async function createCreative(tenantId, planId, fields) {
  console.log('[INFO][ContentPlanning:Creative] createCreative', { tenantId, planId });

  if (!planId) throw new Error('planId é obrigatório');

  try {
    const planExists = await queryOne(
      `SELECT id FROM content_plans WHERE id = $1 AND tenant_id = $2`,
      [planId, tenantId]
    );
    if (!planExists) {
      console.log('[ERRO][ContentPlanning:Creative] plan não encontrado', { planId });
      throw new Error('plan_not_found');
    }

    let sortOrder = fields?.sort_order;
    if (!Number.isFinite(sortOrder)) {
      const max = await queryOne(
        `SELECT COALESCE(MAX(sort_order), -1) AS max_order
           FROM content_plan_creatives WHERE plan_id = $1`,
        [planId]
      );
      sortOrder = (max?.max_order ?? -1) + 1;
    }

    const row = await queryOne(
      `INSERT INTO content_plan_creatives
         (tenant_id, plan_id, sort_order, type, scheduled_for, scheduled_time,
          media_urls, video_url, cover_url, caption, cta, hashtags,
          internal_notes, copy_session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        tenantId,
        planId,
        sortOrder,
        pickType(fields?.type),
        fields?.scheduled_for || null,
        fields?.scheduled_time || null,
        JSON.stringify(sanitizeMediaUrls(fields?.media_urls)),
        fields?.video_url || null,
        fields?.cover_url || null,
        fields?.caption || null,
        fields?.cta || null,
        fields?.hashtags || null,
        fields?.internal_notes || null,
        fields?.copy_session_id || null,
      ]
    );

    console.log('[SUCESSO][ContentPlanning:Creative] criado', { id: row.id, planId });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Creative] createCreative falhou', { error: err.message });
    throw err;
  }
}

/**
 * Atualiza campos do criativo. Mídia/copy/decisão tratados de forma defensiva.
 */
async function updateCreative(id, tenantId, fields) {
  console.log('[INFO][ContentPlanning:Creative] updateCreative', { id, tenantId });

  if (!fields) return null;

  try {
    const row = await queryOne(
      `UPDATE content_plan_creatives
          SET sort_order      = COALESCE($3,  sort_order),
              type            = COALESCE($4,  type),
              scheduled_for   = COALESCE($5,  scheduled_for),
              scheduled_time  = COALESCE($6,  scheduled_time),
              media_urls      = COALESCE($7,  media_urls),
              video_url       = COALESCE($8,  video_url),
              cover_url       = COALESCE($9,  cover_url),
              caption         = COALESCE($10, caption),
              cta             = COALESCE($11, cta),
              hashtags        = COALESCE($12, hashtags),
              internal_notes  = COALESCE($13, internal_notes),
              copy_session_id = COALESCE($14, copy_session_id),
              updated_at      = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [
        id,
        tenantId,
        Number.isFinite(fields.sort_order) ? fields.sort_order : null,
        fields.type != null ? pickType(fields.type) : null,
        fields.scheduled_for != null ? fields.scheduled_for : null,
        fields.scheduled_time != null ? String(fields.scheduled_time).slice(0, 16) : null,
        fields.media_urls != null ? JSON.stringify(sanitizeMediaUrls(fields.media_urls)) : null,
        fields.video_url != null ? fields.video_url : null,
        fields.cover_url != null ? fields.cover_url : null,
        fields.caption != null ? fields.caption : null,
        fields.cta != null ? fields.cta : null,
        fields.hashtags != null ? fields.hashtags : null,
        fields.internal_notes != null ? fields.internal_notes : null,
        fields.copy_session_id != null ? fields.copy_session_id : null,
      ]
    );

    console.log('[SUCESSO][ContentPlanning:Creative] atualizado', { id });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Creative] updateCreative falhou', { id, error: err.message });
    throw err;
  }
}

async function deleteCreative(id, tenantId) {
  console.log('[INFO][ContentPlanning:Creative] deleteCreative', { id, tenantId });

  try {
    const row = await queryOne(
      `DELETE FROM content_plan_creatives
        WHERE id = $1 AND tenant_id = $2
        RETURNING id`,
      [id, tenantId]
    );
    if (!row) {
      console.log('[ERRO][ContentPlanning:Creative] deleteCreative não encontrado', { id });
      return false;
    }
    console.log('[SUCESSO][ContentPlanning:Creative] removido', { id });
    return true;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Creative] deleteCreative falhou', { id, error: err.message });
    throw err;
  }
}

/**
 * Reordena criativos do plano. Recebe array de ids na ordem desejada.
 * Garante que todos os ids pertencem ao plano informado.
 */
async function reorderCreatives(planId, tenantId, orderedIds) {
  console.log('[INFO][ContentPlanning:Creative] reorderCreatives', { planId, tenantId, count: orderedIds?.length });

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error('orderedIds deve ser um array não-vazio');
  }

  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await query(
        `UPDATE content_plan_creatives
            SET sort_order = $4, updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND plan_id = $3`,
        [orderedIds[i], tenantId, planId, i]
      );
    }
    console.log('[SUCESSO][ContentPlanning:Creative] reordenado', { planId, count: orderedIds.length });
    return listCreatives(planId, tenantId);
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Creative] reorderCreatives falhou', { error: err.message });
    throw err;
  }
}

/**
 * Cria N criativos de uma vez (usado pela geração via IA).
 * Mantém a ordem do array.
 */
async function bulkCreate(tenantId, planId, creativesArray) {
  console.log('[INFO][ContentPlanning:Creative] bulkCreate', { tenantId, planId, count: creativesArray?.length });

  if (!Array.isArray(creativesArray) || creativesArray.length === 0) return [];

  try {
    const planExists = await queryOne(
      `SELECT id FROM content_plans WHERE id = $1 AND tenant_id = $2`,
      [planId, tenantId]
    );
    if (!planExists) throw new Error('plan_not_found');

    const max = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order
         FROM content_plan_creatives WHERE plan_id = $1`,
      [planId]
    );
    let nextOrder = (max?.max_order ?? -1) + 1;

    const created = [];
    for (const c of creativesArray) {
      const row = await queryOne(
        `INSERT INTO content_plan_creatives
           (tenant_id, plan_id, sort_order, type, scheduled_for, scheduled_time,
            media_urls, video_url, cover_url, caption, cta, hashtags,
            internal_notes, copy_session_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          tenantId,
          planId,
          Number.isFinite(c?.sort_order) ? c.sort_order : nextOrder++,
          pickType(c?.type),
          c?.scheduled_for || null,
          c?.scheduled_time || null,
          JSON.stringify(sanitizeMediaUrls(c?.media_urls)),
          c?.video_url || null,
          c?.cover_url || null,
          c?.caption || null,
          c?.cta || null,
          c?.hashtags || null,
          c?.internal_notes || null,
          c?.copy_session_id || null,
        ]
      );
      created.push(row);
    }

    console.log('[SUCESSO][ContentPlanning:Creative] bulkCreate', { planId, count: created.length });
    return created;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Creative] bulkCreate falhou', { planId, error: err.message });
    throw err;
  }
}

/**
 * Registra a decisão do cliente sobre um criativo + log de atividade.
 *
 * @param {string} id
 * @param {string} tenantId
 * @param {Object} payload
 * @param {'approved'|'rejected'|'adjust'} payload.decision
 * @param {number} [payload.rating] - 1..5
 * @param {string} [payload.reason]
 * @param {string} [payload.notes]
 */
async function setClientDecision(id, tenantId, { decision, rating, reason, notes } = {}) {
  console.log('[INFO][ContentPlanning:Creative] setClientDecision', { id, decision });

  if (!VALID_DECISIONS.has(decision)) {
    console.log('[ERRO][ContentPlanning:Creative] decision inválida', { decision });
    throw new Error('invalid_decision');
  }

  try {
    let safeRating = null;
    if (Number.isFinite(rating)) {
      const r = Math.round(rating);
      if (r >= 1 && r <= 5) safeRating = r;
    }

    const row = await queryOne(
      `UPDATE content_plan_creatives
          SET client_decision = $3,
              client_rating   = COALESCE($4, client_rating),
              client_reason   = COALESCE($5, client_reason),
              client_notes    = COALESCE($6, client_notes),
              decided_at      = now(),
              updated_at      = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [id, tenantId, decision, safeRating, reason || null, notes || null]
    );

    if (!row) {
      console.log('[ERRO][ContentPlanning:Creative] setClientDecision não encontrou', { id });
      return null;
    }

    const eventType =
      decision === 'approved' ? 'client_approved' :
      decision === 'rejected' ? 'client_rejected' :
                                'client_rejected'; // 'adjust' também conta como ajuste pedido

    await activity.logActivity(tenantId, row.plan_id, {
      creativeId: row.id,
      actorType: 'client',
      actorId: null,
      eventType,
      payload: { decision, rating: safeRating, reason: reason || null },
    });

    console.log('[SUCESSO][ContentPlanning:Creative] decision registrada', { id, decision });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Creative] setClientDecision falhou', { id, error: err.message });
    throw err;
  }
}

/**
 * Reseta a decisão do cliente — usado quando a equipe edita um criativo já
 * aprovado/reprovado, fazendo a peça voltar para a lista de pendentes do
 * cliente público (page /aprovacao/[token]).
 */
async function resetClientDecision(id, tenantId) {
  console.log('[INFO][ContentPlanning:Creative] resetClientDecision', { id, tenantId });
  try {
    const row = await queryOne(
      `UPDATE content_plan_creatives
          SET client_decision = NULL,
              client_rating   = NULL,
              client_reason   = NULL,
              client_notes    = NULL,
              decided_at      = NULL,
              updated_at      = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [id, tenantId]
    );
    if (!row) {
      console.log('[ERRO][ContentPlanning:Creative] resetClientDecision não encontrado', { id });
      return null;
    }
    console.log('[SUCESSO][ContentPlanning:Creative] decision resetada', { id });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Creative] resetClientDecision falhou', { id, error: err.message });
    throw err;
  }
}

module.exports = {
  listCreatives,
  getCreativeById,
  createCreative,
  updateCreative,
  deleteCreative,
  reorderCreatives,
  bulkCreate,
  setClientDecision,
  resetClientDecision,
};
