/**
 * CRON: tasks-overdue
 * 1. Marca tasks com due_date passada como 'overdue'
 * 2. Cria notificação no sininho por usuário afetado
 *
 * IMPORTANTE: a partir da sprint Tasks v2 este cron NÃO envia mais WhatsApp.
 * Os lembretes via Z-API ficam concentrados em tasks-morning (8h) e
 * tasks-afternoon (16h) — dois lembretes por dia, sem terceiro envio extra.
 * O sininho continua disparando aqui pra a Atrasada virar evidente na UI assim
 * que o cron rodar de manhã.
 *
 * @route POST /api/cron/tasks-overdue
 * @protection Header x-internal-token (INTERNAL_API_TOKEN)
 * @schedule Todo dia às 8h BRT → cron: 0 11 * * * (UTC)
 */
const { query, queryOne } = require('../../../infra/db');
const taskModel = require('../../../models/task.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const internalToken = req.headers['x-internal-token'];
  if (internalToken !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  console.log('[INFO][CRON][tasks-overdue] Início');

  try {
    const workspaceId = process.env.WORKSPACE_TENANT_ID;
    if (!workspaceId) {
      console.error('[ERRO][CRON][tasks-overdue] WORKSPACE_TENANT_ID não configurado');
      return res.status(500).json({ success: false, error: 'WORKSPACE_TENANT_ID ausente' });
    }

    const marked = await taskModel.markOverdue(workspaceId);
    const totalMarked = marked.length;

    // Agrupa por usuário responsável (só pra contar e notificar sininho)
    const byUser = {};
    for (const t of marked) {
      const task = await queryOne(
        `SELECT ct.id, ct.title, ct.assigned_to,
                tn.name AS user_name
           FROM client_tasks ct
           LEFT JOIN tenants tn ON tn.id = ct.assigned_to
          WHERE ct.id = $1`,
        [t.id]
      );
      if (task?.assigned_to) {
        if (!byUser[task.assigned_to]) {
          byUser[task.assigned_to] = { name: task.user_name, tasks: [] };
        }
        byUser[task.assigned_to].tasks.push(task);
      }
    }

    // Notificação PESSOAL no sininho — cada user só vê suas próprias tasks
    // vencidas. (WhatsApp removido na sprint Tasks v2; agora só sininho +
    // crons morning/afternoon.)
    const { createUserNotification } = require('../../../models/clientForm');
    for (const [userId, info] of Object.entries(byUser)) {
      const titles = info.tasks.map((t) => t.title);
      try {
        await createUserNotification(
          userId, workspaceId, 'task_overdue',
          'Tarefas vencidas',
          `Você tem ${titles.length} tarefa(s) vencida(s)`,
          null,
          { taskCount: titles.length, titles: titles.slice(0, 5) }
        );
      } catch (err) {
        console.warn('[WARN][CRON][tasks-overdue] sininho falhou para', userId, err.message);
      }
    }

    console.log('[SUCESSO][CRON][tasks-overdue] Fim', { totalMarked, affectedUsers: Object.keys(byUser).length });
    return res.json({ success: true, totalMarked });
  } catch (err) {
    console.error('[ERRO][CRON][tasks-overdue]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
