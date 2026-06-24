/**
 * models/comercial/proposalExpiry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runner reusável: notifica 24h antes de propostas publicadas expirarem.
 * Usado pelo endpoint /api/cron/comercial-proposals-expiring (disparo externo)
 * E pelo scheduler in-process em server/instrumentation.js.
 *
 * Itera todos os tenants (single-workspace: um só, mas a query não filtra tenant).
 * Respeita o toggle comercial_notify_proposal_expiring por tenant e deduplica
 * por notificação já criada no mesmo dia.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');
const { createNotification } = require('../clientForm');
const { getSetting } = require('../settings.model');

async function notifyExpiringProposals() {
  console.log('[INFO][proposalExpiry:notifyExpiringProposals] iniciando');

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
      console.warn('[WARN][proposalExpiry] notification falhou', { error: err.message });
    }
  }

  console.log('[SUCESSO][proposalExpiry:notifyExpiringProposals]', { notified, total: rows.length });
  return { notified, total: rows.length };
}

module.exports = { notifyExpiringProposals };
