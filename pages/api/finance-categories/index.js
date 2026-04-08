/**
 * pages/api/finance-categories/index.js
 * CRUD de categorias financeiras (admin only)
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const { getCategories, createCategory, updateCategory, deleteCategory } = require('../../../models/financeCategory.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const categories = await getCategories(tenantId);
      return res.json({ success: true, categories });
    }

    if (req.method === 'POST') {
      const { name, type, color } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
      if (type && !['fixed', 'variable'].includes(type)) {
        return res.status(400).json({ success: false, error: 'Tipo deve ser fixed ou variable' });
      }
      const category = await createCategory(tenantId, { name, type, color });
      return res.status(201).json({ success: true, category });
    }

    if (req.method === 'PUT') {
      const { id, name, type, color } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });
      const category = await updateCategory(id, tenantId, { name, type, color });
      if (!category) return res.status(404).json({ success: false, error: 'Categoria não encontrada' });
      return res.json({ success: true, category });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });
      const result = await deleteCategory(id, tenantId);
      if (!result.deleted) return res.status(409).json({ success: false, error: result.reason });
      return res.json({ success: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:finance-categories]', err.message);
    if (err.message.includes('unique') || err.message.includes('duplicate')) {
      return res.status(409).json({ success: false, error: 'Já existe uma categoria com esse nome' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
}
