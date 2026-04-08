const { query, queryOne } = require('../infra/db');

// ─── Task Bot Config ───────────────────────────────────────────────────────

async function getConfigs(tenantId) {
  return query(
    `SELECT tbc.*, t.name AS user_name
     FROM task_bot_config tbc
     LEFT JOIN tenants t ON t.id = tbc.user_id
     WHERE tbc.tenant_id = $1
     ORDER BY t.name ASC`,
    [tenantId]
  );
}

async function getConfigByUser(userId, tenantId) {
  return queryOne(
    `SELECT * FROM task_bot_config
     WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
}

async function upsertConfig(data, tenantId) {
  const {
    user_id, phone, dispatch_time, active_days,
    message_morning, message_overdue, is_active,
  } = data;

  return queryOne(
    `INSERT INTO task_bot_config
       (tenant_id, user_id, phone, dispatch_time, active_days,
        message_morning, message_overdue, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tenant_id, user_id) DO UPDATE
     SET phone            = EXCLUDED.phone,
         dispatch_time    = EXCLUDED.dispatch_time,
         active_days      = EXCLUDED.active_days,
         message_morning  = EXCLUDED.message_morning,
         message_overdue  = EXCLUDED.message_overdue,
         is_active        = EXCLUDED.is_active
     RETURNING *`,
    [
      tenantId,
      user_id,
      phone,
      dispatch_time,
      active_days,
      message_morning || null,
      message_overdue || null,
      is_active ?? true,
    ]
  );
}

async function deleteConfig(userId, tenantId) {
  return queryOne(
    `DELETE FROM task_bot_config
     WHERE user_id = $1 AND tenant_id = $2
     RETURNING id`,
    [userId, tenantId]
  );
}

async function getActiveConfigs(tenantId) {
  return query(
    `SELECT tbc.*, t.name AS user_name, t.username
     FROM task_bot_config tbc
     LEFT JOIN tenants t ON t.id = tbc.user_id
     WHERE tbc.tenant_id = $1 AND tbc.is_active = true`,
    [tenantId]
  );
}

module.exports = {
  getConfigs,
  getConfigByUser,
  upsertConfig,
  deleteConfig,
  getActiveConfigs,
};
