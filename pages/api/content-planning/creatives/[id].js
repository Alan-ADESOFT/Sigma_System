/**
 * pages/api/content-planning/creatives/[id].js
 *   GET    → busca criativo
 *   PUT    → atualiza campos (mídia/copy)
 *   DELETE → remove criativo
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const creativeModel = require('../../../../models/contentPlanning/creative');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  try {
    if (req.method === 'GET') {
      const creative = await creativeModel.getCreativeById(id, tenantId);
      if (!creative) return res.status(404).json({ success: false, error: 'Criativo nao encontrado' });
      return res.json({ success: true, creative });
    }

    if (req.method === 'PUT') {
      const creative = await creativeModel.updateCreative(id, tenantId, req.body || {});
      if (!creative) return res.status(404).json({ success: false, error: 'Criativo nao encontrado' });
      return res.json({ success: true, creative });
    }

    if (req.method === 'DELETE') {
      const ok = await creativeModel.deleteCreative(id, tenantId);
      if (!ok) return res.status(404).json({ success: false, error: 'Criativo nao encontrado' });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:content-planning/creatives/[id]]', { id, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
