/**
 * pages/api/comercial/pipeline/columns.js
 *   GET  → lista colunas do tenant (auto-bootstrap se vazio)
 *   POST → cria nova coluna { name, color }
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const pipeline = require('../../../../models/comercial/pipeline.model');

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/pipeline/columns]', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);

    if (req.method === 'GET') {
      let columns = await pipeline.getColumns(tenantId);
      if (columns.length === 0) {
        columns = await pipeline.bootstrapDefaultColumns(tenantId);
      }
      return res.json({ success: true, columns });
    }

    if (req.method === 'POST') {
      const { name, color } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, error: 'name obrigatório' });
      }
      const column = await pipeline.createColumn(tenantId, {
        name: String(name).trim(),
        color: color || '#6366F1',
      });
      return res.status(201).json({ success: true, column });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:comercial/pipeline/columns]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
