const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { verifyToken } = require('../../../../lib/auth');
const templateModel = require('../../../../models/taskTemplate.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const tenantId = await resolveTenantId(req);
  const { id } = req.query;
  const { clientId } = req.body;
  const token = req.cookies?.sigma_token;
  const session = verifyToken(token);

  if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });

  try {
    const tasks = await templateModel.applyTemplate(id, clientId, tenantId, session?.userId);
    return res.json({ success: true, tasks, count: tasks.length });
  } catch (err) {
    console.error('[ERRO][API:/api/task-templates/[id]/apply]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
