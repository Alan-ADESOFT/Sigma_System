/**
 * CRON: tasks-afternoon (16h BRT = 19h UTC)
 * Envia lembrete de tasks não finalizadas do dia.
 * Protegido por x-internal-token.
 */
const { query } = require('../../../infra/db');
const { sendText } = require('../../../infra/api/zapi');
const {
  resolveTemplate,
  renderTemplate,
  formatTaskList,
} = require('../../../models/taskBotMessages');

function getTodayBRT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function getWeekdayISO() {
  const d = new Date();
  const brt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return brt.getDay() === 0 ? 7 : brt.getDay();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const internalToken = req.headers['x-internal-token'];
  if (internalToken !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  console.log('[CRON][tasks-afternoon] Início');
  const today = getTodayBRT();
  const weekday = getWeekdayISO();
  let sentCount = 0;

  try {
    const tenants = await query(`SELECT id FROM tenants WHERE is_active = true`);

    for (const tenant of tenants) {
      const configs = await query(
        `SELECT tbc.*, t.name as user_name
         FROM task_bot_config tbc
         JOIN tenants t ON t.id = tbc.user_id
         WHERE tbc.tenant_id = $1 AND tbc.is_active = true`,
        [tenant.id]
      );

      for (const cfg of configs) {
        if (!cfg.active_days.includes(weekday)) continue;

        const pending = await query(
          `SELECT ct.title, ct.priority
           FROM client_tasks ct
           WHERE ct.tenant_id = $1 AND ct.assigned_to = $2
             AND ct.due_date = $3 AND ct.status NOT IN ('done')
           ORDER BY ct.priority DESC`,
          [tenant.id, cfg.user_id, today]
        );

        if (pending.length === 0) continue;

        // Tarde reaproveita o template "overdue" — semanticamente é sobre tasks
        // pendentes que precisam de ação. Variáveis: {nome}, {tarefas}, {count}.
        const template = await resolveTemplate(cfg, tenant.id, 'overdue');
        const msg = renderTemplate(template, {
          nome: cfg.user_name || 'usuário',
          tarefas: formatTaskList(pending),
          count: pending.length,
        });

        try {
          await sendText(cfg.phone, msg);
          sentCount++;
        } catch (err) {
          console.error('[CRON][tasks-afternoon] Erro ao enviar para', cfg.user_name, err.message);
        }
      }
    }

    console.log('[CRON][tasks-afternoon] Fim', { sentCount });
    return res.json({ success: true, sentCount });
  } catch (err) {
    console.error('[ERRO][CRON][tasks-afternoon]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
