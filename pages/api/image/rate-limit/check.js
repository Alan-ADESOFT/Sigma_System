/**
 * @fileoverview GET /api/image/rate-limit/check
 * @description Retorna o estado atual dos limites do usuário SEM decrementar.
 * Útil para mostrar "25/30 imagens hoje" no header do workspace.
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, isAdmin, handleAuthError } = require('../../../../lib/api-auth');
const { getRateLimitStatus } = require('../../../../infra/imageRateLimit');

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
  const tenantId = await resolveTenantId(req);

  const status = await getRateLimitStatus({
    tenantId,
    userId: user.id,
    isAdmin: isAdmin(user),
  });

  return res.json({ success: true, data: status });
}
