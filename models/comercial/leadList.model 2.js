/**
 * models/comercial/leadList.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD de listas de leads (origem Apify, CSV ou manual) e seus leads.
 * Multi-tenant: TODA query filtra por tenant_id.
 *
 * Tabelas: comercial_lead_lists, comercial_leads
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');

// ─── Listas ──────────────────────────────────────────────────────────────────

/**
 * Cria uma nova lista.
 * @param {string} tenantId
 * @param {Object} data
 * @param {string} data.name
 * @param {string} [data.source='apify']
 * @param {Object} [data.filters={}]
 * @param {string|Date} data.expiresAt
 * @param {string} [data.createdBy]
 * @returns {Promise<Object>}
 */
async function createList(tenantId, { name, source = 'apify', filters = {}, expiresAt, createdBy = null }) {
  console.log('[INFO][model:leadList:createList]', { tenantId, source, name });
  if (!expiresAt) throw new Error('expiresAt obrigatório');

  const expiresIso = expiresAt instanceof Date ? expiresAt.toISOString() : new Date(expiresAt).toISOString();
  const row = await queryOne(
    `INSERT INTO comercial_lead_lists (tenant_id, name, source, filters, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, name, source, JSON.stringify(filters || {}), expiresIso, createdBy]
  );
  console.log('[SUCESSO][model:leadList:createList]', { listId: row.id });
  return row;
}

/**
 * Atualiza status / contadores / erro / runId.
 */
async function updateListStatus(id, tenantId, { status, totalLeads, apifyRunId, errorMessage }) {
  const sets = [];
  const params = [];
  let idx = 1;

  if (status !== undefined)       { sets.push(`status = $${idx++}`);       params.push(status); }
  if (totalLeads !== undefined)   { sets.push(`total_leads = $${idx++}`);  params.push(totalLeads); }
  if (apifyRunId !== undefined)   { sets.push(`apify_run_id = $${idx++}`); params.push(apifyRunId); }
  if (errorMessage !== undefined) { sets.push(`error_message = $${idx++}`); params.push(errorMessage); }

  if (sets.length === 0) return null;

  params.push(id, tenantId);
  const row = await queryOne(
    `UPDATE comercial_lead_lists SET ${sets.join(', ')}
     WHERE id = $${idx++} AND tenant_id = $${idx}
     RETURNING *`,
    params
  );
  return row;
}

/**
 * Retorna lista + count de leads + count importados.
 */
async function getListById(id, tenantId) {
  const row = await queryOne(
    `SELECT l.*,
            (SELECT COUNT(*)::int FROM comercial_leads cl WHERE cl.list_id = l.id) AS leads_count,
            (SELECT COUNT(*)::int FROM comercial_leads cl WHERE cl.list_id = l.id AND cl.imported_to_pipeline = true) AS imported_count
       FROM comercial_lead_lists l
      WHERE l.id = $1 AND l.tenant_id = $2`,
    [id, tenantId]
  );
  return row;
}

/**
 * Lista todas listas do tenant com agregados.
 */
async function listLists(tenantId, { limit = 100, offset = 0 } = {}) {
  return query(
    `SELECT l.*,
            (SELECT COUNT(*)::int FROM comercial_leads cl WHERE cl.list_id = l.id) AS leads_count,
            (SELECT COUNT(*)::int FROM comercial_leads cl WHERE cl.list_id = l.id AND cl.imported_to_pipeline = true) AS imported_count
       FROM comercial_lead_lists l
      WHERE l.tenant_id = $1
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );
}

async function deleteList(id, tenantId) {
  console.log('[INFO][model:leadList:deleteList]', { id, tenantId });
  await query(
    `DELETE FROM comercial_lead_lists WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

// ─── Leads dentro de uma lista ───────────────────────────────────────────────

/**
 * Bulk insert de leads em chunks pra economizar round-trips.
 */
async function addLeadsToList(listId, tenantId, leadsArray) {
  if (!Array.isArray(leadsArray) || leadsArray.length === 0) return 0;
  console.log('[INFO][model:leadList:addLeadsToList]', { listId, count: leadsArray.length });

  const CHUNK = 50;
  let inserted = 0;

  for (let i = 0; i < leadsArray.length; i += CHUNK) {
    const chunk = leadsArray.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    let idx = 1;

    for (const lead of chunk) {
      values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(
        tenantId,
        listId,
        lead.company_name,
        lead.phone || null,
        lead.website || null,
        lead.google_rating != null ? Number(lead.google_rating) : null,
        lead.review_count != null ? Number(lead.review_count) : 0,
        lead.address || null,
        lead.city    || null,
        lead.state   || null,
        lead.niche   || null,
        !!lead.has_website,
        lead.instagram_handle || null,
        lead.sigma_score != null ? Number(lead.sigma_score) : null,
        JSON.stringify(lead.raw_data || {}),
      );
    }

    await query(
      `INSERT INTO comercial_leads
         (tenant_id, list_id, company_name, phone, website, google_rating, review_count,
          address, city, state, niche, has_website, instagram_handle, sigma_score, raw_data)
       VALUES ${values.join(', ')}`,
      params
    );
    inserted += chunk.length;
  }

  console.log('[SUCESSO][model:leadList:addLeadsToList]', { listId, inserted });
  return inserted;
}

/**
 * Lista leads de uma lista paginados + busca textual.
 */
async function getLeadsByListId(listId, tenantId, { limit = 50, offset = 0, search = '' } = {}) {
  const conditions = ['cl.list_id = $1', 'cl.tenant_id = $2'];
  const params = [listId, tenantId];
  let idx = 3;

  if (search && search.trim()) {
    conditions.push(`(cl.company_name ILIKE $${idx} OR cl.city ILIKE $${idx} OR cl.niche ILIKE $${idx})`);
    params.push(`%${search.trim()}%`);
    idx++;
  }

  const rows = await query(
    `SELECT cl.*
       FROM comercial_leads cl
      WHERE ${conditions.join(' AND ')}
      ORDER BY (cl.sigma_score IS NULL), cl.sigma_score DESC, cl.created_at DESC
      LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );

  const total = await queryOne(
    `SELECT COUNT(*)::int AS c FROM comercial_leads cl WHERE ${conditions.join(' AND ')}`,
    params
  );

  return { rows, total: total?.c || 0 };
}

/**
 * Marca um lead da lista como já importado para o pipeline.
 */
async function markLeadAsImported(leadId, pipelineLeadId) {
  await query(
    `UPDATE comercial_leads
        SET imported_to_pipeline = true, pipeline_lead_id = $2
      WHERE id = $1`,
    [leadId, pipelineLeadId]
  );
}

/**
 * Retorna leads pelos IDs (filtrados por tenant + lista).
 */
async function getLeadsByIds(listId, tenantId, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return query(
    `SELECT * FROM comercial_leads
      WHERE list_id = $1 AND tenant_id = $2 AND id = ANY($3::text[])`,
    [listId, tenantId, ids]
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  createList,
  updateListStatus,
  getListById,
  listLists,
  deleteList,
  addLeadsToList,
  getLeadsByListId,
  getLeadsByIds,
  markLeadAsImported,
};
