/**
 * pages/api/atas/week-meetings.js
 * GET ?week=YYYY-MM-DD (segunda) → reuniões já cadastradas no Calendário naquela
 * semana (Seg-Dom). Alimenta a seção "Reuniões da semana" da ata automaticamente.
 */
const { requireAuth, handleAuthError } = require('../../../lib/api-auth');
const meetingModel = require('../../../models/meeting.model');

export default async function handler(req, res) {
  let user;
  try { user = await requireAuth(req); }
  catch (err) { if (handleAuthError(res, err)) return; return res.status(500).json({ success: false, error: err.message }); }
  const tenantId = user.tenant_id;

  try {
    if (req.method !== 'GET') return res.status(405).end();
    const week = req.query.week;
    if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.json({ success: true, meetings: [] });

    const end = new Date(week + 'T00:00:00');
    end.setDate(end.getDate() + 6);
    const dateTo = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    const meetings = await meetingModel.getMeetings(tenantId, { dateFrom: week, dateTo });
    return res.json({ success: true, meetings });
  } catch (err) {
    console.error('[ERRO][API:/api/atas/week-meetings]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
