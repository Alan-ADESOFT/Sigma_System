const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { verifyToken } = require('../../../lib/auth');
const taskModel = require('../../../models/task.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    // Resolve userId from cookie
    const token = req.cookies?.sigma_token;
    const session = verifyToken(token);
    const userId = session?.userId;

    if (req.method === 'GET') {
      const { view, status, clientId, assignedTo, dateFrom, dateTo, categoryId } = req.query;
      const tasks = await taskModel.getTasksByTenant(tenantId, {
        view: view || 'me',
        userId,
        status,
        clientId,
        assignedTo,
        dateFrom,
        dateTo,
        categoryId,
      });
      return res.json({ success: true, tasks });
    }

    if (req.method === 'POST') {
      const { title, description, client_id, assigned_to, priority, due_date, status, category_id, estimated_hours, subtasks, dependsOn } = req.body;
      if (!title) {
        return res.status(400).json({ success: false, error: 'Título obrigatório' });
      }

      const task = await taskModel.createTask({
        title,
        description,
        client_id,
        assigned_to,
        priority: priority || 'normal',
        due_date,
        status: status || 'pending',
        category_id,
        estimated_hours,
        created_by: userId,
      }, tenantId);

      // Add dependencies if provided
      if (dependsOn && Array.isArray(dependsOn)) {
        for (const depId of dependsOn) {
          await taskModel.addDependency(task.id, depId, tenantId);
        }
      }

      // Notification: task assigned
      if (assigned_to && assigned_to !== userId) {
        try {
          const { createNotification } = require('../../../models/clientForm');
          await createNotification(
            assigned_to, 'task_assigned',
            'Nova task atribuída',
            `A task "${title}" foi atribuída a você`,
            client_id || null,
            { taskId: task.id }
          );
        } catch {}
      }

      return res.status(201).json({ success: true, task });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/tasks]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
