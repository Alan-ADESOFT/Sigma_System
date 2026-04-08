const { query, queryOne } = require('../infra/db');

// ─── Task Templates ────────────────────────────────────────────────────────

async function getTemplates(tenantId) {
  return query(
    `SELECT * FROM task_templates
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId]
  );
}

async function getTemplateById(id, tenantId) {
  return queryOne(
    `SELECT * FROM task_templates
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function createTemplate(data, tenantId) {
  const { name, trigger, tasks_json, is_active } = data;
  return queryOne(
    `INSERT INTO task_templates (tenant_id, name, trigger, tasks_json, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [tenantId, name, trigger, JSON.stringify(tasks_json), is_active ?? true]
  );
}

async function updateTemplate(id, data, tenantId) {
  const { name, trigger, tasks_json, is_active } = data;
  return queryOne(
    `UPDATE task_templates
     SET name      = COALESCE($3, name),
         trigger   = COALESCE($4, trigger),
         tasks_json = COALESCE($5, tasks_json),
         is_active  = COALESCE($6, is_active)
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [
      id,
      tenantId,
      name ?? null,
      trigger ?? null,
      tasks_json ? JSON.stringify(tasks_json) : null,
      is_active ?? null,
    ]
  );
}

async function deleteTemplate(id, tenantId) {
  return queryOne(
    `DELETE FROM task_templates
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );
}

async function applyTemplate(templateId, clientId, tenantId, createdBy) {
  const template = await getTemplateById(templateId, tenantId);
  if (!template) return null;

  const tasks = typeof template.tasks_json === 'string'
    ? JSON.parse(template.tasks_json)
    : template.tasks_json;

  const created = [];

  for (const task of tasks) {
    const subsJson = JSON.stringify(Array.isArray(task.subtasks) ? task.subtasks : []);
    const row = await queryOne(
      `INSERT INTO client_tasks
         (tenant_id, client_id, title, description, priority, due_date, assigned_to, created_by, status, subtasks)
       VALUES
         ($1, $2, $3, $4, $5, CURRENT_DATE + $6::integer, $7, $8, 'pending', $9::jsonb)
       RETURNING *`,
      [
        tenantId,
        clientId,
        task.title,
        task.description || null,
        task.priority || 'normal',
        task.due_days_offset || 0,
        task.assigned_to || null,
        createdBy,
        subsJson,
      ]
    );

    if (createdBy) {
      await query(
        `INSERT INTO task_activity_log (task_id, tenant_id, actor_id, action)
         VALUES ($1, $2, $3, 'created')`,
        [row.id, tenantId, createdBy]
      );
    }

    created.push(row);
  }

  return created;
}

module.exports = {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
};
