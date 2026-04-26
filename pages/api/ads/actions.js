/**
 * pages/api/ads/actions.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/ads/actions
 *   body: { clientId, action, level, targetId, status?, dailyBudget?, lifetimeBudget? }
 *
 * action: 'pause' | 'resume' | 'update_budget'
 * level:  'campaign' | 'adset' | 'ad'
 *
 * Após sucesso: invalida cache do cliente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const adsService = require('../../../models/ads/adsService');

const VALID_ACTIONS = ['pause', 'resume', 'update_budget'];
const VALID_LEVELS = ['campaign', 'adset', 'ad'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });

  const { clientId, action, level, targetId, dailyBudget, lifetimeBudget } = req.body || {};
  if (!clientId || !action || !level || !targetId) {
    return res.status(400).json({ success: false, error: 'clientId, action, level e targetId obrigatórios' });
  }
  if (!VALID_ACTIONS.includes(action)) return res.status(400).json({ success: false, error: `action inválida (${VALID_ACTIONS.join('|')})` });
  if (!VALID_LEVELS.includes(level))   return res.status(400).json({ success: false, error: `level inválido (${VALID_LEVELS.join('|')})` });

  console.log('[INFO][API:/api/ads/actions]', { clientId, action, level, targetId });

  try {
    const tenantId = await resolveTenantId(req);
    let ok = false;

    if (action === 'pause')  ok = await adsService.pauseObject(tenantId, clientId, targetId, level);
    if (action === 'resume') ok = await adsService.resumeObject(tenantId, clientId, targetId, level);
    if (action === 'update_budget') {
      if (dailyBudget == null && lifetimeBudget == null) {
        return res.status(400).json({ success: false, error: 'dailyBudget ou lifetimeBudget obrigatório para update_budget' });
      }
      ok = await adsService.updateBudget(tenantId, clientId, targetId, level, dailyBudget, lifetimeBudget);
    }

    console.log('[SUCESSO][API:/api/ads/actions]', { ok });
    return res.json({ success: ok });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/actions]', { error: err.message });
    if (err.httpStatus) return res.status(err.httpStatus).json({ success: false, error: err.message, code: err.name });
    return res.status(500).json({ success: false, error: err.message });
  }
}
