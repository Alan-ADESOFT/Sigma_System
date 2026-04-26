/**
 * pages/api/ads/ai-reports.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/ads/ai-reports?clientId=X&limit=Y    → lista (sem diagnosis)
 * @route GET /api/ads/ai-reports?id=X                  → detalhe
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const adsInsightsAI = require('../../../models/ads/adsInsightsAI');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Use GET' });

  const { id, clientId, limit } = req.query;

  console.log('[INFO][API:/api/ads/ai-reports]', { id, clientId });

  try {
    const tenantId = await resolveTenantId(req);

    if (id) {
      const report = await adsInsightsAI.getReportById(tenantId, id);
      if (!report) return res.status(404).json({ success: false, error: 'Relatório não encontrado' });
      return res.json({ success: true, report });
    }

    if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório quando id ausente' });

    const reports = await adsInsightsAI.listReports(tenantId, clientId, {
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return res.json({ success: true, reports });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/ai-reports]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
