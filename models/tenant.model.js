const { query, queryOne } = require('../infra/db');

async function getTenantById(id) {
  return queryOne(`SELECT * FROM tenants WHERE id = $1`, [id]);
}

async function getTenantByEmail(email) {
  return queryOne(`SELECT * FROM tenants WHERE email = $1`, [email.toLowerCase()]);
}

async function createTenant(name, email, password) {
  const row = await queryOne(
    `INSERT INTO tenants (name, email, password, role)
     VALUES ($1, $2, $3, 'admin')
     RETURNING *`,
    [name, email.toLowerCase(), password]
  );
  return row;
}

async function getOrCreateAdmin(email, name) {
  let tenant = await getTenantByEmail(email);
  if (!tenant) {
    tenant = await createTenant(name || 'Admin', email, null);
    console.log(`[Tenant] Admin criado: ${email}`);
  }
  return tenant;
}

async function getAllTenants() {
  return query(`SELECT id, name, email, role, is_active, created_at FROM tenants ORDER BY created_at DESC`);
}

module.exports = { getTenantById, getTenantByEmail, createTenant, getOrCreateAdmin, getAllTenants };
