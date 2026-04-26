/**
 * pages/api/comercial/pipeline/leads/[id]/activities/[actId].js
 *   DELETE → remove activity (autor ou admin/god)
 */

import { resolveTenantId } from '../../../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../../../lib/auth');
const { queryOne } = require('../../../../../../../infra/db');
const activity = require('../../../../../../../models/comercial/activity.model');

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:activities/delete]', { actId: req.query?.actId });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    // Resolve role do usuário pra decidir se pode deletar de outros
    const me = userId
      ? await queryOne(`SELECT role FROM tenants WHERE id = $1`, [userId])
      : null;
    const isAdmin = me && (me.role === 'admin' || me.role === 'god');

    const { actId } = req.query;
    const ok = await activity.deleteActivity(tenantId, actId, userId, isAdmin);
    if (!ok) return res.status(404).json({ success: false, error: 'Activity não encontrada' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[ERRO][API:activities/delete]', { error: err.message });
    const status = /permissão/i.test(err.message) ? 403 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
}
