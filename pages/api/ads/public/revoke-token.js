/**
 * pages/api/ads/public/revoke-token.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/ads/public/revoke-token  body: { tokenId, reason? }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const adsPublicReport = require('../../../../models/ads/adsPublicReport.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });

  const { tokenId, reason } = req.body || {};
  if (!tokenId) return res.status(400).json({ success: false, error: 'tokenId obrigatório' });

  console.log('[INFO][API:/api/ads/public/revoke-token]', { tokenId });

  try {
    const tenantId = await resolveTenantId(req);
    const updated = await adsPublicReport.revoke(tenantId, tokenId, reason || null);
    if (!updated) return res.status(404).json({ success: false, error: 'Token não encontrado' });
    console.log('[SUCESSO][API:/api/ads/public/revoke-token]', { tokenId });
    return res.json({ success: true, token: adsPublicReport.mapToken(updated) });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/public/revoke-token]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
