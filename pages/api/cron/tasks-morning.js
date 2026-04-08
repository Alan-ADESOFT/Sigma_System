/**
 * CRON: tasks-morning (8h BRT = 11h UTC)
 * Envia resumo matinal via WhatsApp para usuários com bot ativo.
 * Inclui tasks do dia + reuniões.
 * Protegido por x-internal-token.
 */
const { query } = require('../../../infra/db');
const { sendText } = require('../../../infra/api/zapi');

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

  console.log('[CRON][tasks-morning] Início');
  const today = getTodayBRT();
  const weekday = getWeekdayISO();
  let sentCount = 0;

  try {
    const tenants = await query(`SELECT id FROM tenants WHERE is_active = true`);

    for (const tenant of tenants) {
      // Get active bot configs
      const configs = await query(
        `SELECT tbc.*, t.name as user_name
         FROM task_bot_config tbc
         JOIN tenants t ON t.id = tbc.user_id
         WHERE tbc.tenant_id = $1 AND tbc.is_active = true`,
        [tenant.id]
      );

      for (const cfg of configs) {
        // Check if today is active day
        if (!cfg.active_days.includes(weekday)) continue;

        // Get user's tasks for today
        const tasks = await query(
          `SELECT ct.title, ct.priority, tc.name as category_name
           FROM client_tasks ct
           LEFT JOIN task_categories tc ON tc.id = ct.category_id
           WHERE ct.tenant_id = $1 AND ct.assigned_to = $2
             AND ct.due_date = $3 AND ct.status != 'done'
           ORDER BY ct.priority DESC, ct.created_at ASC`,
          [tenant.id, cfg.user_id, today]
        );

        // Get user's meetings for today
        const meetings = await query(
          `SELECT m.title, m.start_time, mc.company_name as client_name
           FROM meetings m
           LEFT JOIN marketing_clients mc ON mc.id = m.client_id
           WHERE m.tenant_id = $1 AND $2 = ANY(m.participants)
             AND m.meeting_date = $3 AND m.status = 'scheduled'
           ORDER BY m.start_time ASC`,
          [tenant.id, cfg.user_id, today]
        );

        if (tasks.length === 0 && meetings.length === 0) continue;

        // Build message
        const priorityEmoji = { urgente: '🔴', alta: '🟠', normal: '🔵', baixa: '⚪' };
        let msg = `🌅 *Bom dia, ${cfg.user_name}!*\n\n`;

        if (tasks.length > 0) {
          msg += `📋 *Suas tarefas de hoje:*\n`;
          for (const t of tasks) {
            const cat = t.category_name ? ` — _${t.category_name}_` : '';
            const pe = priorityEmoji[t.priority] || '🔵';
            msg += `${pe} *${t.title}*${cat}\n`;
          }
          msg += '\n';
        }

        if (meetings.length > 0) {
          msg += `📅 *Reuniões de hoje:*\n`;
          for (const m of meetings) {
            const time = m.start_time?.substring(0, 5) || '';
            const client = m.client_name ? ` com ${m.client_name}` : '';
            msg += `• *${m.title}* às *${time}*${client}\n`;
          }
          msg += '\n';
        }

        msg += 'Bora! 💪';

        try {
          await sendText(cfg.phone, msg);
          sentCount++;
        } catch (err) {
          console.error('[CRON][tasks-morning] Erro ao enviar para', cfg.user_name, err.message);
        }
      }

      // Send meeting reminders to client WhatsApp groups
      const meetingsWithGroups = await query(
        `SELECT m.title, m.start_time, m.minutes_url,
                mc.whatsapp_group_id, mc.company_name
         FROM meetings m
         JOIN marketing_clients mc ON mc.id = m.client_id
         WHERE m.tenant_id = $1 AND m.meeting_date = $2
           AND m.status = 'scheduled'
           AND mc.whatsapp_group_id IS NOT NULL`,
        [tenant.id, today]
      );

      for (const m of meetingsWithGroups) {
        const time = m.start_time?.substring(0, 5) || '';
        let groupMsg = `📅 *Lembrete de reunião*\n\n`;
        groupMsg += `*${m.title}* às *${time}*\n`;
        groupMsg += `Cliente: *${m.company_name}*\n`;
        if (m.minutes_url) {
          groupMsg += `\n📄 Ata disponível em: ${m.minutes_url}`;
        }

        try {
          await sendText(m.whatsapp_group_id, groupMsg);
        } catch (err) {
          console.error('[CRON][tasks-morning] Erro ao enviar para grupo', m.company_name, err.message);
        }
      }
    }

    console.log('[CRON][tasks-morning] Fim', { sentCount });
    return res.json({ success: true, sentCount });
  } catch (err) {
    console.error('[ERRO][CRON][tasks-morning]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
