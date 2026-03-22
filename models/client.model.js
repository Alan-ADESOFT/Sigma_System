const { query, queryOne } = require('../infra/db');

const STAGE_KEYS = ['diagnosis', 'competitors', 'audience', 'avatar', 'positioning', 'offer'];

// ─── Clients ────────────────────────────────────────────────────────────────

async function getClientsByTenant(tenantId) {
  return query(
    `SELECT mc.*,
       COALESCE((
         SELECT SUM(cc.monthly_value)
         FROM client_contracts cc
         WHERE cc.client_id = mc.id AND cc.status = 'active'
       ), 0) AS contract_monthly_total
     FROM marketing_clients mc
     WHERE mc.tenant_id = $1
     ORDER BY mc.created_at DESC`,
    [tenantId]
  );
}

async function getClientById(id, tenantId) {
  return queryOne(
    `SELECT * FROM marketing_clients
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function createClient(tenantId, fields) {
  const {
    company_name, niche, main_product, product_description,
    transformation, main_problem, avg_ticket, region,
    comm_objective, comm_objective_other,
    email, phone, status,
    logo_url, observations,
    important_links, services,
    extra_data,
  } = fields;

  return queryOne(
    `INSERT INTO marketing_clients
       (tenant_id, company_name, niche, main_product, product_description,
        transformation, main_problem, avg_ticket, region,
        comm_objective, comm_objective_other,
        email, phone, status, logo_url, observations,
        important_links, services, extra_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      tenantId, company_name, niche, main_product, product_description,
      transformation, main_problem, avg_ticket, region,
      comm_objective, comm_objective_other,
      email || null, phone || null, status || 'active',
      logo_url || null, observations || null,
      important_links ? JSON.stringify(important_links) : '[]',
      services ? JSON.stringify(services) : '[]',
      extra_data ? JSON.stringify(extra_data) : null,
    ]
  );
}

async function updateClient(id, tenantId, fields) {
  const {
    company_name, niche, main_product, product_description,
    transformation, main_problem, avg_ticket, region,
    comm_objective, comm_objective_other,
    email, phone, status,
    logo_url, observations,
    important_links, services,
    extra_data,
  } = fields;

  return queryOne(
    `UPDATE marketing_clients SET
       company_name         = COALESCE($3,  company_name),
       niche                = COALESCE($4,  niche),
       main_product         = COALESCE($5,  main_product),
       product_description  = COALESCE($6,  product_description),
       transformation       = COALESCE($7,  transformation),
       main_problem         = COALESCE($8,  main_problem),
       avg_ticket           = COALESCE($9,  avg_ticket),
       region               = COALESCE($10, region),
       comm_objective       = COALESCE($11, comm_objective),
       comm_objective_other = COALESCE($12, comm_objective_other),
       email                = COALESCE($13, email),
       phone                = COALESCE($14, phone),
       status               = COALESCE($15, status),
       logo_url             = COALESCE($16, logo_url),
       observations         = COALESCE($17, observations),
       important_links      = COALESCE($18::jsonb, important_links),
       services             = COALESCE($19::jsonb, services),
       extra_data           = COALESCE($20, extra_data)
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [
      id, tenantId,
      company_name, niche, main_product, product_description,
      transformation, main_problem, avg_ticket, region,
      comm_objective, comm_objective_other,
      email || null, phone || null, status || null,
      logo_url !== undefined ? (logo_url || null) : undefined,
      observations !== undefined ? (observations || null) : undefined,
      important_links !== undefined ? JSON.stringify(important_links) : null,
      services !== undefined ? JSON.stringify(services) : null,
      extra_data ? JSON.stringify(extra_data) : null,
    ]
  );
}

async function deleteClient(id, tenantId) {
  return queryOne(
    `DELETE FROM marketing_clients
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );
}

// ─── Stage helpers ──────────────────────────────────────────────────────────

async function seedStages(clientId) {
  for (const key of STAGE_KEYS) {
    await query(
      `INSERT INTO marketing_stages (client_id, stage_key, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (client_id, stage_key) DO NOTHING`,
      [clientId, key]
    );
  }
}

module.exports = {
  STAGE_KEYS,
  getClientsByTenant,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  seedStages,
};
