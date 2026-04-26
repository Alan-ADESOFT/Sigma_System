/**
 * pages/api/comercial/captacao/lists/[id].js
 *   GET    → detalhe da lista + leads paginados (?page, ?search)
 *   DELETE → deleta lista (cascade nos leads)
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const leadList = require('../../../../../models/comercial/leadList.model');

const PAGE_SIZE = 50;

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/captacao/lists/[id]]', { method: req.method, id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

    const list = await leadList.getListById(id, tenantId);
    if (!list) return res.status(404).json({ success: false, error: 'Lista não encontrada' });

    if (req.method === 'GET') {
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const search = req.query.search ? String(req.query.search) : '';
      const offset = (page - 1) * PAGE_SIZE;

      const { rows, total } = await leadList.getLeadsByListId(id, tenantId, {
        limit: PAGE_SIZE,
        offset,
        search,
      });

      return res.json({
        success: true,
        list,
        leads: rows,
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          total,
          totalPages: Math.ceil(total / PAGE_SIZE) || 1,
        },
      });
    }

    if (req.method === 'DELETE') {
      await leadList.deleteList(id, tenantId);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:comercial/captacao/lists/[id]]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
