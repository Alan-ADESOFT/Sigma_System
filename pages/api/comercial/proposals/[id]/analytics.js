/**
 * pages/api/comercial/proposals/[id]/analytics.js
 *   GET → agregados de visualizações.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const proposals = require('../../../../../models/comercial/proposal.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:proposals/[id]/analytics]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    const analytics = await proposals.getProposalAnalytics(id, tenantId);
    if (!analytics) return res.status(404).json({ success: false, error: 'Proposta não encontrada' });
    return res.json({ success: true, analytics });
  } catch (err) {
    console.error('[ERRO][API:analytics]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
