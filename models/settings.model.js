/**
 * models/settings.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Key-value store de configurações por tenant.
 * Cada tenant pode ter N chaves (ex: "ai_model", "timezone", "language").
 *
 * Tabela: settings  (unique: tenant_id + key)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');

/**
 * Retorna o valor de uma chave de configuração do tenant.
 * @param {string} tenantId
 * @param {string} key - Nome da configuração
 * @returns {Promise<string|null>} Valor ou null se não existir
 */
async function getSetting(tenantId, key) {
  const row = await queryOne(
    `SELECT value FROM settings WHERE tenant_id = $1 AND key = $2`,
    [tenantId, key]
  );
  return row?.value ?? null;
}

/**
 * Cria ou atualiza uma configuração (upsert por tenant_id + key).
 * @param {string} tenantId
 * @param {string} key
 * @param {string} value
 */
async function setSetting(tenantId, key, value) {
  await query(
    `INSERT INTO settings (tenant_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = $3`,
    [tenantId, key, value]
  );
}

/**
 * Remove uma configuração do tenant.
 * @param {string} tenantId
 * @param {string} key
 */
async function deleteSetting(tenantId, key) {
  await query(`DELETE FROM settings WHERE tenant_id = $1 AND key = $2`, [tenantId, key]);
}

/**
 * Retorna todas as configurações do tenant como array de { key, value }.
 * @param {string} tenantId
 * @returns {Promise<Array<{key: string, value: string}>>}
 */
async function getAllSettings(tenantId) {
  return query(`SELECT key, value FROM settings WHERE tenant_id = $1`, [tenantId]);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { getSetting, setSetting, deleteSetting, getAllSettings };
