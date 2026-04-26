/**
 * pages/api/comercial/prospects/[id].js
 *   GET / PUT / DELETE
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const prospects = require('../../../../models/comercial/prospect.model');

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/prospects/[id]]', { method: req.method, id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

    if (req.method === 'GET') {
      const prospect = await prospects.getProspectById(id, tenantId);
      if (!prospect) return res.status(404).json({ success: false, error: 'Prospect não encontrado' });
      return res.json({ success: true, prospect });
    }

    if (req.method === 'PUT') {
      const updated = await prospects.updateProspect(id, tenantId, req.body || {});
      if (!updated) return res.status(404).json({ success: false, error: 'Prospect não encontrado' });
      return res.json({ success: true, prospect: updated });
    }

    if (req.method === 'DELETE') {
      await prospects.deleteProspect(id, tenantId);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:comercial/prospects/[id]]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
