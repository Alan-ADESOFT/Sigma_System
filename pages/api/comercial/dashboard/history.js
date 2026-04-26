/**
 * pages/api/comercial/dashboard/history.js
 *   GET ?weeks=52
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const { getWeeklyHistory } = require('../../../../models/comercial/dashboard.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:dashboard/history]');

  try {
    const tenantId = await resolveTenantId(req);
    const weeks = Math.max(4, Math.min(104, parseInt(req.query.weeks, 10) || 52));
    const rows = await getWeeklyHistory(tenantId, { weeks });
    return res.json({
      success: true,
      history: rows.map(r => ({
        weekStart: r.week_start,
        captured: r.captured || 0,
        won:      r.won || 0,
        lost:     r.lost || 0,
      })),
    });
  } catch (err) {
    console.error('[ERRO][API:dashboard/history]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
