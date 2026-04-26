/**
 * pages/api/ads/public/generate-token.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/ads/public/generate-token
 *   body: { clientId, expiresInDays?, config? }
 *
 * expiresInDays ∈ [null, 30, 90, 180]. NULL = sem expiração.
 * Retorna { token, link, expiresAt }.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { queryOne } = require('../../../../infra/db');
const adsPublicReport = require('../../../../models/ads/adsPublicReport.model');

function resolveBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || `http://localhost:${process.env.PORT || 3001}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });

  const { clientId, expiresInDays = null, config } = req.body || {};
  if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });

  console.log('[INFO][API:/api/ads/public/generate-token]', { clientId, expiresInDays });

  try {
    const tenantId = await resolveTenantId(req);
    const client = await queryOne(
      `SELECT id FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId]
    );
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

    const tokenRow = await adsPublicReport.generateToken(tenantId, clientId, {
      expiresInDays,
      config,
      createdBy: tenantId,
    });

    const link = `${resolveBaseUrl().replace(/\/$/, '')}/relatorio-ads/${tokenRow.token}`;
    console.log('[SUCESSO][API:/api/ads/public/generate-token]', { tokenId: tokenRow.id });
    return res.json({
      success: true,
      tokenId: tokenRow.id,
      token: tokenRow.token,
      link,
      expiresAt: tokenRow.expiresAt,
      config: tokenRow.config,
    });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/public/generate-token]', { error: err.message });
    if (err.message.includes('expiresInDays')) {
      return res.status(400).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
}
