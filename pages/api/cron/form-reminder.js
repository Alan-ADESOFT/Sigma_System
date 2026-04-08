/**
 * @fileoverview Cron: Lembrete de formulário via WhatsApp
 * @route POST /api/cron/form-reminder
 *
 * Verifica clientes que receberam o link do formulário mas não preencheram
 * em 5 dias e envia lembrete via Z-API (WhatsApp).
 *
 * Protegido com INTERNAL_API_TOKEN — não acessível publicamente.
 * Chamado por cron externo (ex: Vercel Cron, GitHub Actions, cURL manual).
 */

import { query, queryOne } from '../../../infra/db';
const { sendText } = require('../../../infra/api/zapi');
const { getSetting } = require('../../../models/settings.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  // Autenticação via token interno
  const token = req.headers['x-internal-token'];
  if (!token || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  try {
    console.log('[INFO][Cron:FormReminder] Verificando tokens pendentes para lembrete...');

    // Busca tokens pending criados há 5+ dias, link ainda válido,
    // cliente sem form_done e sem lembrete já enviado
    const pendingTokens = await query(
      `SELECT cft.id AS token_id, cft.token, cft.client_id, cft.tenant_id,
              mc.company_name, mc.phone
       FROM client_form_tokens cft
       JOIN marketing_clients mc ON mc.id = cft.client_id
       WHERE cft.status = 'pending'
         AND cft.created_at < now() - INTERVAL '5 days'
         AND cft.expires_at > now()
         AND mc.form_done = false
         AND mc.phone IS NOT NULL
         AND mc.phone != ''
         AND NOT COALESCE((cft.metadata->>'reminder_sent')::boolean, false)`
    );

    console.log('[INFO][Cron:FormReminder] Tokens encontrados para lembrete', { count: pendingTokens.length });

    let sent = 0;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

    for (const row of pendingTokens) {
      try {
        const formLink = `${baseUrl}/form/${row.token}`;

        const DEFAULT_REMINDER = `Oi, *{CLIENTE}*! 👋\n\nVimos que o seu formulário ainda está esperando por você.\nLeva apenas 25 minutos e faz toda a diferença na estratégia que vamos construir juntos.\n\nSeu link ainda está válido:\n👉 {LINK}\n\nSe tiver qualquer dificuldade, é só me chamar. 😊`;
        const template = (await getSetting(row.tenant_id, 'jarvis_msg_form_reminder')) || DEFAULT_REMINDER;
        const message = template
          .replace(/\{LINK\}/gi, formLink)
          .replace(/\{CLIENTE\}/gi, row.company_name || 'cliente');

        await sendText(row.phone, message, { delayTyping: 3 });

        // Marca como reminder_sent no metadata do token
        await queryOne(
          `UPDATE client_form_tokens
           SET metadata = COALESCE(metadata, '{}') || $1::jsonb
           WHERE id = $2`,
          [JSON.stringify({ reminder_sent: true, reminder_at: new Date().toISOString() }), row.token_id]
        );

        sent++;
        console.log('[SUCESSO][Cron:FormReminder] Lembrete enviado', { clientId: row.client_id, company: row.company_name });

      } catch (err) {
        console.error('[ERRO][Cron:FormReminder] Falha ao enviar lembrete', {
          clientId: row.client_id,
          company: row.company_name,
          error: err.message,
        });
      }
    }

    console.log('[SUCESSO][Cron:FormReminder] Concluído', { total: pendingTokens.length, sent });
    return res.json({ success: true, reminders_sent: sent, total_checked: pendingTokens.length });

  } catch (err) {
    console.error('[ERRO][Cron:FormReminder] Erro geral', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
