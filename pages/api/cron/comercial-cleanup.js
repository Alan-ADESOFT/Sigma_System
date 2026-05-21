/**
 * pages/api/cron/comercial-cleanup.js
 *   POST → roda runCleanupCycle (deleta listas expiradas).
 *
 * Protegido por header x-internal-token.
 */

const { runCleanupCycle } = require('../../../server/comercialCleanup');

const { verifyCronToken } = require('../../../lib/cron-auth');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use POST' });
  }

  if (!verifyCronToken(req)) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  try {
    console.log('[INFO][Cron:ComercialCleanup] iniciando');
    const result = await runCleanupCycle();
    console.log('[SUCESSO][Cron:ComercialCleanup]', result);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ERRO][Cron:ComercialCleanup]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
