/**
 * pages/api/comercial/pipeline/leads/[id]/analyze-status.js
 *   GET → retorna { running: bool, jobId? } para client reconectar ao SSE.
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { getActive } = require('../../../../../../infra/jobLock');
const pipeline = require('../../../../../../models/comercial/pipeline.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    const lead = await pipeline.getLeadById(id, tenantId);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    const active = getActive('lead_analysis', id);
    return res.json({
      success: true,
      running: !!active,
      jobId: active?.jobId || null,
      startedAt: active?.startedAt || null,
    });
  } catch (err) {
    console.error('[ERRO][API:analyze-status]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
