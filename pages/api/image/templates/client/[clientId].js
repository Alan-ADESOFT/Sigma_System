/**
 * @fileoverview Endpoint: CRUD templates de inspiracao POR CLIENTE
 * @route /api/image/templates/client/[clientId]
 *
 * GET    → lista templates do cliente
 * POST   → cria   (body: { title, url, category?, thumbnailUrl?, description? })
 * PUT    → edita  (?id=...) (body: { title?, category?, description? })
 * DELETE → apaga  (?id=...)
 *
 * Upload da imagem feito antes via /api/upload — este endpoint recebe so
 * a URL ja persistida.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
import { queryOne } from '../../../../../infra/db';
import {
  getClientTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateById,
  SCOPES,
} from '../../../../../models/inspirationTemplate.model';

export default async function handler(req, res) {
  let tenantId;
  try {
    tenantId = await resolveTenantId(req);
  } catch {
    return res.status(401).json({ success: false, error: 'Nao autorizado' });
  }

  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatorio' });

  // Garante que o cliente pertence a este tenant — defesa contra tampering
  const client = await queryOne(
    `SELECT id FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
    [clientId, tenantId]
  );
  if (!client) return res.status(404).json({ success: false, error: 'cliente nao encontrado' });

  try {
    if (req.method === 'GET') {
      const list = await getClientTemplates(clientId, tenantId);
      return res.json({ success: true, data: list });
    }

    if (req.method === 'POST') {
      const { title, category, url, thumbnailUrl, description } = req.body || {};
      const tpl = await createTemplate({
        scope: SCOPES.CLIENT, tenantId, clientId,
        title, category, url, thumbnailUrl, description,
      });
      console.log('[SUCESSO][API:image/templates/client] criado', { id: tpl.id, clientId });
      return res.status(201).json({ success: true, data: tpl });
    }

    if (req.method === 'PUT') {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });
      const updated = await updateTemplate(id, SCOPES.CLIENT, tenantId, req.body || {});
      if (!updated || updated.client_id !== clientId) {
        return res.status(404).json({ success: false, error: 'template nao encontrado' });
      }
      return res.json({ success: true, data: updated });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });
      const tpl = await getTemplateById(id, SCOPES.CLIENT, tenantId);
      if (!tpl || tpl.client_id !== clientId) {
        return res.status(404).json({ success: false, error: 'template nao encontrado' });
      }
      await deleteTemplate(id, SCOPES.CLIENT, tenantId);
      console.log('[SUCESSO][API:image/templates/client] apagado', { id, clientId });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:image/templates/client]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
