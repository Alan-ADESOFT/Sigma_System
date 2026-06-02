const { query, queryOne } = require('../infra/db');

// ─── Task Categories ───────────────────────────────────────────────────────

// Categorias fixas do workspace. Garantidas (idempotente) na leitura — não
// dá pra seedar no schema.sql porque o tenant_id é resolvido em runtime.
const DEFAULT_CATEGORIES = [
  { name: 'CLIENTES',      color: '#22c55e' },
  { name: 'OUTROS',        color: '#737373' },
  { name: 'COMERCIAL',     color: '#3b82f6' },
  { name: 'SISTEMA',       color: '#8b5cf6' },
  { name: 'FINANCEIRO',    color: '#f97316' },
  { name: 'CONTABILIDADE', color: '#06b6d4' },
];

/**
 * Garante que as 6 categorias fixas existam para o tenant. Idempotente via
 * UNIQUE(tenant_id, name) + ON CONFLICT DO NOTHING. Seguro chamar a cada leitura.
 */
async function ensureDefaultCategories(tenantId) {
  for (const c of DEFAULT_CATEGORIES) {
    await query(
      `INSERT INTO task_categories (tenant_id, name, color)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name) DO NOTHING`,
      [tenantId, c.name, c.color]
    );
  }
}

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
  ensureDefaultCategories,
  DEFAULT_CATEGORIES,
};
