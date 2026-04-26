/**
 * pages/api/ads/accounts/health-check.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/ads/accounts/health-check  body: { clientId }
 *
 * Força refresh do health_status da conta de Ads do cliente.
 * Estados possíveis: healthy | expiring_soon | expired | invalid | unknown
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const metaAds = require('../../../../infra/api/metaAds');
const adsAccount = require('../../../../models/ads/adsAccount.model');
const { getSetting } = require('../../../../models/settings.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });

  const { clientId } = req.body || {};
  if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });

  console.log('[INFO][API:/api/ads/accounts/health-check]', { clientId });

  try {
    const tenantId = await resolveTenantId(req);
    const row = await adsAccount.getByClient(tenantId, clientId);
    if (!row) return res.status(404).json({ success: false, error: 'Conta não encontrada' });

    const account = adsAccount.mapAccountWithToken(row);
    const refreshDays = parseInt(await getSetting(tenantId, 'ads_token_refresh_days_ahead'), 10) || 15;

    let status = 'unknown';
    let error = null;

    try {
      const debug = await metaAds.debugToken(account.accessToken);
      if (!debug.isValid) {
        status = 'invalid';
        error = debug.error?.message || 'Token marcado como inválido';
      } else if (debug.expiresAt) {
        const daysLeft = (new Date(debug.expiresAt) - Date.now()) / 86400000;
        if (daysLeft <= 0) status = 'expired';
        else if (daysLeft <= refreshDays) status = 'expiring_soon';
        else status = 'healthy';
      } else {
        status = 'healthy'; // system_user / sem expiração
      }
    } catch (e) {
      if (e.name === 'TokenInvalidError') {
        status = 'invalid';
        error = e.message;
      } else {
        status = 'unknown';
        error = e.message;
      }
    }

    const updated = await adsAccount.updateHealth(account.id, status, error);
    console.log('[SUCESSO][API:/api/ads/accounts/health-check]', { clientId, status });
    return res.json({ success: true, account: updated });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/accounts/health-check]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
