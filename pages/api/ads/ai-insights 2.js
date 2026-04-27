/**
 * pages/api/ads/ai-insights.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/ads/ai-insights
 *   body: { clientId, scope, targetId?, targetName?, datePreset?, timeRange? }
 *
 * Gera diagnóstico IA on-demand seguindo o framework de tráfego pago.
 * Persiste em ads_ai_reports.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const adsInsightsAI = require('../../../models/ads/adsInsightsAI');

const VALID_SCOPES = ['account', 'campaign', 'adset', 'ad'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });

  const { clientId, scope = 'account', targetId, targetName, datePreset, timeRange } = req.body || {};
  if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });
  if (!VALID_SCOPES.includes(scope)) {
    return res.status(400).json({ success: false, error: `scope inválido (${VALID_SCOPES.join('|')})` });
  }
  if (scope !== 'account' && !targetId) {
    return res.status(400).json({ success: false, error: 'targetId obrigatório para scope diferente de account' });
  }

  console.log('[INFO][API:/api/ads/ai-insights]', { clientId, scope, targetId });

  try {
    const tenantId = await resolveTenantId(req);
    const report = await adsInsightsAI.generateDiagnosis(tenantId, clientId, {
      scope, targetId, targetName,
      dateRange: { datePreset, timeRange },
    });
    console.log('[SUCESSO][API:/api/ads/ai-insights]', { reportId: report.id, tokens: report.tokensUsed });
    return res.json({ success: true, report });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/ai-insights]', { error: err.message, stack: err.stack });
    if (err.httpStatus) return res.status(err.httpStatus).json({ success: false, error: err.message, code: err.name });
    return res.status(500).json({ success: false, error: err.message });
  }
}
