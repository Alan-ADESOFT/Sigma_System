/**
 * models/comercial/prospect.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD de prospects. Prospect != marketing_client.
 * Só vira marketing_client quando ganha o contrato (Sprint 3).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');

async function createProspect(tenantId, data, createdBy = null) {
  console.log('[INFO][model:prospect:createProspect]', { tenantId, company: data?.companyName });
  const row = await queryOne(
    `INSERT INTO comercial_prospects
       (tenant_id, company_name, contact_name, phone, email, website, instagram,
        niche, city, state, source, pipeline_lead_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      tenantId,
      data.companyName,
      data.contactName    || null,
      data.phone          || null,
      data.email          || null,
      data.website        || null,
      data.instagram      || null,
      data.niche          || null,
      data.city           || null,
      data.state          || null,
      data.source         || 'manual',
      data.pipelineLeadId || null,
      createdBy,
    ]
  );
  console.log('[SUCESSO][model:prospect:createProspect]', { id: row.id });
  return row;
}

async function getProspectById(id, tenantId) {
  return queryOne(
    `SELECT * FROM comercial_prospects WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function getProspectByPipelineLead(pipelineLeadId, tenantId) {
  return queryOne(
    `SELECT * FROM comercial_prospects
      WHERE pipeline_lead_id = $1 AND tenant_id = $2
      LIMIT 1`,
    [pipelineLeadId, tenantId]
  );
}

/**
 * Idempotente — se já existe prospect pra esse pipeline_lead, retorna o existente.
 */
async function getOrCreateFromPipelineLead(pipelineLeadId, tenantId, createdBy = null) {
  const existing = await getProspectByPipelineLead(pipelineLeadId, tenantId);
  if (existing) return { prospect: existing, isNew: false };

  const lead = await queryOne(
    `SELECT * FROM comercial_pipeline_leads WHERE id = $1 AND tenant_id = $2`,
    [pipelineLeadId, tenantId]
  );
  if (!lead) throw new Error('Lead não encontrado');

  const prospect = await createProspect(tenantId, {
    companyName:    lead.company_name,
    contactName:    lead.contact_name,
    phone:          lead.phone,
    email:          lead.email,
    website:        lead.website,
    instagram:      lead.instagram,
    niche:          lead.niche,
    city:           lead.city,
    state:          lead.state,
    source:         'pipeline',
    pipelineLeadId: lead.id,
  }, createdBy);

  return { prospect, isNew: true };
}

async function listProspects(tenantId, { limit = 100, offset = 0, search = '' } = {}) {
  const conditions = ['tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;
  if (search && search.trim()) {
    conditions.push(`(company_name ILIKE $${idx} OR contact_name ILIKE $${idx} OR phone ILIKE $${idx})`);
    params.push(`%${search.trim()}%`);
    idx++;
  }
  return query(
    `SELECT p.*,
            (SELECT COUNT(*)::int FROM comercial_proposals pp WHERE pp.prospect_id = p.id) AS proposal_count
       FROM comercial_prospects p
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
}

const EDITABLE_FIELDS = [
  'company_name', 'contact_name', 'phone', 'email', 'website', 'instagram',
  'niche', 'city', 'state',
];

async function updateProspect(id, tenantId, data) {
  const sets = [];
  const params = [];
  let idx = 1;
  for (const f of EDITABLE_FIELDS) {
    if (data[f] === undefined) continue;
    sets.push(`${f} = $${idx++}`);
    params.push(data[f]);
  }
  if (sets.length === 0) return getProspectById(id, tenantId);
  params.push(id, tenantId);
  return queryOne(
    `UPDATE comercial_prospects SET ${sets.join(', ')}
      WHERE id = $${idx++} AND tenant_id = $${idx}
      RETURNING *`,
    params
  );
}

async function deleteProspect(id, tenantId) {
  await query(
    `DELETE FROM comercial_prospects WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

module.exports = {
  createProspect,
  getProspectById,
  getProspectByPipelineLead,
  getOrCreateFromPipelineLead,
  listProspects,
  updateProspect,
  deleteProspect,
};
