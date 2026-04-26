/**
 * @fileoverview POST /api/image/jobs/:id/star — toggle de favorito
 */

const { resolveTenantId } = require('../../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../../lib/api-auth');
const { toggleStar } = require('../../../../../models/imageJob.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  const row = await toggleStar(id, tenantId);
  if (!row) return res.status(404).json({ success: false, error: 'Job não encontrado' });

  return res.json({ success: true, data: { id: row.id, is_starred: row.is_starred } });
}
