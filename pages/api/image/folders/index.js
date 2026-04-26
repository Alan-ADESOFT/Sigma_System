/**
 * @fileoverview GET/POST /api/image/folders
 *   GET ?clientId=... — lista pastas do cliente
 *   POST { clientId, name, color? } — cria pasta
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../lib/api-auth');
const { listByClient, createFolder } = require('../../../../models/imageFolder.model');

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
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });
    const items = await listByClient(clientId, tenantId);
    return res.json({ success: true, data: items });
  }

  if (req.method === 'POST') {
    const { clientId, name, color } = req.body || {};
    if (!clientId || !name) {
      return res.status(400).json({ success: false, error: 'clientId e name obrigatórios' });
    }
    try {
      const folder = await createFolder({
        tenantId, clientId, name, color, createdBy: user.id,
      });
      console.log('[SUCESSO][API:image/folders] pasta criada', { id: folder.id, clientId });
      return res.status(201).json({ success: true, data: folder });
    } catch (err) {
      if (err.message?.includes('duplicate') || err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Já existe uma pasta com esse nome neste cliente' });
      }
      console.error('[ERRO][API:image/folders]', { error: err.message });
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Método não permitido' });
}
