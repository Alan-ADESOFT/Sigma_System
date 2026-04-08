const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { verifyToken } = require('../../../lib/auth');
const meetingModel = require('../../../models/meeting.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const token = req.cookies?.sigma_token;
  const session = verifyToken(token);
  const userId = session?.userId;

  try {
    if (req.method === 'GET') {
      const { dateFrom, dateTo, clientId } = req.query;
      const meetings = await meetingModel.getMeetings(tenantId, { dateFrom, dateTo, clientId });
      return res.json({ success: true, meetings });
    }

    if (req.method === 'POST') {
      const { title, description, meeting_date, start_time, end_time, client_id, participants, meet_link, obs } = req.body;
      if (!title || !meeting_date || !start_time) {
        return res.status(400).json({ success: false, error: 'Título, data e horário são obrigatórios' });
      }

      const meeting = await meetingModel.createMeeting({
        title,
        description,
        meeting_date,
        start_time,
        end_time,
        client_id,
        participants: participants || [],
        meet_link,
        obs,
        created_by: userId,
      }, tenantId);

      return res.status(201).json({ success: true, meeting });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/meetings]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
