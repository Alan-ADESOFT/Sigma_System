/**
 * pages/api/ads/breakdown.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/ads/breakdown  body: { clientId, breakdownType, datePreset?, timeRange? }
 *
 * breakdownType: age | gender | age_and_gender | publisher_platform | platform_position | region | device_platform
 *
 * Limitação Meta 2025: age/gender só funcionam nos últimos 13 meses.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const adsService = require('../../../models/ads/adsService');

const VALID_TYPES = ['age', 'gender', 'age_and_gender', 'publisher_platform', 'platform_position', 'region', 'device_platform'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });

  const { clientId, breakdownType, datePreset, timeRange } = req.body || {};
  if (!clientId || !breakdownType) {
    return res.status(400).json({ success: false, error: 'clientId e breakdownType obrigatórios' });
  }
  if (!VALID_TYPES.includes(breakdownType)) {
    return res.status(400).json({ success: false, error: `breakdownType inválido. Use um de: ${VALID_TYPES.join(', ')}` });
  }

  console.log('[INFO][API:/api/ads/breakdown]', { clientId, breakdownType });

  try {
    const tenantId = await resolveTenantId(req);
    const result = await adsService.fetchBreakdown(tenantId, clientId, breakdownType, { datePreset, timeRange });
    console.log('[SUCESSO][API:/api/ads/breakdown]', { rows: result.data.length });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/breakdown]', { error: err.message });
    if (err.httpStatus) return res.status(err.httpStatus).json({ success: false, error: err.message, code: err.name });
    if (err.message.includes('13 meses')) return res.status(400).json({ success: false, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
