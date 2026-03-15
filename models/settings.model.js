const { query, queryOne } = require('../infra/db');

async function getSetting(tenantId, key) {
  const row = await queryOne(
    `SELECT value FROM settings WHERE tenant_id = $1 AND key = $2`,
    [tenantId, key]
  );
  return row?.value ?? null;
}

async function setSetting(tenantId, key, value) {
  await query(
    `INSERT INTO settings (tenant_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = $3`,
    [tenantId, key, value]
  );
}

async function deleteSetting(tenantId, key) {
  await query(`DELETE FROM settings WHERE tenant_id = $1 AND key = $2`, [tenantId, key]);
}

async function getAllSettings(tenantId) {
  return query(`SELECT key, value FROM settings WHERE tenant_id = $1`, [tenantId]);
}

module.exports = { getSetting, setSetting, deleteSetting, getAllSettings };
