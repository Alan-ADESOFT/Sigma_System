/**
 * pages/api/ads/dashboard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/ads/dashboard  body: { clientId, datePreset?, timeRange? }
 *
 * Retorna { kpiSummary, comparison, timeline, topCampaigns, bottomCampaigns, anomalies }.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const adsService = require('../../../models/ads/adsService');
const adsAnomalies = require('../../../models/ads/adsAnomalies');

function mapTypedError(err, res) {
  if (err.httpStatus) return res.status(err.httpStatus).json({ success: false, error: err.message, code: err.name });
  return res.status(500).json({ success: false, error: err.message });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });

  const { clientId, datePreset, timeRange } = req.body || {};
  if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });

  console.log('[INFO][API:/api/ads/dashboard]', { clientId, datePreset });

  try {
    const tenantId = await resolveTenantId(req);
    const range = adsService.resolveRange({ datePreset, timeRange });
    const previous = adsService.previousRange(range);

    const [currentKpi, prevKpi, timeline, hierarchy, anomalies] = await Promise.all([
      adsService.fetchAccountKPIs(tenantId, clientId, { timeRange: range.timeRange }),
      adsService.fetchAccountKPIs(tenantId, clientId, { timeRange: previous }),
      adsService.fetchTimeline(tenantId, clientId, { timeRange: range.timeRange }),
      adsService.fetchCampaignsHierarchy(tenantId, clientId, { timeRange: range.timeRange }),
      adsAnomalies.getOpenAnomalies(tenantId, clientId),
    ]);

    const comparison = adsService.computeComparison(currentKpi.summary, prevKpi.summary);
    const sortedByRoas = [...hierarchy.campaigns]
      .filter((c) => c.insights)
      .sort((a, b) =>
        parseFloat(b.insights?.purchase_roas?.[0]?.value || 0) -
        parseFloat(a.insights?.purchase_roas?.[0]?.value || 0)
      );
    const topCampaigns = sortedByRoas.slice(0, 3);
    const bottomCampaigns = sortedByRoas.slice(-3).reverse();

    console.log('[SUCESSO][API:/api/ads/dashboard]', { clientId, campaigns: hierarchy.campaigns.length });
    return res.json({
      success: true,
      range,
      kpiSummary: currentKpi.summary,
      previousKpi: prevKpi.summary,
      comparison,
      timeline: timeline.timeline,
      topCampaigns,
      bottomCampaigns,
      anomalies,
    });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/dashboard]', { error: err.message });
    return mapTypedError(err, res);
  }
}
