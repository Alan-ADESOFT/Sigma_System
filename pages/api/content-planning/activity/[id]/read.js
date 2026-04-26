/**
 * pages/api/content-planning/activity/[id]/read.js
 *   PUT → marca uma atividade como lida
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const activityModel = require('../../../../../models/contentPlanning/activity');

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  try {
    await activityModel.markAsRead([id], tenantId);
    return res.json({ success: true });
  } catch (err) {
    console.error('[ERRO][API:content-planning/activity/[id]/read]', { id, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
