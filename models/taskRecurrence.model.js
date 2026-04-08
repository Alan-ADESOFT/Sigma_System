/**
 * models/taskRecurrence.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD de tasks recorrentes. As recorrencias geram tasks reais por cron.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');

async function getRecurrences(tenantId) {
  return query(
    `SELECT r.*,
            tc.name AS category_name,
            tc.color AS category_color,
            tn.name AS assigned_to_name,
            mc.company_name AS client_name
       FROM task_recurrences r
       LEFT JOIN task_categories tc ON tc.id = r.category_id
       LEFT JOIN tenants tn ON tn.id = r.assigned_to
       LEFT JOIN marketing_clients mc ON mc.id = r.client_id
      WHERE r.tenant_id = $1
      ORDER BY r.created_at DESC`,
    [tenantId]
  );
}

async function getRecurrenceById(id, tenantId) {
  return queryOne(
    `SELECT * FROM task_recurrences WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

function normalizeSubtasks(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s) => s && (s.title || s.text))
    .map((s, i) => ({
      id: s.id || `sub_${Date.now()}_${i}`,
      title: String(s.title || s.text || '').trim(),
      done: Boolean(s.done),
    }));
}

async function createRecurrence(data, tenantId) {
  const {
    title, description, priority, category_id, assigned_to,
    client_id, frequency, weekday, day_of_month, is_active, created_by,
    subtasks, subtasks_required,
  } = data;

  const subtasksJson = JSON.stringify(normalizeSubtasks(subtasks));

  return queryOne(
    `INSERT INTO task_recurrences
       (tenant_id, title, description, priority, category_id, assigned_to,
        client_id, frequency, weekday, day_of_month, is_active, created_by,
        subtasks, subtasks_required)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
     RETURNING *`,
    [
      tenantId, title, description || null, priority || 'normal',
      category_id || null, assigned_to || null, client_id || null,
      frequency || 'weekly',
      weekday != null ? Number(weekday) : null,
      day_of_month != null ? Number(day_of_month) : null,
      is_active !== false, created_by || null,
      subtasksJson, Boolean(subtasks_required),
    ]
  );
}

async function updateRecurrence(id, data, tenantId) {
  const subtasksProvided = data.subtasks !== undefined;
  const subtasksJson = subtasksProvided ? JSON.stringify(normalizeSubtasks(data.subtasks)) : null;
  const subReqProvided = data.subtasks_required !== undefined;

  return queryOne(
    `UPDATE task_recurrences
        SET title             = COALESCE($3, title),
            description       = COALESCE($4, description),
            priority          = COALESCE($5, priority),
            category_id       = COALESCE($6, category_id),
            assigned_to       = COALESCE($7, assigned_to),
            client_id         = COALESCE($8, client_id),
            frequency         = COALESCE($9, frequency),
            weekday           = COALESCE($10, weekday),
            day_of_month      = COALESCE($11, day_of_month),
            is_active         = COALESCE($12, is_active),
            subtasks          = COALESCE($13::jsonb, subtasks),
            subtasks_required = COALESCE($14, subtasks_required)
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [
      id, tenantId,
      data.title ?? null, data.description ?? null,
      data.priority ?? null, data.category_id ?? null,
      data.assigned_to ?? null, data.client_id ?? null,
      data.frequency ?? null,
      data.weekday != null ? Number(data.weekday) : null,
      data.day_of_month != null ? Number(data.day_of_month) : null,
      data.is_active != null ? Boolean(data.is_active) : null,
      subtasksJson,
      subReqProvided ? Boolean(data.subtasks_required) : null,
    ]
  );
}

async function deleteRecurrence(id, tenantId) {
  return queryOne(
    `DELETE FROM task_recurrences WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId]
  );
}

/**
 * Para uso no cron diario: retorna todas as recorrencias que devem rodar HOJE
 * (frequency=daily, ou weekly+weekday=hoje, ou monthly+day_of_month=hoje).
 * Filtra last_run_at != hoje para evitar duplicatas.
 */
async function getDueToday(tenantId) {
  return query(
    `SELECT * FROM task_recurrences
      WHERE tenant_id = $1
        AND is_active = true
        AND (last_run_at IS NULL OR last_run_at < CURRENT_DATE)
        AND (
          frequency = 'daily'
          OR (frequency = 'weekly' AND weekday = EXTRACT(DOW FROM CURRENT_DATE))
          OR (frequency = 'monthly' AND day_of_month = EXTRACT(DAY FROM CURRENT_DATE))
        )`,
    [tenantId]
  );
}

async function markRunToday(id, tenantId) {
  return query(
    `UPDATE task_recurrences SET last_run_at = CURRENT_DATE
      WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

module.exports = {
  getRecurrences,
  getRecurrenceById,
  createRecurrence,
  updateRecurrence,
  deleteRecurrence,
  getDueToday,
  markRunToday,
};
