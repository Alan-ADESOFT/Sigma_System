const { resolveTenantId } = require('../../../infra/get-tenant-id');
const meetingModel = require('../../../models/meeting.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const meeting = await meetingModel.getMeetingById(id, tenantId);
      if (!meeting) return res.status(404).json({ success: false, error: 'Reunião não encontrada' });
      return res.json({ success: true, meeting });
    }

    if (req.method === 'PUT') {
      const data = req.body;
      const meeting = await meetingModel.updateMeeting(id, data, tenantId);
      if (!meeting) return res.status(404).json({ success: false, error: 'Reunião não encontrada' });
      return res.json({ success: true, meeting });
    }

    if (req.method === 'DELETE') {
      const deleted = await meetingModel.deleteMeeting(id, tenantId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Reunião não encontrada' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/meetings/[id]]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
