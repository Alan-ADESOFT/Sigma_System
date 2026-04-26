/**
 * @fileoverview GET/PUT/DELETE /api/image/templates/:id
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../lib/api-auth');
const {
  getTemplateById, updateTemplate, deleteTemplate,
} = require('../../../../models/imageTemplate.model');

export default async function handler(req, res) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  if (req.method === 'GET') {
    const tpl = await getTemplateById(id, tenantId);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template não encontrado' });
    return res.json({ success: true, data: tpl });
  }

  if (req.method === 'PUT') {
    const { name, description } = req.body || {};
    try {
      const updated = await updateTemplate(id, tenantId, { name, description });
      if (!updated) return res.status(404).json({ success: false, error: 'Template não encontrado' });
      return res.json({ success: true, data: updated });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Já existe um template com esse nome' });
      }
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    const ok = await deleteTemplate(id, tenantId);
    if (!ok) return res.status(404).json({ success: false, error: 'Template não encontrado' });
    return res.json({ success: true, data: { id, deleted: true } });
  }

  return res.status(405).json({ success: false, error: 'Método não permitido' });
}
