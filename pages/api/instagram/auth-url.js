/**
 * pages/api/instagram/auth-url.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/instagram/auth-url?clientId=<id>
 *
 * Gera a URL OAuth do Instagram Business Login.
 * O `state` carrega o clientId pra que o callback saiba a quem associar o token.
 *
 * Fluxo (Instagram Business Login, lançado julho/2024):
 *   user → api.instagram.com/oauth/authorize
 *        → callback recebe `code`
 *        → callback troca code por token e salva
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { queryOne } = require('../../../infra/db');
const meta = require('../../../infra/api/meta');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Use GET' });
  }

  const { clientId } = req.query;
  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId obrigatório' });
  }

  console.log('[INFO][API:/api/instagram/auth-url] Gerando URL OAuth', { clientId });

  try {
    const tenantId = await resolveTenantId(req);

    const client = await queryOne(
      `SELECT id FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId]
    );
    if (!client) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    let authUrl;
    try {
      authUrl = meta.buildAuthorizeUrl(clientId);
    } catch (err) {
      console.error('[ERRO][API:/api/instagram/auth-url] config inválida', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }

    console.log('[SUCESSO][API:/api/instagram/auth-url] URL gerada');
    return res.json({ success: true, authUrl });
  } catch (err) {
    console.error('[ERRO][API:/api/instagram/auth-url]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
