/**
 * CRON: tasks-overdue
 * Marca tasks com due_date passada como 'overdue'.
 * Pode rodar junto ao cron das 8h.
 * Protegido por x-internal-token.
 */
const { query } = require('../../../infra/db');
const taskModel = require('../../../models/task.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const internalToken = req.headers['x-internal-token'];
  if (internalToken !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  console.log('[CRON][tasks-overdue] Início');

  try {
    // Get all active tenants
    const tenants = await query(`SELECT id FROM tenants WHERE is_active = true`);
    let totalMarked = 0;

    for (const tenant of tenants) {
      const marked = await taskModel.markOverdue(tenant.id);
      totalMarked += marked.length;

      // Create notifications for overdue tasks
      if (marked.length > 0) {
        const { createNotification } = require('../../../models/clientForm');
        // Group by assigned_to
        const byUser = {};
        for (const t of marked) {
          // Get task details
          const task = await require('../../../infra/db').queryOne(
            `SELECT assigned_to, title FROM client_tasks WHERE id = $1`,
            [t.id]
          );
          if (task?.assigned_to) {
            if (!byUser[task.assigned_to]) byUser[task.assigned_to] = [];
            byUser[task.assigned_to].push(task.title);
          }
        }

        for (const [userId, titles] of Object.entries(byUser)) {
          try {
            await createNotification(
              userId, 'task_overdue',
              'Tasks vencidas',
              `Você tem ${titles.length} task(s) vencida(s)`,
              null,
              { taskCount: titles.length, titles: titles.slice(0, 5) }
            );
          } catch {}
        }
      }
    }

    console.log('[CRON][tasks-overdue] Fim', { totalMarked });
    return res.json({ success: true, totalMarked });
  } catch (err) {
    console.error('[ERRO][CRON][tasks-overdue]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
