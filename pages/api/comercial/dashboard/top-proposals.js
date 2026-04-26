/**
 * pages/api/comercial/dashboard/top-proposals.js
 *   GET ?period=month&limit=5
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const { getTopProposals } = require('../../../../models/comercial/dashboard.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:dashboard/top-proposals]');

  try {
    const tenantId = await resolveTenantId(req);
    const period = ['week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'month';
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit, 10) || 5));
    const rows = await getTopProposals(tenantId, { period, limit });

    return res.json({
      success: true,
      proposals: rows.map(r => ({
        id: r.id,
        slug: r.slug,
        clientName: r.client_name,
        viewCount: r.view_count || 0,
        uniqueViewCount: r.unique_view_count || 0,
        totalTimeSeconds: r.total_time_seconds || 0,
        maxScrollPct: r.max_scroll_pct || 0,
        lastViewedAt: r.last_viewed_at,
        publishedAt: r.published_at,
        status: r.status,
      })),
    });
  } catch (err) {
    console.error('[ERRO][API:dashboard/top-proposals]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
