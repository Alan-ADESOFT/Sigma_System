/**
 * models/comercial/activity.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Timeline unificada de atividades por lead.
 *
 * Tipos:
 *   note, call_logged, whatsapp_sent, email_sent, status_change,
 *   ai_analysis, proposal_created, proposal_sent, proposal_viewed,
 *   contract_won, contract_lost, lead_created
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');

async function createActivity(tenantId, {
  pipelineLeadId, type, content, metadata, createdBy,
}) {
  if (!pipelineLeadId || !type) {
    throw new Error('pipelineLeadId e type obrigatórios');
  }
  console.log('[INFO][model:activity:createActivity]', { tenantId, pipelineLeadId, type });

  const row = await queryOne(
    `INSERT INTO comercial_lead_activities
       (tenant_id, pipeline_lead_id, type, content, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING *`,
    [
      tenantId, pipelineLeadId, type,
      content || null,
      JSON.stringify(metadata || {}),
      createdBy || null,
    ]
  );

  // Bumpa last_activity_at do lead
  await query(
    `UPDATE comercial_pipeline_leads SET last_activity_at = now()
       WHERE id = $1 AND tenant_id = $2`,
    [pipelineLeadId, tenantId]
  );

  return row;
}

async function getActivitiesByLead(tenantId, pipelineLeadId, { limit = 100 } = {}) {
  return query(
    `SELECT a.*, t.name AS author_name, t.avatar_url AS author_avatar
       FROM comercial_lead_activities a
       LEFT JOIN tenants t ON t.id = a.created_by
      WHERE a.tenant_id = $1 AND a.pipeline_lead_id = $2
      ORDER BY a.created_at DESC
      LIMIT $3`,
    [tenantId, pipelineLeadId, limit]
  );
}

async function getActivityById(tenantId, id) {
  return queryOne(
    `SELECT * FROM comercial_lead_activities WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function deleteActivity(tenantId, id, currentUserId, isAdmin = false) {
  // Apenas autor ou admin
  const act = await getActivityById(tenantId, id);
  if (!act) return false;
  if (!isAdmin && act.created_by && act.created_by !== currentUserId) {
    throw new Error('Sem permissão para deletar essa atividade');
  }
  await query(
    `DELETE FROM comercial_lead_activities WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return true;
}

async function getActivityCounts(tenantId, pipelineLeadId) {
  const rows = await query(
    `SELECT type, COUNT(*)::int AS c
       FROM comercial_lead_activities
      WHERE tenant_id = $1 AND pipeline_lead_id = $2
      GROUP BY type`,
    [tenantId, pipelineLeadId]
  );
  const out = {};
  for (const r of rows) out[r.type] = r.c;
  return out;
}

module.exports = {
  createActivity,
  getActivitiesByLead,
  getActivityById,
  deleteActivity,
  getActivityCounts,
};
