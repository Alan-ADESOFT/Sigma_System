/**
 * models/tenant.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD de tenants (usuários-administradores da plataforma).
 * Cada tenant possui seus próprios dados isolados (contas, conteúdos, etc).
 *
 * Tabela: tenants
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');

// ─── Leitura ─────────────────────────────────────────────────────────────────

/**
 * Busca um tenant pelo id interno.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getTenantById(id) {
  return queryOne(`SELECT * FROM tenants WHERE id = $1`, [id]);
}

/**
 * Busca um tenant pelo email (case-insensitive).
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
async function getTenantByEmail(email) {
  return queryOne(`SELECT * FROM tenants WHERE email = $1`, [email.toLowerCase()]);
}

/**
 * Lista todos os tenants (sem o campo password) — uso administrativo.
 * @returns {Promise<Array>}
 */
async function getAllTenants() {
  return query(`SELECT id, name, email, role, is_active, created_at FROM tenants ORDER BY created_at DESC`);
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Cria um novo tenant com role 'admin'.
 * @param {string} name
 * @param {string} email
 * @param {string|null} password - Hash bcrypt ou null (OAuth)
 * @returns {Promise<Object>} Tenant criado
 */
async function createTenant(name, email, password) {
  const row = await queryOne(
    `INSERT INTO tenants (name, email, password, role)
     VALUES ($1, $2, $3, 'admin')
     RETURNING *`,
    [name, email.toLowerCase(), password]
  );
  return row;
}

/**
 * Busca tenant por email; se não existir, cria automaticamente.
 * Usado no fluxo de login OAuth onde o primeiro acesso cria a conta.
 * @param {string} email
 * @param {string} [name] - Nome do usuário (fallback: 'Admin')
 * @returns {Promise<Object>} Tenant existente ou recém-criado
 */
async function getOrCreateAdmin(email, name) {
  let tenant = await getTenantByEmail(email);
  if (!tenant) {
    tenant = await createTenant(name || 'Admin', email, null);
    console.log(`[Tenant] Admin criado: ${email}`);
  }
  return tenant;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { getTenantById, getTenantByEmail, createTenant, getOrCreateAdmin, getAllTenants };
