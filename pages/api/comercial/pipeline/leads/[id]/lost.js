/**
 * pages/api/comercial/pipeline/leads/[id]/lost.js
 *   POST → fecha lead como perdido. Body: { reason }
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../../lib/auth');
const { closeAsLost } = require('../../../../../../models/comercial/closing');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:lost]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { id } = req.query;
    const { reason } = req.body || {};

    const result = await closeAsLost(tenantId, id, { reason }, userId);
    return res.json({ success: true, pipelineLead: result.pipelineLead });
  } catch (err) {
    console.error('[ERRO][API:lost]', { error: err.message });
    const status = /não encontrad/i.test(err.message) ? 404 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
}
