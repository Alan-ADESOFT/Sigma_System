/**
 * pages/api/comercial/pipeline/leads/[id]/move.js
 *   POST → { columnId, sortOrder? } → move lead, atualiza last_activity_at
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../../lib/auth');
const pipeline = require('../../../../../../models/comercial/pipeline.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:comercial/pipeline/leads/[id]/move]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { id } = req.query;
    const { columnId, sortOrder } = req.body || {};
    if (!columnId) {
      return res.status(400).json({ success: false, error: 'columnId obrigatório' });
    }
    const lead = await pipeline.moveLead(id, tenantId, { columnId, sortOrder }, userId);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    return res.json({ success: true, lead });
  } catch (err) {
    console.error('[ERRO][API:comercial/pipeline/leads/[id]/move]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
