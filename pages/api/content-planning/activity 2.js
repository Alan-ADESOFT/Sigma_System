/**
 * pages/api/content-planning/activity.js
 *   GET → { activities, unreadCount } — alimenta o sininho
 *   PUT → marca todas como lidas
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const activityModel = require('../../../models/contentPlanning/activity');
const { queryOne } = require('../../../infra/db');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const limit = req.query.limit ? Math.max(1, Math.min(100, parseInt(req.query.limit, 10))) : 20;
      const activities = await activityModel.listUnreadActivities(tenantId, { limit });
      const totalRow = await queryOne(
        `SELECT COUNT(*)::int AS count
           FROM content_plan_activity
          WHERE tenant_id = $1 AND read = false`,
        [tenantId]
      );
      return res.json({ success: true, activities, unreadCount: totalRow?.count || 0 });
    }

    if (req.method === 'PUT') {
      await activityModel.markAllAsRead(tenantId);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:content-planning/activity]', { method: req.method, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
