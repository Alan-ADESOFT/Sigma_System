const { resolveTenantId } = require('../../../infra/get-tenant-id');
const templateModel = require('../../../models/taskTemplate.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const templates = await templateModel.getTemplates(tenantId);
      return res.json({ success: true, templates });
    }

    if (req.method === 'POST') {
      const { name, trigger, tasks_json, is_active } = req.body;
      if (!name || !trigger) {
        return res.status(400).json({ success: false, error: 'Nome e trigger obrigatórios' });
      }
      const template = await templateModel.createTemplate({ name, trigger, tasks_json, is_active }, tenantId);
      return res.status(201).json({ success: true, template });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/task-templates]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
