const { resolveTenantId } = require('../../../infra/get-tenant-id');
const botModel = require('../../../models/taskBotConfig.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const configs = await botModel.getConfigs(tenantId);
      return res.json({ success: true, configs });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const { user_id, phone, dispatch_time, active_days, message_morning, message_overdue, is_active } = req.body;
      if (!user_id || !phone) {
        return res.status(400).json({ success: false, error: 'user_id e phone obrigatórios' });
      }
      const config = await botModel.upsertConfig({
        user_id, phone, dispatch_time, active_days, message_morning, message_overdue, is_active,
      }, tenantId);
      return res.json({ success: true, config });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/task-bot-config]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
