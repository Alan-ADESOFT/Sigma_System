/**
 * @fileoverview Endpoint: CRUD templates de inspiracao GLOBAIS do tenant
 * @route /api/image/templates/global
 *
 * GET    → lista (?category=... opcional, ?includeInactive=1 opcional)
 * POST   → cria   (body: { title, category, url, thumbnailUrl?, description? })
 * PUT    → edita  (?id=...) (body: { title?, category?, description?, is_active? })
 * DELETE → apaga  (?id=...)
 *
 * Upload da imagem fisica e feito ANTES via /api/upload — este endpoint
 * recebe so a URL ja persistida em /uploads/. Mantem responsabilidades
 * separadas e reaproveita o validador de magic bytes do upload generico.
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import {
  getActiveGlobalTemplates,
  getAllGlobalTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateById,
  SCOPES, VALID_CATEGORIES,
} from '../../../../models/inspirationTemplate.model';

export default async function handler(req, res) {
  let tenantId;
  try {
    tenantId = await resolveTenantId(req);
  } catch {
    return res.status(401).json({ success: false, error: 'Nao autorizado' });
  }

  try {
    if (req.method === 'GET') {
      const { category, includeInactive } = req.query || {};
      if (includeInactive === '1') {
        const list = await getAllGlobalTemplates(tenantId);
        return res.json({ success: true, data: list });
      }
      const list = await getActiveGlobalTemplates(tenantId, category || null);
      return res.json({ success: true, data: list, categories: VALID_CATEGORIES });
    }

    if (req.method === 'POST') {
      const { title, category, url, thumbnailUrl, description } = req.body || {};
      const tpl = await createTemplate({
        scope: SCOPES.GLOBAL, tenantId,
        title, category, url, thumbnailUrl, description,
      });
      console.log('[SUCESSO][API:image/templates/global] criado', { id: tpl.id, category });
      return res.status(201).json({ success: true, data: tpl });
    }

    if (req.method === 'PUT') {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });
      const updated = await updateTemplate(id, SCOPES.GLOBAL, tenantId, req.body || {});
      if (!updated) return res.status(404).json({ success: false, error: 'template nao encontrado' });
      return res.json({ success: true, data: updated });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });
      const tpl = await getTemplateById(id, SCOPES.GLOBAL, tenantId);
      if (!tpl) return res.status(404).json({ success: false, error: 'template nao encontrado' });
      await deleteTemplate(id, SCOPES.GLOBAL, tenantId);
      console.log('[SUCESSO][API:image/templates/global] apagado', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:image/templates/global]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
