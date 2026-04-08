const { resolveTenantId } = require('../../../infra/get-tenant-id');
const recurrenceModel = require('../../../models/taskRecurrence.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  try {
    if (req.method === 'PUT') {
      const updated = await recurrenceModel.updateRecurrence(id, req.body || {}, tenantId);
      if (!updated) return res.status(404).json({ success: false, error: 'Recorrência não encontrada' });
      return res.json({ success: true, recurrence: updated });
    }

    if (req.method === 'DELETE') {
      const deleted = await recurrenceModel.deleteRecurrence(id, tenantId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Recorrência não encontrada' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/task-recurrences/[id]]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
