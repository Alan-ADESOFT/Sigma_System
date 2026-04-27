/**
 * models/comercial/closing.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica de fechamento de lead (won/lost).
 *  · closeAsWon: cria marketing_client a partir do lead, move pra coluna 'won',
 *    seta won_at e client_id, registra activity + notification.
 *    Idempotente: se já tem client_id, retorna o existente.
 *  · closeAsLost: move pra coluna 'lost', seta lost_at + lost_reason, registra activity.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');
const { createClient, getClientById } = require('../client.model');
const { createActivity } = require('./activity.model');
const { createNotification } = require('../clientForm');
const { getColumnByRole } = require('./pipeline.model');

async function closeAsWon(tenantId, pipelineLeadId, payload = {}, createdBy = null) {
  console.log('[INFO][model:closing:closeAsWon]', { tenantId, pipelineLeadId });

  const lead = await queryOne(
    `SELECT * FROM comercial_pipeline_leads WHERE id = $1 AND tenant_id = $2`,
    [pipelineLeadId, tenantId]
  );
  if (!lead) throw new Error('Lead não encontrado');

  // Idempotência — se já tem client_id, reusa
  if (lead.client_id) {
    const existing = await getClientById(lead.client_id, tenantId);
    if (existing) {
      console.warn('[WARN][closing:closeAsWon] Lead já fechado, retornando cliente existente', {
        leadId: pipelineLeadId, clientId: lead.client_id,
      });
      return { client: existing, pipelineLead: lead, isNew: false };
    }
  }

  // 1. Cria marketing_client
  const client = await createClient(tenantId, {
    company_name:        lead.company_name,
    niche:               payload.niche  || lead.niche  || null,
    main_product:        payload.mainProduct || null,
    product_description: payload.productDescription || null,
    transformation:      payload.transformation || null,
    main_problem:        payload.mainProblem || null,
    avg_ticket:          payload.avgTicket || null,
    region:              payload.region || [lead.city, lead.state].filter(Boolean).join('/') || null,
    comm_objective:      payload.commObjective || null,
    email:               lead.email,
    phone:               lead.phone,
    status:              'active',
    logo_url:            payload.logoUrl || null,
    observations:        payload.observations || null,
  });

  // 2. Move pipeline_lead pra coluna 'won' + seta won_at + client_id
  const wonCol = await getColumnByRole(tenantId, 'won');
  if (!wonCol) throw new Error('Coluna system_role=won não encontrada — execute bootstrapDefaultColumns');

  const updated = await queryOne(
    `UPDATE comercial_pipeline_leads
        SET column_id = $1,
            won_at = COALESCE(won_at, now()),
            client_id = $2,
            last_activity_at = now()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
    [wonCol.id, client.id, pipelineLeadId, tenantId]
  );

  // 3. Activity
  const activity = await createActivity(tenantId, {
    pipelineLeadId,
    type: 'contract_won',
    content: payload.observations || null,
    metadata: { clientId: client.id, value: payload.contractValue || null },
    createdBy,
  });

  // 4. Notification
  try {
    await createNotification(
      tenantId,
      'lead_won',
      'Contrato fechado',
      `${lead.company_name} virou cliente — bem-vindo ao time.`,
      client.id,
      { pipelineLeadId, clientId: client.id }
    );
  } catch (err) {
    console.warn('[WARN][closing] notificação falhou', { error: err.message });
  }

  console.log('[SUCESSO][closing:closeAsWon]', { leadId: pipelineLeadId, clientId: client.id });
  return { client, pipelineLead: updated, activityId: activity.id, isNew: true };
}

async function closeAsLost(tenantId, pipelineLeadId, { reason } = {}, createdBy = null) {
  console.log('[INFO][model:closing:closeAsLost]', { tenantId, pipelineLeadId, reason });

  const lead = await queryOne(
    `SELECT * FROM comercial_pipeline_leads WHERE id = $1 AND tenant_id = $2`,
    [pipelineLeadId, tenantId]
  );
  if (!lead) throw new Error('Lead não encontrado');

  const lostCol = await getColumnByRole(tenantId, 'lost');
  if (!lostCol) throw new Error('Coluna system_role=lost não encontrada');

  const updated = await queryOne(
    `UPDATE comercial_pipeline_leads
        SET column_id = $1,
            lost_at = COALESCE(lost_at, now()),
            lost_reason = $2,
            last_activity_at = now()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
    [lostCol.id, reason || null, pipelineLeadId, tenantId]
  );

  const activity = await createActivity(tenantId, {
    pipelineLeadId,
    type: 'contract_lost',
    content: reason || null,
    metadata: { reason: reason || null },
    createdBy,
  });

  console.log('[SUCESSO][closing:closeAsLost]', { leadId: pipelineLeadId });
  return { pipelineLead: updated, activityId: activity.id };
}

module.exports = { closeAsWon, closeAsLost };
