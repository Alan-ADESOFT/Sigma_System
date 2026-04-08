const { resolveTenantId } = require('../../../infra/get-tenant-id');
const categoryModel = require('../../../models/taskCategory.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  try {
    if (req.method === 'PUT') {
      const { name, color } = req.body;
      const category = await categoryModel.updateCategory(id, { name, color }, tenantId);
      if (!category) return res.status(404).json({ success: false, error: 'Categoria não encontrada' });
      return res.json({ success: true, category });
    }

    if (req.method === 'DELETE') {
      const deleted = await categoryModel.deleteCategory(id, tenantId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Categoria não encontrada' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/task-categories/[id]]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
