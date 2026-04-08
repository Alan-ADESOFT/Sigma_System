const { query, queryOne } = require('../infra/db');

// ─── Tasks by tenant (with filters) ───────────────────────────────────────

async function getTasksByTenant(tenantId, filters = {}) {
  const { assignedTo, clientId, status, dateFrom, dateTo, view, userId, categoryId } = filters;

  const conditions = ['t.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (view === 'me' && userId) {
    conditions.push(`t.assigned_to = $${idx}`);
    params.push(userId);
    idx++;
  } else if (assignedTo) {
    conditions.push(`t.assigned_to = $${idx}`);
    params.push(assignedTo);
    idx++;
  }

  if (clientId) {
    conditions.push(`t.client_id = $${idx}`);
    params.push(clientId);
    idx++;
  }

  if (status) {
    conditions.push(`t.status = $${idx}`);
    params.push(status);
    idx++;
  }

  if (dateFrom) {
    conditions.push(`t.due_date >= $${idx}`);
    params.push(dateFrom);
    idx++;
  }

  if (dateTo) {
    conditions.push(`t.due_date <= $${idx}`);
    params.push(dateTo);
    idx++;
  }

  if (categoryId) {
    conditions.push(`t.category_id = $${idx}`);
    params.push(categoryId);
    idx++;
  }

  const sql = `
    SELECT t.*,
           tc.name  AS category_name,
           tc.color AS category_color,
           tn.name  AS assigned_to_name
      FROM client_tasks t
      LEFT JOIN task_categories tc ON tc.id = t.category_id
      LEFT JOIN tenants tn         ON tn.id = t.assigned_to
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`;

  return query(sql, params);
}

// ─── Tasks by client ───────────────────────────────────────────────────────

async function getTasksByClient(clientId, tenantId) {
  return query(
    `SELECT t.*,
            tc.name  AS category_name,
            tc.color AS category_color,
            tn.name  AS assigned_to_name
       FROM client_tasks t
       LEFT JOIN task_categories tc ON tc.id = t.category_id
       LEFT JOIN tenants tn         ON tn.id = t.assigned_to
      WHERE t.client_id = $1 AND t.tenant_id = $2
      ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`,
    [clientId, tenantId]
  );
}

// ─── Create task ───────────────────────────────────────────────────────────

async function createTask(data, tenantId) {
  const {
    title, description, client_id, assigned_to,
    priority, due_date, status, category_id,
    estimated_hours, created_by,
  } = data;

  const task = await queryOne(
    `INSERT INTO client_tasks
       (tenant_id, title, description, client_id, assigned_to,
        priority, due_date, status, category_id, estimated_hours, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      tenantId, title, description || null, client_id || null,
      assigned_to || null, priority || 'normal', due_date || null,
      status || 'pending', category_id || null,
      estimated_hours || null, created_by || null,
    ]
  );

  if (task && created_by) {
    await query(
      `INSERT INTO task_activity_log (task_id, tenant_id, actor_id, action)
       VALUES ($1, $2, $3, 'created')`,
      [task.id, tenantId, created_by]
    );
  }

  return task;
}

// ─── Update task ───────────────────────────────────────────────────────────

async function updateTask(id, data, actorId, tenantId) {
  const existing = await queryOne(
    `SELECT * FROM client_tasks WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!existing) return null;

  // Determine done flag based on status transition
  let done = existing.done;
  if (data.status && data.status !== existing.status) {
    if (data.status === 'done') done = true;
    else if (existing.status === 'done') done = false;
  }

  const updated = await queryOne(
    `UPDATE client_tasks
        SET title           = COALESCE($3, title),
            description     = COALESCE($4, description),
            client_id       = COALESCE($5, client_id),
            assigned_to     = COALESCE($6, assigned_to),
            priority        = COALESCE($7, priority),
            due_date        = COALESCE($8, due_date),
            status          = COALESCE($9, status),
            category_id     = COALESCE($10, category_id),
            estimated_hours = COALESCE($11, estimated_hours),
            done            = $12
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [
      id, tenantId,
      data.title || null, data.description || null,
      data.client_id || null, data.assigned_to || null,
      data.priority || null, data.due_date || null,
      data.status || null, data.category_id || null,
      data.estimated_hours || null, done,
    ]
  );

  // Track changes in activity log
  const tracked = [
    { field: 'status',      label: 'status' },
    { field: 'assigned_to', label: 'assigned_to' },
    { field: 'due_date',    label: 'due_date' },
    { field: 'priority',    label: 'priority' },
    { field: 'title',       label: 'title' },
  ];

  for (const { field, label } of tracked) {
    if (data[field] !== undefined && data[field] !== null) {
      const oldVal = existing[field] != null ? String(existing[field]) : null;
      const newVal = String(data[field]);
      if (oldVal !== newVal) {
        await query(
          `INSERT INTO task_activity_log
             (task_id, tenant_id, actor_id, action, old_value, new_value)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, tenantId, actorId, `changed_${label}`, oldVal, newVal]
        );
      }
    }
  }

  return updated;
}

// ─── Delete task ───────────────────────────────────────────────────────────

async function deleteTask(id, tenantId) {
  return queryOne(
    `DELETE FROM client_tasks WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId]
  );
}

// ─── Mark overdue ──────────────────────────────────────────────────────────

async function markOverdue(tenantId) {
  return query(
    `UPDATE client_tasks
        SET status = 'overdue'
      WHERE tenant_id = $1
        AND due_date < CURRENT_DATE
        AND status NOT IN ('done', 'overdue')
      RETURNING id`,
    [tenantId]
  );
}

// ─── Task with full details ────────────────────────────────────────────────

async function getTaskWithDetails(id, tenantId) {
  const task = await queryOne(
    `SELECT t.*,
            tc.name  AS category_name,
            tc.color AS category_color
       FROM client_tasks t
       LEFT JOIN task_categories tc ON tc.id = t.category_id
      WHERE t.id = $1 AND t.tenant_id = $2`,
    [id, tenantId]
  );
  if (!task) return null;

  const [comments, activity, dependencies] = await Promise.all([
    query(
      `SELECT c.*,
              tn.name       AS author_name,
              tn.avatar_url AS author_avatar_url
         FROM task_comments c
         LEFT JOIN tenants tn ON tn.id = c.author_id
        WHERE c.task_id = $1 AND c.tenant_id = $2
        ORDER BY c.created_at ASC`,
      [id, tenantId]
    ),
    query(
      `SELECT a.*,
              tn.name AS actor_name
         FROM task_activity_log a
         LEFT JOIN tenants tn ON tn.id = a.actor_id
        WHERE a.task_id = $1 AND a.tenant_id = $2
        ORDER BY a.created_at DESC`,
      [id, tenantId]
    ),
    query(
      `SELECT d.*,
              ct.title  AS depends_on_title,
              ct.status AS depends_on_status
         FROM task_dependencies d
         JOIN client_tasks ct ON ct.id = d.depends_on_id
        WHERE d.task_id = $1 AND d.tenant_id = $2`,
      [id, tenantId]
    ),
  ]);

  return { ...task, comments, activity, dependencies };
}

// ─── Dependencies ──────────────────────────────────────────────────────────

async function addDependency(taskId, dependsOnId, tenantId) {
  return queryOne(
    `INSERT INTO task_dependencies (task_id, depends_on_id, tenant_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [taskId, dependsOnId, tenantId]
  );
}

async function removeDependency(taskId, dependsOnId, tenantId) {
  return queryOne(
    `DELETE FROM task_dependencies
      WHERE task_id = $1 AND depends_on_id = $2 AND tenant_id = $3
      RETURNING id`,
    [taskId, dependsOnId, tenantId]
  );
}

// ─── Can complete (all deps done?) ─────────────────────────────────────────

async function canCompleteTask(taskId, tenantId) {
  const pending = await query(
    `SELECT ct.id, ct.title, ct.status
       FROM task_dependencies d
       JOIN client_tasks ct ON ct.id = d.depends_on_id
      WHERE d.task_id = $1 AND d.tenant_id = $2
        AND ct.status != 'done'`,
    [taskId, tenantId]
  );

  return {
    canComplete: pending.length === 0,
    pendingDeps: pending,
  };
}

// ─── Task counts by client ─────────────────────────────────────────────────

async function getTaskCountsByClient(clientId, tenantId) {
  const row = await queryOne(
    `SELECT
       COUNT(*)::int                          AS total,
       COUNT(*) FILTER (WHERE done = true)::int AS done
     FROM client_tasks
     WHERE client_id = $1 AND tenant_id = $2`,
    [clientId, tenantId]
  );
  return row || { total: 0, done: 0 };
}

module.exports = {
  getTasksByTenant,
  getTasksByClient,
  createTask,
  updateTask,
  deleteTask,
  markOverdue,
  getTaskWithDetails,
  addDependency,
  removeDependency,
  canCompleteTask,
  getTaskCountsByClient,
};
