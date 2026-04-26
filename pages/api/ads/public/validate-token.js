/**
 * pages/api/ads/public/validate-token.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/ads/public/validate-token?token=X   (PÚBLICO, sem auth)
 *
 * Retorna apenas dados básicos do cliente (sem token Meta, sem configs internas).
 * NÃO usa resolveTenantId — o tenant é resolvido a partir do token.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const adsPublicReport = require('../../../../models/ads/adsPublicReport.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Use GET' });

  const { token } = req.query;
  if (!token) return res.status(400).json({ success: false, valid: false, reason: 'no_token' });

  try {
    const { valid, reason, tokenData } = await adsPublicReport.validateToken(token);
    if (!valid) {
      return res.json({
        success: true,
        valid: false,
        reason,
      });
    }

    return res.json({
      success: true,
      valid: true,
      client: {
        companyName: tokenData.company_name,
        logoUrl: tokenData.logo_url,
      },
      config: tokenData.config || {},
      expiresAt: tokenData.expires_at,
    });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/public/validate-token]', { error: err.message });
    return res.status(500).json({ success: false, valid: false, error: err.message });
  }
}
