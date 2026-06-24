/**
 * pages/api/cron/comercial-proposals-expiring.js
 *   POST → cria notificação 24h antes da proposta expirar.
 *   Protegido por header x-internal-token.
 *
 * Schedule sugerido: diariamente 08:00 BRT (= 11:00 UTC)
 */

const { verifyCronToken } = require('../../../lib/cron-auth');
const { notifyExpiringProposals } = require('../../../models/comercial/proposalExpiry');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use POST' });
  }
  if (!verifyCronToken(req)) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  try {
    const result = await notifyExpiringProposals();
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ERRO][Cron:ProposalsExpiring]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
