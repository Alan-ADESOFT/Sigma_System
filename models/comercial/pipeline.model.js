/**
 * models/comercial/pipeline.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Kanban comercial: colunas customizáveis + leads em pipeline.
 * Multi-tenant: TODA query filtra por tenant_id.
 *
 * Tabelas: comercial_pipeline_columns, comercial_pipeline_leads
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');
const { markLeadAsImported } = require('./leadList.model');

// ─── Colunas ─────────────────────────────────────────────────────────────────

/**
 * Lista colunas do tenant ordenadas + count de leads em cada.
 */
async function getColumns(tenantId) {
  return query(
    `SELECT c.*,
            (SELECT COUNT(*)::int
               FROM comercial_pipeline_leads pl
              WHERE pl.column_id = c.id) AS leads_count
       FROM comercial_pipeline_columns c
      WHERE c.tenant_id = $1
      ORDER BY c.sort_order ASC, c.created_at ASC`,
    [tenantId]
  );
}

async function getColumnById(id, tenantId) {
  return queryOne(
    `SELECT * FROM comercial_pipeline_columns WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function getColumnByRole(tenantId, role) {
  return queryOne(
    `SELECT * FROM comercial_pipeline_columns
      WHERE tenant_id = $1 AND system_role = $2
      LIMIT 1`,
    [tenantId, role]
  );
}

async function createColumn(tenantId, { name, color = '#6366F1', sortOrder, isSystem = false, systemRole = null }) {
  console.log('[INFO][model:pipeline:createColumn]', { tenantId, name });
  let order = sortOrder;
  if (order == null) {
    const r = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1) AS max FROM comercial_pipeline_columns WHERE tenant_id = $1`,
      [tenantId]
    );
    order = (r?.max ?? -1) + 1;
  }
  const row = await queryOne(
    `INSERT INTO comercial_pipeline_columns (tenant_id, name, color, sort_order, is_system, system_role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, name) DO UPDATE SET color = EXCLUDED.color
     RETURNING *`,
    [tenantId, name, color, order, isSystem, systemRole]
  );
  return row;
}

async function updateColumn(id, tenantId, { name, color, sortOrder }) {
  const sets = [];
  const params = [];
  let idx = 1;
  if (name !== undefined)      { sets.push(`name = $${idx++}`);       params.push(name); }
  if (color !== undefined)     { sets.push(`color = $${idx++}`);      params.push(color); }
  if (sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); params.push(sortOrder); }
  if (sets.length === 0) return getColumnById(id, tenantId);

  params.push(id, tenantId);
  return queryOne(
    `UPDATE comercial_pipeline_columns SET ${sets.join(', ')}
      WHERE id = $${idx++} AND tenant_id = $${idx}
      RETURNING *`,
    params
  );
}

async function deleteColumn(id, tenantId) {
  console.log('[INFO][model:pipeline:deleteColumn]', { id, tenantId });
  const col = await getColumnById(id, tenantId);
  if (!col) return null;
  if (col.is_system) {
    throw new Error('Coluna de sistema não pode ser deletada');
  }
  // Move leads pra coluna start
  const start = await getColumnByRole(tenantId, 'start');
  if (!start) {
    throw new Error('Coluna inicial (system_role=start) não encontrada — execute bootstrapDefaultColumns');
  }
  await query(
    `UPDATE comercial_pipeline_leads SET column_id = $1, last_activity_at = now()
      WHERE column_id = $2 AND tenant_id = $3`,
    [start.id, id, tenantId]
  );
  await query(
    `DELETE FROM comercial_pipeline_columns WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return { moved_to: start.id };
}

/**
 * Atualiza sort_order de várias colunas em batch.
 * @param {string} tenantId
 * @param {string[]} orderedIds - Ordem desejada
 */
async function reorderColumns(tenantId, orderedIds) {
  if (!Array.isArray(orderedIds)) return;
  for (let i = 0; i < orderedIds.length; i++) {
    await query(
      `UPDATE comercial_pipeline_columns SET sort_order = $1
        WHERE id = $2 AND tenant_id = $3`,
      [i, orderedIds[i], tenantId]
    );
  }
}

const DEFAULT_COLUMNS = [
  { name: 'Pendente',         color: '#94A3B8', isSystem: true,  systemRole: 'start' },
  { name: 'Ligação',          color: '#3B82F6', isSystem: false, systemRole: null    },
  { name: 'Reunião marcada',  color: '#6366F1', isSystem: false, systemRole: null    },
  { name: 'Apresentação',     color: '#F59E0B', isSystem: false, systemRole: null    },
  { name: 'Fechamento',       color: '#EF4444', isSystem: false, systemRole: null    },
  { name: 'Fechado',          color: '#10B981', isSystem: true,  systemRole: 'won'   },
  { name: 'Perdido',          color: '#6B7280', isSystem: true,  systemRole: 'lost'  },
];

/**
 * Cria as colunas padrão se ainda não existirem para o tenant.
 * Idempotente.
 */
async function bootstrapDefaultColumns(tenantId) {
  const existing = await query(
    `SELECT name FROM comercial_pipeline_columns WHERE tenant_id = $1`,
    [tenantId]
  );
  if (existing.length > 0) return existing;

  console.log('[INFO][model:pipeline:bootstrapDefaultColumns]', { tenantId });
  for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
    const col = DEFAULT_COLUMNS[i];
    await createColumn(tenantId, {
      name: col.name,
      color: col.color,
      sortOrder: i,
      isSystem: col.isSystem,
      systemRole: col.systemRole,
    });
  }
  return getColumns(tenantId);
}

// ─── Leads em pipeline ───────────────────────────────────────────────────────

const LEAD_SELECT = `
  pl.*,
  c.name  AS column_name,
  c.color AS column_color,
  c.system_role AS column_role,
  t.name  AS assigned_name,
  t.avatar_url AS assigned_avatar
`;

/**
 * Lista leads do pipeline, com filtros.
 */
async function getLeads(tenantId, { columnId, assignedTo, search } = {}) {
  const conditions = ['pl.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (columnId) {
    conditions.push(`pl.column_id = $${idx++}`);
    params.push(columnId);
  }
  if (assignedTo) {
    conditions.push(`pl.assigned_to = $${idx++}`);
    params.push(assignedTo);
  }
  if (search && search.trim()) {
    conditions.push(`(pl.company_name ILIKE $${idx} OR pl.contact_name ILIKE $${idx} OR pl.phone ILIKE $${idx})`);
    params.push(`%${search.trim()}%`);
    idx++;
  }

  return query(
    `SELECT ${LEAD_SELECT}
       FROM comercial_pipeline_leads pl
       LEFT JOIN comercial_pipeline_columns c ON c.id = pl.column_id
       LEFT JOIN tenants t ON t.id = pl.assigned_to
      WHERE ${conditions.join(' AND ')}
      ORDER BY pl.sort_order ASC, pl.last_activity_at DESC`,
    params
  );
}

async function getLeadById(id, tenantId) {
  return queryOne(
    `SELECT ${LEAD_SELECT}
       FROM comercial_pipeline_leads pl
       LEFT JOIN comercial_pipeline_columns c ON c.id = pl.column_id
       LEFT JOIN tenants t ON t.id = pl.assigned_to
      WHERE pl.id = $1 AND pl.tenant_id = $2`,
    [id, tenantId]
  );
}

async function createLead(tenantId, data, createdBy = null) {
  console.log('[INFO][model:pipeline:createLead]', { tenantId, company: data?.company_name });
  const cols = data || {};
  let columnId = cols.column_id;

  if (!columnId) {
    const start = await getColumnByRole(tenantId, 'start');
    if (!start) throw new Error('Coluna de início não encontrada — bootstrap primeiro');
    columnId = start.id;
  }

  const row = await queryOne(
    `INSERT INTO comercial_pipeline_leads
      (tenant_id, lead_id, column_id, assigned_to, company_name, contact_name, phone, email,
       website, instagram, niche, city, state, estimated_value, notes, links,
       google_rating, review_count, sigma_score, created_by)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14, $15, $16::jsonb,
       $17, $18, $19, $20)
     RETURNING *`,
    [
      tenantId,
      cols.lead_id || null,
      columnId,
      cols.assigned_to || null,
      cols.company_name,
      cols.contact_name || null,
      cols.phone        || null,
      cols.email        || null,
      cols.website      || null,
      cols.instagram    || null,
      cols.niche        || null,
      cols.city         || null,
      cols.state        || null,
      cols.estimated_value != null ? Number(cols.estimated_value) : null,
      cols.notes        || null,
      JSON.stringify(cols.links || []),
      cols.google_rating != null ? Number(cols.google_rating) : null,
      cols.review_count  != null ? Number(cols.review_count)  : null,
      cols.sigma_score   != null ? Number(cols.sigma_score)   : null,
      createdBy,
    ]
  );

  // Activity 'lead_created' (require lazy pra evitar ciclo)
  if (row) {
    try {
      const { createActivity } = require('./activity.model');
      await createActivity(tenantId, {
        pipelineLeadId: row.id,
        type: 'lead_created',
        metadata: {
          source: cols.lead_id ? 'imported' : 'manual',
          sigmaScore: row.sigma_score,
        },
        createdBy,
      });
    } catch (err) {
      console.warn('[WARN][pipeline:createLead] activity falhou', { error: err.message });
    }
  }

  return row;
}

const EDITABLE_FIELDS = [
  'company_name', 'contact_name', 'phone', 'email', 'website', 'instagram',
  'niche', 'city', 'state', 'estimated_value', 'notes', 'links',
  'assigned_to', 'column_id', 'sort_order',
];

async function updateLead(id, tenantId, data) {
  const sets = [];
  const params = [];
  let idx = 1;

  for (const field of EDITABLE_FIELDS) {
    if (data[field] === undefined) continue;
    if (field === 'links') {
      sets.push(`links = $${idx++}::jsonb`);
      params.push(JSON.stringify(data.links || []));
    } else {
      sets.push(`${field} = $${idx++}`);
      params.push(data[field]);
    }
  }

  if (sets.length === 0) return getLeadById(id, tenantId);

  sets.push(`last_activity_at = now()`);
  params.push(id, tenantId);

  return queryOne(
    `UPDATE comercial_pipeline_leads SET ${sets.join(', ')}
      WHERE id = $${idx++} AND tenant_id = $${idx}
      RETURNING *`,
    params
  );
}

async function deleteLead(id, tenantId) {
  await query(
    `DELETE FROM comercial_pipeline_leads WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

/**
 * Move um lead pra outra coluna. Registra activity 'status_change'.
 */
async function moveLead(id, tenantId, { columnId, sortOrder }, createdBy = null) {
  if (!columnId) throw new Error('columnId obrigatório');
  const col = await getColumnById(columnId, tenantId);
  if (!col) throw new Error('Coluna não pertence ao tenant');

  // Pega coluna atual antes de mover (para metadata da activity)
  const before = await queryOne(
    `SELECT pl.column_id, c.name AS column_name
       FROM comercial_pipeline_leads pl
       LEFT JOIN comercial_pipeline_columns c ON c.id = pl.column_id
      WHERE pl.id = $1 AND pl.tenant_id = $2`,
    [id, tenantId]
  );

  const updated = await queryOne(
    `UPDATE comercial_pipeline_leads
        SET column_id = $1,
            sort_order = COALESCE($2, sort_order),
            last_activity_at = now()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
    [columnId, sortOrder != null ? Number(sortOrder) : null, id, tenantId]
  );

  // Registra activity (require lazy pra evitar ciclo)
  if (updated && before && before.column_id !== columnId) {
    try {
      const { createActivity } = require('./activity.model');
      await createActivity(tenantId, {
        pipelineLeadId: id,
        type: 'status_change',
        metadata: {
          fromColumnId:   before.column_id,
          fromColumnName: before.column_name,
          toColumnId:     col.id,
          toColumnName:   col.name,
        },
        createdBy,
      });
    } catch (err) {
      console.warn('[WARN][pipeline:moveLead] activity falhou', { error: err.message });
    }
  }

  return updated;
}

/**
 * Importa em lote leads de uma list pra coluna 'start'.
 * Retorna { count, leads: [pipeline_leads] }.
 */
async function bulkImportFromList(tenantId, listId, leadIds, createdBy = null) {
  if (!Array.isArray(leadIds) || leadIds.length === 0) return { count: 0, leads: [] };
  console.log('[INFO][model:pipeline:bulkImportFromList]', { tenantId, listId, count: leadIds.length });

  // bootstrap colunas se ainda não houver nenhuma
  await bootstrapDefaultColumns(tenantId);
  const start = await getColumnByRole(tenantId, 'start');
  if (!start) throw new Error('Coluna de início não encontrada após bootstrap');

  const sourceLeads = await query(
    `SELECT * FROM comercial_leads
      WHERE tenant_id = $1 AND list_id = $2 AND id = ANY($3::text[])`,
    [tenantId, listId, leadIds]
  );

  const created = [];
  for (const src of sourceLeads) {
    const row = await createLead(
      tenantId,
      {
        lead_id: src.id,
        column_id: start.id,
        company_name:  src.company_name,
        phone:         src.phone,
        website:       src.website,
        instagram:     src.instagram_handle,
        niche:         src.niche,
        city:          src.city,
        state:         src.state,
        google_rating: src.google_rating,
        review_count:  src.review_count,
        sigma_score:   src.sigma_score,
      },
      createdBy
    );
    await markLeadAsImported(src.id, row.id);
    created.push(row);
  }

  console.log('[SUCESSO][model:pipeline:bulkImportFromList]', { count: created.length });
  return { count: created.length, leads: created };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // colunas
  getColumns,
  getColumnById,
  getColumnByRole,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
  bootstrapDefaultColumns,
  // leads
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  moveLead,
  bulkImportFromList,
};
