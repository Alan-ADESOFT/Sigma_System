/**
 * CRON: tasks-overdue
 * 1. Marca tasks com due_date passada como 'overdue'
 * 2. Cria notificacao no sininho por usuario afetado
 * 3. Envia WhatsApp para cada usuario com bot ativo usando o template overdue
 *    (per-user > tenant global > hardcoded)
 *
 * @route POST /api/cron/tasks-overdue
 * @protection Header x-internal-token (INTERNAL_API_TOKEN)
 * @schedule Todo dia às 8h BRT → cron: 0 11 * * * (UTC)
 */
const { query, queryOne } = require('../../../infra/db');
const taskModel = require('../../../models/task.model');
const { sendText } = require('../../../infra/api/zapi');
const {
  resolveTemplate,
  renderTemplate,
  formatTaskList,
} = require('../../../models/taskBotMessages');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const internalToken = req.headers['x-internal-token'];
  if (internalToken !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  console.log('[CRON][tasks-overdue] Início');

  try {
    const tenants = await query(`SELECT id FROM tenants WHERE is_active = true`);
    let totalMarked = 0;
    let totalDispatched = 0;

    for (const tenant of tenants) {
      const marked = await taskModel.markOverdue(tenant.id);
      totalMarked += marked.length;

      // Agrupa por usuario responsavel
      const byUser = {};
      for (const t of marked) {
        const task = await queryOne(
          `SELECT ct.id, ct.title, ct.priority, ct.assigned_to,
                  tn.name AS user_name,
                  tc.name AS category_name
             FROM client_tasks ct
             LEFT JOIN tenants tn ON tn.id = ct.assigned_to
             LEFT JOIN task_categories tc ON tc.id = ct.category_id
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

      // Notificacao no sininho + envio WhatsApp
      const { createNotification } = require('../../../models/clientForm');
      for (const [userId, info] of Object.entries(byUser)) {
        const titles = info.tasks.map((t) => t.title);

        // 1) Sininho
        try {
          await createNotification(
            userId, 'task_overdue',
            'Tarefas vencidas',
            `Você tem ${titles.length} tarefa(s) vencida(s)`,
            null,
            { taskCount: titles.length, titles: titles.slice(0, 5) }
          );
        } catch {}

        // 2) WhatsApp — apenas se o usuario tem bot ativo configurado
        try {
          const botCfg = await queryOne(
            `SELECT * FROM task_bot_config
              WHERE tenant_id = $1 AND user_id = $2 AND is_active = true`,
            [tenant.id, userId]
          );
          if (botCfg && botCfg.phone) {
            const template = await resolveTemplate(botCfg, tenant.id, 'overdue');
            const msg = renderTemplate(template, {
              nome: info.name || 'usuário',
              tarefas: formatTaskList(info.tasks),
              count: info.tasks.length,
            });
            await sendText(botCfg.phone, msg);
            totalDispatched++;
          }
        } catch (err) {
          console.error('[CRON][tasks-overdue] WhatsApp falhou para', userId, err.message);
        }
      }
    }

    console.log('[CRON][tasks-overdue] Fim', { totalMarked, totalDispatched });
    return res.json({ success: true, totalMarked, totalDispatched });
  } catch (err) {
    console.error('[ERRO][CRON][tasks-overdue]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
