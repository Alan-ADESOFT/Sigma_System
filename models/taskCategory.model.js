const { query, queryOne } = require('../infra/db');

// ─── Task Categories ───────────────────────────────────────────────────────

async function getCategories(tenantId) {
  return query(
    `SELECT * FROM task_categories
     WHERE tenant_id = $1
     ORDER BY name ASC`,
    [tenantId]
  );
}

async function getCategoryById(id, tenantId) {
  return queryOne(
    `SELECT * FROM task_categories
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function createCategory(data, tenantId) {
  const { name, color } = data;
  return queryOne(
    `INSERT INTO task_categories (tenant_id, name, color)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [tenantId, name, color]
  );
}

async function updateCategory(id, data, tenantId) {
  const { name, color } = data;
  return queryOne(
    `UPDATE task_categories
     SET name  = COALESCE($3, name),
         color = COALESCE($4, color)
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId, name ?? null, color ?? null]
  );
}

async function deleteCategory(id, tenantId) {
  return queryOne(
    `DELETE FROM task_categories
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );
}

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
