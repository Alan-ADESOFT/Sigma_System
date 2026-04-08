const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const taskModel = require('../../../../models/task.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id: taskId } = req.query;

  try {
    if (req.method === 'POST') {
      const { dependsOnId } = req.body;
      if (!dependsOnId) return res.status(400).json({ success: false, error: 'dependsOnId obrigatório' });
      if (dependsOnId === taskId) return res.status(400).json({ success: false, error: 'Task não pode depender de si mesma' });
      await taskModel.addDependency(taskId, dependsOnId, tenantId);
      return res.status(201).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { dependsOnId } = req.body;
      if (!dependsOnId) return res.status(400).json({ success: false, error: 'dependsOnId obrigatório' });
      await taskModel.removeDependency(taskId, dependsOnId, tenantId);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/tasks/[id]/dependencies]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
