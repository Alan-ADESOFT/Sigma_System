/**
 * pages/api/content-planning/statuses/[id].js
 *   PUT    → atualiza status
 *   DELETE → remove (bloqueado se em uso ou se for default)
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const statusModel = require('../../../../models/contentPlanning/status');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  try {
    if (req.method === 'PUT') {
      const status = await statusModel.updateStatus(id, tenantId, req.body || {});
      if (!status) return res.status(404).json({ success: false, error: 'Status nao encontrado' });
      return res.json({ success: true, status });
    }

    if (req.method === 'DELETE') {
      const result = await statusModel.deleteStatus(id, tenantId);
      if (!result.ok) {
        const code = result.reason === 'not_found' ? 404 :
                     result.reason === 'is_default' ? 409 :
                     result.reason === 'in_use'     ? 409 : 400;
        return res.status(code).json({ success: false, reason: result.reason, count: result.count });
      }
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:content-planning/statuses/[id]]', { id, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
