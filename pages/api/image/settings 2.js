/**
 * @fileoverview GET/PUT /api/image/settings
 *   GET — retorna a settings "pública" (sem chaves)
 *   PUT — atualiza campos não-sensíveis OU uma chave de API por vez
 *
 * Para atualizar chaves de API:
 *   PUT { provider: 'openai'|'fal'|'gemini'|'vertex', apiKey: '...' }
 *   ou para Vertex: PUT { provider: 'vertex', credentials: '...JSON...' }
 *   passando apiKey="" (string vazia) REMOVE a chave configurada.
 *
 * Demais campos: PUT { default_model, daily_limit_user, ... }
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { requireAuth, isAdmin, handleAuthError } = require('../../../lib/api-auth');
const {
  getPublic, update, updateApiKey,
} = require('../../../models/imageSettings.model');

export default async function handler(req, res) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);

  if (req.method === 'GET') {
    const data = await getPublic(tenantId);
    return res.json({ success: true, data });
  }

  if (req.method === 'PUT') {
    if (!isAdmin(user)) {
      return res.status(403).json({ success: false, error: 'Apenas admin pode alterar configurações' });
    }

    const body = req.body || {};

    // Caso 1: atualização de chave/credentials de provider
    if (body.provider && (body.apiKey !== undefined || body.credentials !== undefined)) {
      const provider = body.provider;
      const plainValue = provider === 'vertex'
        ? (typeof body.credentials === 'object' ? JSON.stringify(body.credentials) : body.credentials)
        : body.apiKey;
      try {
        await updateApiKey(tenantId, provider, plainValue || null, { userId: user.id, req });
        const data = await getPublic(tenantId);
        return res.json({ success: true, data });
      } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
      }
    }

    // Caso 2: atualização de campos regulares
    try {
      const updated = await update(tenantId, body, { userId: user.id, req });
      const safe = await getPublic(tenantId);
      return res.json({ success: true, data: safe });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Método não permitido' });
}
