const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { verifyToken } = require('../../../lib/auth');
const taskModel = require('../../../models/task.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;
  const token = req.cookies?.sigma_token;
  const session = verifyToken(token);
  const userId = session?.userId;

  try {
    if (req.method === 'GET') {
      const task = await taskModel.getTaskWithDetails(id, tenantId);
      if (!task) return res.status(404).json({ success: false, error: 'Task não encontrada' });
      return res.json({ success: true, task });
    }

    if (req.method === 'PUT') {
      const data = req.body;

      // Bloqueia datas anteriores a hoje
      if (data.due_date) {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (String(data.due_date) < todayStr) {
          return res.status(400).json({
            success: false,
            error: 'A data da tarefa não pode ser anterior a hoje',
          });
        }
      }

      // Check dependencies before marking done
      if (data.status === 'done') {
        const check = await taskModel.canCompleteTask(id, tenantId);
        if (!check.canComplete) {
          return res.status(400).json({
            success: false,
            error: 'Tarefa possui dependências pendentes',
            pendingDeps: check.pendingDeps,
          });
        }

        // Verifica subtarefas obrigatorias
        const { queryOne } = require('../../../infra/db');
        const current = await queryOne(
          `SELECT subtasks, subtasks_required FROM client_tasks WHERE id = $1 AND tenant_id = $2`,
          [id, tenantId]
        );
        if (current && current.subtasks_required) {
          const subs = Array.isArray(current.subtasks)
            ? current.subtasks
            : (current.subtasks ? JSON.parse(current.subtasks) : []);
          const allDone = subs.length > 0 && subs.every((s) => s.done);
          if (!allDone) {
            const total = subs.length;
            const done = subs.filter((s) => s.done).length;
            return res.status(400).json({
              success: false,
              error: total === 0
                ? 'Tarefa exige subtarefas — adicione e conclua todas antes de finalizar.'
                : `Conclua todas as subtarefas antes de finalizar (${done}/${total}).`,
            });
          }
        }
      }

      const task = await taskModel.updateTask(id, data, userId, tenantId);
      if (!task) return res.status(404).json({ success: false, error: 'Task não encontrada' });

      // If assigned_to changed, notify new assignee
      if (data.assigned_to && data.assigned_to !== userId) {
        try {
          const { createNotification } = require('../../../models/clientForm');
          await createNotification(
            data.assigned_to, 'task_assigned',
            'Task atribuída a você',
            `A task "${task.title}" foi atribuída a você`,
            task.client_id || null,
            { taskId: task.id }
          );
        } catch {}
      }

      // If completed, check if any task was blocked by this one and notify
      if (data.status === 'done') {
        try {
          const { query } = require('../../../infra/db');
          const { createNotification } = require('../../../models/clientForm');
          const blocked = await query(
            `SELECT DISTINCT ct.id, ct.title, ct.assigned_to
             FROM task_dependencies td
             JOIN client_tasks ct ON ct.id = td.task_id
             WHERE td.depends_on_id = $1 AND td.tenant_id = $2`,
            [id, tenantId]
          );
          for (const bt of blocked) {
            const canNow = await taskModel.canCompleteTask(bt.id, tenantId);
            if (canNow.canComplete && bt.assigned_to) {
              await createNotification(
                bt.assigned_to, 'task_dependency_resolved',
                'Dependência liberada',
                `A task "${bt.title}" pode ser iniciada agora`,
                null,
                { taskId: bt.id }
              );
            }
          }
        } catch {}
      }

      return res.json({ success: true, task });
    }

    if (req.method === 'DELETE') {
      const deleted = await taskModel.deleteTask(id, tenantId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Task não encontrada' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/tasks/[id]]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
