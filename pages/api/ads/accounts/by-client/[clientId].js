/**
 * pages/api/ads/accounts/by-client/[clientId].js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/ads/accounts/by-client/[clientId]  → conta vinculada (sem token)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../../infra/get-tenant-id');
const adsAccount = require('../../../../../models/ads/adsAccount.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Use GET' });

  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });

  try {
    const tenantId = await resolveTenantId(req);
    const row = await adsAccount.getByClient(tenantId, clientId);
    return res.json({ success: true, account: adsAccount.mapAccount(row) });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/accounts/by-client]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
