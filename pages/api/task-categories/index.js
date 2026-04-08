const { resolveTenantId } = require('../../../infra/get-tenant-id');
const categoryModel = require('../../../models/taskCategory.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const categories = await categoryModel.getCategories(tenantId);
      return res.json({ success: true, categories });
    }

    if (req.method === 'POST') {
      const { name, color } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Nome obrigatório' });
      const category = await categoryModel.createCategory({ name, color }, tenantId);
      return res.status(201).json({ success: true, category });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/task-categories]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
