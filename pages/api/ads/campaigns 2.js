/**
 * pages/api/ads/campaigns.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/ads/campaigns  body: { clientId, datePreset?, timeRange?, includeSets?, includeAds?, statusFilter? }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const adsService = require('../../../models/ads/adsService');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });

  const { clientId, datePreset, timeRange, includeSets, includeAds, statusFilter } = req.body || {};
  if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });

  console.log('[INFO][API:/api/ads/campaigns]', { clientId, datePreset, includeSets, includeAds });

  try {
    const tenantId = await resolveTenantId(req);
    const result = await adsService.fetchCampaignsHierarchy(tenantId, clientId, {
      datePreset, timeRange,
    }, {
      includeSets: !!includeSets,
      includeAds: !!includeAds,
      statusFilter: Array.isArray(statusFilter) ? statusFilter : null,
    });
    console.log('[SUCESSO][API:/api/ads/campaigns]', { count: result.campaigns.length });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/campaigns]', { error: err.message });
    if (err.httpStatus) return res.status(err.httpStatus).json({ success: false, error: err.message, code: err.name });
    return res.status(500).json({ success: false, error: err.message });
  }
}
