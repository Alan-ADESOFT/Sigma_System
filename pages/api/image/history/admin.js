/**
 * @fileoverview GET /api/image/history/admin
 * @description Listagem completa para admin: TODOS os jobs do tenant nos
 * últimos 7 dias com nome de usuário e cliente. 403 para não-admin.
 *
 * Query params: ?days=7&limit=100&offset=0
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, isAdmin, handleAuthError } = require('../../../../lib/api-auth');
const { getRecentJobsAdmin } = require('../../../../models/imageJob.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  if (!isAdmin(user)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito a admin' });
  }
  const tenantId = await resolveTenantId(req);

  const days   = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 30);
  const limit  = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  const items = await getRecentJobsAdmin({ tenantId, days, limit, offset });

  console.log('[INFO][API:image/history/admin] listagem admin', {
    tenantId, userId: user.id, days, count: items.length,
  });

  return res.json({
    success: true,
    data: items,
    pagination: { days, limit, offset, returned: items.length },
  });
}
