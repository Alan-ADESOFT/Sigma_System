/**
 * pages/api/comercial/dashboard/leaderboard.js
 *   GET ?period=month&limit=10
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const { getLeaderboard } = require('../../../../models/comercial/dashboard.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:dashboard/leaderboard]');

  try {
    const tenantId = await resolveTenantId(req);
    const period = ['week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'month';
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));
    const rows = await getLeaderboard(tenantId, { period, limit });

    const enriched = rows.map(r => {
      const won = r.leads_won || 0;
      const proposalsSent = r.proposals_sent || 0;
      const activitiesCount = r.activities_count || 0;
      const score = (won * 100) + (proposalsSent * 5) + activitiesCount;
      return {
        userId:          r.user_id,
        userName:        r.user_name,
        avatarUrl:       r.avatar_url,
        leadsAssigned:   r.leads_assigned || 0,
        leadsWon:        won,
        leadsWonValue:   Number(r.leads_won_value || 0),
        proposalsSent,
        activitiesCount,
        score,
      };
    }).sort((a, b) => b.score - a.score);

    return res.json({ success: true, leaderboard: enriched });
  } catch (err) {
    console.error('[ERRO][API:dashboard/leaderboard]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
