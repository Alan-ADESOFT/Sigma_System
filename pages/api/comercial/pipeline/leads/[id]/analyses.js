/**
 * pages/api/comercial/pipeline/leads/[id]/analyses.js
 *   GET → histórico de análises (últimas 5) + análise atual completa.
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const pipeline = require('../../../../../../models/comercial/pipeline.model');
const { getLatestAnalysis, getAnalysisHistory } = require('../../../../../../models/comercial/leadAnalysis.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:comercial/pipeline/leads/[id]/analyses]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    const lead = await pipeline.getLeadById(id, tenantId);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    const latest  = await getLatestAnalysis(tenantId, id);
    const history = await getAnalysisHistory(tenantId, id, 5);

    return res.json({
      success: true,
      latest,
      history,
      cachedAt: lead.ai_analyzed_at || null,
    });
  } catch (err) {
    console.error('[ERRO][API:analyses]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
