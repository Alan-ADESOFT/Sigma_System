/**
 * pages/api/ads/public/report.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/ads/public/report
 *   body: { token, datePreset? }
 *
 * PÚBLICO: o tenantId/clientId vem do TOKEN, NÃO do header.
 * NÃO retorna nada sensível — apenas dados read-only do dashboard.
 * Incrementa views_count + last_viewed_ip.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const adsPublicReport = require('../../../../models/ads/adsPublicReport.model');
const adsService = require('../../../../models/ads/adsService');

function clientIpFromReq(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });

  const { token, datePreset } = req.body || {};
  if (!token) return res.status(400).json({ success: false, error: 'token obrigatório' });

  try {
    const { valid, reason, tokenData } = await adsPublicReport.validateToken(token);
    if (!valid) return res.status(403).json({ success: false, error: `token_${reason}` });

    const tenantId = tokenData.tenant_id;
    const clientId = tokenData.client_id;
    const config = tokenData.config || {};

    const effectiveDatePreset = datePreset || config.defaultDateRange || 'last_30d';
    const range = adsService.resolveRange({ datePreset: effectiveDatePreset });
    const previous = adsService.previousRange(range);

    // Coleta paralela com tenantId/clientId DO TOKEN
    const [currentKpi, prevKpi, timeline, hierarchy] = await Promise.all([
      adsService.fetchAccountKPIs(tenantId, clientId, { timeRange: range.timeRange }),
      adsService.fetchAccountKPIs(tenantId, clientId, { timeRange: previous }),
      adsService.fetchTimeline(tenantId, clientId, { timeRange: range.timeRange }),
      config.showCampaignList
        ? adsService.fetchCampaignsHierarchy(tenantId, clientId, { timeRange: range.timeRange })
        : Promise.resolve({ campaigns: [] }),
    ]);

    const comparison = adsService.computeComparison(currentKpi.summary, prevKpi.summary);

    // Tracking de view (silencioso)
    try {
      await adsPublicReport.incrementView(tokenData.id, clientIpFromReq(req));
    } catch (e) {
      console.warn('[WARN][AdsPublicReport] incrementView falhou:', e.message);
    }

    // Resposta intencionalmente sem token, sem account ID, sem config interno
    return res.json({
      success: true,
      client: {
        companyName: tokenData.company_name,
        logoUrl: tokenData.logo_url,
      },
      range,
      kpiSummary: currentKpi.summary,
      comparison,
      timeline: config.showChart !== false ? timeline.timeline : [],
      campaigns: config.showCampaignList
        ? hierarchy.campaigns.map((c) => ({
            id: c.id,
            name: c.name,
            objective: c.objective,
            effective_status: c.effective_status,
            insights: c.insights,
          }))
        : [],
      config: {
        showCampaignList: !!config.showCampaignList,
        showChart: config.showChart !== false,
        allowExport: !!config.allowExport,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/public/report]', { error: err.message });
    if (err.httpStatus) return res.status(err.httpStatus).json({ success: false, error: err.message, code: err.name });
    return res.status(500).json({ success: false, error: err.message });
  }
}
