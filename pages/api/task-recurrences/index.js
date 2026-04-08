const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { verifyToken } = require('../../../lib/auth');
const recurrenceModel = require('../../../models/taskRecurrence.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const token = req.cookies?.sigma_token;
  const session = verifyToken(token);
  const userId = session?.userId;

  try {
    if (req.method === 'GET') {
      const recurrences = await recurrenceModel.getRecurrences(tenantId);
      return res.json({ success: true, recurrences });
    }

    if (req.method === 'POST') {
      const { title, frequency } = req.body || {};
      if (!title || !frequency) {
        return res.status(400).json({ success: false, error: 'Título e frequência são obrigatórios' });
      }
      const recurrence = await recurrenceModel.createRecurrence(
        { ...req.body, created_by: userId },
        tenantId
      );
      return res.status(201).json({ success: true, recurrence });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/task-recurrences]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
