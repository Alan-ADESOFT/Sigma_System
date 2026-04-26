/**
 * @fileoverview GET/POST/PUT/DELETE /api/image/brandbook/:clientId
 *   GET    — retorna o brandbook ativo (ou null)
 *   POST   — cria um novo brandbook (desativa o atual). Body: { source, structuredData, ...meta }
 *   PUT    — atualiza o brandbook ativo (campos parciais)
 *   DELETE — remove o brandbook ativo + arquivo físico
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../lib/api-auth');
const {
  getActiveBrandbook, listBrandbookHistory,
  createBrandbook, updateBrandbook, deleteBrandbook,
} = require('../../../../models/brandbook.model');
const { logAudit } = require('../../../../models/imageAudit.model');

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

export default async function handler(req, res) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { clientId } = req.query;

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId obrigatório' });
  }

  if (req.method === 'GET') {
    const active = await getActiveBrandbook(clientId, tenantId);
    let history = [];
    if (req.query.includeHistory === 'true') {
      history = await listBrandbookHistory(clientId, tenantId, 10);
    }
    return res.json({ success: true, data: { active, history } });
  }

  if (req.method === 'POST') {
    const {
      source, structuredData,
      fileUrl, fileName, fileSize, mimeType, extractedText,
    } = req.body || {};

    if (!source || !structuredData) {
      return res.status(400).json({ success: false, error: 'source e structuredData obrigatórios' });
    }
    try {
      const row = await createBrandbook({
        tenantId, clientId, source,
        fileUrl, fileName, fileSize, mimeType, extractedText,
        structuredData,
        createdBy: user.id,
      });
      return res.status(201).json({ success: true, data: row });
    } catch (err) {
      console.error('[ERRO][API:image/brandbook] criação', { error: err.message });
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const active = await getActiveBrandbook(clientId, tenantId);
    if (!active) return res.status(404).json({ success: false, error: 'Brandbook ativo não encontrado' });
    const updated = await updateBrandbook(active.id, tenantId, req.body || {});
    return res.json({ success: true, data: updated });
  }

  if (req.method === 'DELETE') {
    const active = await getActiveBrandbook(clientId, tenantId);
    if (!active) return res.status(404).json({ success: false, error: 'Brandbook ativo não encontrado' });
    await deleteBrandbook(active.id, tenantId);
    await logAudit({
      tenantId, userId: user.id, req,
      action: 'brandbook_deleted',
      details: { brandbookId: active.id, clientId },
    });
    return res.json({ success: true, data: { id: active.id, deleted: true } });
  }

  return res.status(405).json({ success: false, error: 'Método não permitido' });
}
