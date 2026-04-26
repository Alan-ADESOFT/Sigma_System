/**
 * pages/api/ads/accounts/oauth-start.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/ads/accounts/oauth-start?clientId=<id>
 *
 * Redireciona (302) para o dialog OAuth da Meta.
 * `state` é um payload assinado por HMAC carregando { clientId, tenantId, nonce }.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { queryOne } = require('../../../../infra/db');
const metaAds = require('../../../../infra/api/metaAds');

function getStateSecret() {
  return process.env.SESSION_SECRET || 'sigma-ads-oauth-fallback-secret-change-in-prod';
}

function signState(payload) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json).toString('base64url');
  const hmac = crypto.createHmac('sha256', getStateSecret()).update(data).digest('base64url');
  return `${data}.${hmac}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Use GET' });

  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });

  console.log('[INFO][API:/api/ads/accounts/oauth-start]', { clientId });

  try {
    const tenantId = await resolveTenantId(req);

    const client = await queryOne(
      `SELECT id FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId]
    );
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

    const state = signState({
      clientId,
      tenantId,
      nonce: crypto.randomBytes(8).toString('hex'),
      ts: Date.now(),
    });

    const authUrl = metaAds.buildAuthorizeUrl(state);
    console.log('[SUCESSO][API:/api/ads/accounts/oauth-start] redirecionando');
    res.writeHead(302, { Location: authUrl });
    return res.end();
  } catch (err) {
    console.error('[ERRO][API:/api/ads/accounts/oauth-start]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
