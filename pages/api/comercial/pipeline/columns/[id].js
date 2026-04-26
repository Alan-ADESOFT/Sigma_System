/**
 * pages/api/comercial/pipeline/columns/[id].js
 *   PUT    → atualiza name/color/sortOrder
 *   DELETE → bloqueia se is_system; senão move leads pra start
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const pipeline = require('../../../../../models/comercial/pipeline.model');

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/pipeline/columns/[id]]', { method: req.method, id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

    if (req.method === 'PUT') {
      const { name, color, sortOrder } = req.body || {};
      const column = await pipeline.updateColumn(id, tenantId, { name, color, sortOrder });
      if (!column) return res.status(404).json({ success: false, error: 'Coluna não encontrada' });
      return res.json({ success: true, column });
    }

    if (req.method === 'DELETE') {
      const result = await pipeline.deleteColumn(id, tenantId);
      if (!result) return res.status(404).json({ success: false, error: 'Coluna não encontrada' });
      return res.json({ success: true, ...result });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:comercial/pipeline/columns/[id]]', { error: err.message });
    const status = /sistema|encontrada/i.test(err.message) ? 400 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
}
