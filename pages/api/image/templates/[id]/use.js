/**
 * @fileoverview POST /api/image/templates/:id/use
 * @description Incrementa usage_count e last_used_at. Retorna o template
 * já atualizado para o frontend popular o formulário de geração.
 */

const { resolveTenantId } = require('../../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../../lib/api-auth');
const {
  getTemplateById, incrementUsage,
} = require('../../../../../models/imageTemplate.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  try {
    await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  const updated = await incrementUsage(id, tenantId);
  if (!updated) return res.status(404).json({ success: false, error: 'Template não encontrado' });

  const full = await getTemplateById(id, tenantId);
  return res.json({ success: true, data: full });
}
