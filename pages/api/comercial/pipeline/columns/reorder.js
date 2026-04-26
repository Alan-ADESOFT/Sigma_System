/**
 * pages/api/comercial/pipeline/columns/reorder.js
 *   POST → batch update sort_order { orderedIds: [...] }
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const pipeline = require('../../../../../models/comercial/pipeline.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:comercial/pipeline/columns/reorder]');

  try {
    const tenantId = await resolveTenantId(req);
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds (array) obrigatório' });
    }
    await pipeline.reorderColumns(tenantId, orderedIds);
    const columns = await pipeline.getColumns(tenantId);
    return res.json({ success: true, columns });
  } catch (err) {
    console.error('[ERRO][API:comercial/pipeline/columns/reorder]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
