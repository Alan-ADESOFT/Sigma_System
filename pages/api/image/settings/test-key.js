/**
 * @fileoverview POST /api/image/settings/test-key
 * @description Testa uma API key/credentials sem salvar.
 *   Body: { provider: 'openai'|'fal'|'gemini'|'vertex', apiKey?: string, credentials?: string|object }
 *   Para Vertex, passe `credentials` como JSON da service account.
 */

const { requireAuth, isAdmin, handleAuthError } = require('../../../../lib/api-auth');
const { testApiKey } = require('../../../../infra/api/imageProviders');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  if (!isAdmin(user)) {
    return res.status(403).json({ success: false, error: 'Apenas admin pode testar chaves' });
  }

  const { provider, apiKey, credentials } = req.body || {};
  if (!provider) return res.status(400).json({ success: false, error: 'provider obrigatório' });

  const key = provider === 'vertex'
    ? (typeof credentials === 'object' ? JSON.stringify(credentials) : credentials)
    : apiKey;

  if (!key) {
    return res.status(400).json({
      success: false,
      error: provider === 'vertex' ? 'credentials obrigatório' : 'apiKey obrigatória',
    });
  }

  const extra = provider === 'vertex' ? { credentials: key } : {};
  const result = await testApiKey(provider, key, extra);
  return res.json({ success: true, ...result });
}
