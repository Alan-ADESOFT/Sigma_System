/**
 * models/financeCategory.model.js
 * CRUD de categorias financeiras por tenant.
 */

const { query, queryOne } = require('../infra/db');

async function getCategories(tenantId) {
  return query(
    `SELECT * FROM finance_categories
     WHERE tenant_id = $1
     ORDER BY type ASC, name ASC`,
    [tenantId]
  );
}

async function getCategoryById(id, tenantId) {
  return queryOne(
    `SELECT * FROM finance_categories WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function createCategory(tenantId, { name, type, color }) {
  return queryOne(
    `INSERT INTO finance_categories (tenant_id, name, type, color)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [tenantId, name, type || 'variable', color || '#6366F1']
  );
}

async function updateCategory(id, tenantId, { name, type, color }) {
  return queryOne(
    `UPDATE finance_categories SET
       name  = COALESCE($3, name),
       type  = COALESCE($4, type),
       color = COALESCE($5, color)
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [id, tenantId, name || null, type || null, color || null]
  );
}

async function deleteCategory(id, tenantId) {
  // Verifica se há registros vinculados
  const linked = await queryOne(
    `SELECT COUNT(*)::int AS count FROM company_finances
     WHERE category_id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (linked && linked.count > 0) {
    return { deleted: false, reason: `Existem ${linked.count} registros vinculados a esta categoria. Remova o vínculo antes de excluir.` };
  }
  await query(
    `DELETE FROM finance_categories WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return { deleted: true };
}

module.exports = { getCategories, getCategoryById, createCategory, updateCategory, deleteCategory };
