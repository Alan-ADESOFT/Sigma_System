/**
 * pages/api/cron/comercial-proposals-expiring.js
 *   POST → cria notificação 24h antes da proposta expirar.
 *   Protegido por header x-internal-token.
 *
 * Schedule sugerido: diariamente 08:00 BRT (= 11:00 UTC)
 */

const { query, queryOne } = require('../../../infra/db');
const { createNotification } = require('../../../models/clientForm');
const { getSetting } = require('../../../models/settings.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use POST' });
  }
  const token = req.headers['x-internal-token'];
  if (!token || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  try {
    console.log('[INFO][Cron:ProposalsExpiring] iniciando');

    // Propostas published que expiram nas próximas 24h
    const rows = await query(
      `SELECT id, tenant_id, slug, data, expires_at
         FROM comercial_proposals
        WHERE status = 'published'
          AND expires_at IS NOT NULL
          AND expires_at >= now()
          AND expires_at <= now() + INTERVAL '24 hours'`
    );

    let notified = 0;
    for (const p of rows) {
      // Respeita toggle por tenant (default = true)
      const enabled = await getSetting(p.tenant_id, 'comercial_notify_proposal_expiring');
      if (enabled === 'false') continue;

      // Evita duplicar — checa se já criou notification HOJE pra essa proposta
      const todayISO = new Date().toISOString().slice(0, 10);
      const already = await queryOne(
        `SELECT 1 FROM system_notifications
          WHERE tenant_id = $1 AND type = 'proposal_expiring'
            AND metadata->>'proposalId' = $2
            AND created_at >= $3::date
          LIMIT 1`,
        [p.tenant_id, p.id, todayISO]
      ).catch(() => null);
      if (already) continue;

      const clientName = p.data?.client_name || 'cliente';
      try {
        await createNotification(
          p.tenant_id,
          'proposal_expiring',
          'Proposta expira em 24h',
          `Proposta de ${clientName} expira amanhã.`,
          null,
          { proposalId: p.id, slug: p.slug, expiresAt: p.expires_at }
        );
        notified++;
      } catch (err) {
        console.warn('[WARN][Cron:ProposalsExpiring] notification falhou', { error: err.message });
      }
    }

    console.log('[SUCESSO][Cron:ProposalsExpiring]', { notified, total: rows.length });
    return res.json({ success: true, notified, total: rows.length });
  } catch (err) {
    console.error('[ERRO][Cron:ProposalsExpiring]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
