/**
 * pages/api/ads/public/list-tokens.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/ads/public/list-tokens                  → todos do tenant
 * @route GET /api/ads/public/list-tokens?clientId=X       → só de um cliente
 *
 * Cada token vem enriquecido com `companyName`, `logoUrl` e `effectiveStatus`
 * (active | expired | revoked) já calculado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const adsPublicReport = require('../../../../models/ads/adsPublicReport.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Use GET' });

  const { clientId } = req.query;

  try {
    const tenantId = await resolveTenantId(req);
    const raw = clientId
      ? await adsPublicReport.listByClient(tenantId, clientId)
      : await adsPublicReport.listAll(tenantId);

    const now = new Date();
    const tokens = raw.map((t) => ({
      ...t,
      effectiveStatus:
        t.status === 'revoked' ? 'revoked'
        : (t.expiresAt && new Date(t.expiresAt) <= now) ? 'expired'
        : t.status,
    }));
    return res.json({ success: true, tokens });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/public/list-tokens]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
