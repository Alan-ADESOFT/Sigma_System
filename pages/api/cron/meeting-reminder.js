/**
 * CRON: meeting-reminder
 * ─────────────────────────────────────────────────────────────────────────────
 * Lembra o TIME (números/grupos configurados em Config. Tarefas → seção /reuniao)
 * cerca de 1h antes de cada reunião — interna ou com cliente.
 *
 * Idempotente: marca meetings.reminder_sent_at após enviar, pra não repetir a
 * cada ciclo. Janela de 45-75 min no fuso BRT (getMeetingsForReminder).
 *
 * Recomendado rodar a cada 15 minutos (cron de 15 em 15 min) no seu agendador
 * externo, com header x-internal-token (INTERNAL_API_TOKEN).
 *
 * @route POST /api/cron/meeting-reminder
 * ─────────────────────────────────────────────────────────────────────────────
 */
const { query } = require('../../../infra/db');
const meetingModel = require('../../../models/meeting.model');
const { getReuniaoConfig } = require('../../../models/reuniaoBotConfig.model');
const { sendText } = require('../../../infra/api/zapi');
const { verifyCronToken } = require('../../../lib/cron-auth');

function fmtDate(d) {
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido' });
  if (!verifyCronToken(req)) return res.status(401).json({ success: false, error: 'Token inválido' });

  console.log('[CRON][meeting-reminder] Início');
  let totalSent = 0;
  const perTenant = {};

  try {
    const tenants = await query(`SELECT id FROM tenants WHERE is_active = true`);

    for (const tenant of tenants) {
      try {
        const cfg = await getReuniaoConfig(tenant.id);
        if (!cfg.reminderEnabled) continue;

        const recipients = [...(cfg.allowedNumbers || []), ...(cfg.allowedGroups || [])];
        if (recipients.length === 0) continue;

        const meetings = await meetingModel.getMeetingsForReminder(tenant.id);
        for (const m of meetings) {
          const hora = String(m.start_time || '').slice(0, 5);
          const linhaCliente = m.client_name ? `\nCliente: *${m.client_name}*` : '';
          const parts = Array.isArray(m.participants) ? m.participants.filter(Boolean) : [];
          const linhaEnv = parts.length ? `\nEnvolvidos: ${parts.join(', ')}` : '';
          const msg = `⏰ *Lembrete: reunião em ~1h*\n\n*${m.title}*\n${fmtDate(m.meeting_date)} às ${hora}${linhaCliente}${linhaEnv}`;

          for (const to of recipients) {
            try {
              await sendText(to, msg, { delayTyping: 1 });
            } catch (err) {
              console.error('[CRON][meeting-reminder] Falha no envio', { meetingId: m.id, to: String(to).slice(-4), error: err.message });
            }
          }

          // Marca como enviado mesmo se algum destinatário falhar — evita spam a cada ciclo.
          await meetingModel.markReminderSent(m.id, tenant.id);
          totalSent++;
          perTenant[tenant.id] = (perTenant[tenant.id] || 0) + 1;
        }
      } catch (err) {
        console.error('[CRON][meeting-reminder] Falha no tenant', { tenantId: tenant.id, error: err.message });
      }
    }

    console.log('[CRON][meeting-reminder] Fim', { totalSent, perTenant });
    return res.json({ success: true, totalSent, perTenant });
  } catch (err) {
    console.error('[ERRO][CRON][meeting-reminder]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
