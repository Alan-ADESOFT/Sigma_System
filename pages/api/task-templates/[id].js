const { resolveTenantId } = require('../../../infra/get-tenant-id');
const templateModel = require('../../../models/taskTemplate.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const template = await templateModel.getTemplateById(id, tenantId);
      if (!template) return res.status(404).json({ success: false, error: 'Template não encontrado' });
      return res.json({ success: true, template });
    }

    if (req.method === 'PUT') {
      const data = req.body;
      const template = await templateModel.updateTemplate(id, data, tenantId);
      if (!template) return res.status(404).json({ success: false, error: 'Template não encontrado' });
      return res.json({ success: true, template });
    }

    if (req.method === 'DELETE') {
      const deleted = await templateModel.deleteTemplate(id, tenantId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Template não encontrado' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/task-templates/[id]]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
