/**
 * models/financeChargeLog.model.js
 * Log de cobranças enviadas — evita reenvio duplicado via UNIQUE constraint.
 */

const { query, queryOne } = require('../infra/db');

async function logCharge(tenantId, installmentId, clientId, stage, channel, success, errorMessage) {
  return queryOne(
    `INSERT INTO finance_charge_log (tenant_id, installment_id, client_id, stage, channel, success, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (installment_id, stage, channel) DO NOTHING
     RETURNING *`,
    [tenantId, installmentId, clientId, stage, channel, success, errorMessage || null]
  );
}

async function alreadySent(installmentId, stage, channel) {
  const row = await queryOne(
    `SELECT id FROM finance_charge_log
     WHERE installment_id = $1 AND stage = $2 AND channel = $3 AND success = true`,
    [installmentId, stage, channel]
  );
  return !!row;
}

async function getLogByTenant(tenantId, filters = {}) {
  let sql = `SELECT fcl.*, mc.company_name
             FROM finance_charge_log fcl
             JOIN marketing_clients mc ON mc.id = fcl.client_id
             WHERE fcl.tenant_id = $1`;
  const params = [tenantId];
  let idx = 2;

  if (filters.dateFrom) {
    sql += ` AND fcl.sent_at >= $${idx++}`;
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    sql += ` AND fcl.sent_at <= $${idx++}`;
    params.push(filters.dateTo);
  }
  if (filters.stage) {
    sql += ` AND fcl.stage = $${idx++}`;
    params.push(filters.stage);
  }

  sql += ' ORDER BY fcl.sent_at DESC LIMIT 200';
  return query(sql, params);
}

module.exports = { logCharge, alreadySent, getLogByTenant };
