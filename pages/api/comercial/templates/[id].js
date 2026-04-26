/**
 * pages/api/comercial/templates/[id].js
 *   GET / PUT / DELETE
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const tpl = require('../../../../models/comercial/messageTemplate.model');

export default async function handler(req, res) {
  console.log('[INFO][API:templates/[id]]', { method: req.method, id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

    if (req.method === 'GET') {
      const t = await tpl.getTemplateById(id, tenantId);
      if (!t) return res.status(404).json({ success: false, error: 'Template não encontrado' });
      return res.json({ success: true, template: t });
    }

    if (req.method === 'PUT') {
      const updated = await tpl.updateTemplate(id, tenantId, req.body || {});
      if (!updated) return res.status(404).json({ success: false, error: 'Template não encontrado' });
      return res.json({ success: true, template: updated });
    }

    if (req.method === 'DELETE') {
      await tpl.deleteTemplate(id, tenantId);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:templates/[id]]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
