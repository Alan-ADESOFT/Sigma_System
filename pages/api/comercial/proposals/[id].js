/**
 * pages/api/comercial/proposals/[id].js
 *   GET    → detalhe completo
 *   PUT    → merge JSONB no campo data ({ data: {...patch} })
 *   DELETE → hard delete
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const proposals = require('../../../../models/comercial/proposal.model');

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/proposals/[id]]', { method: req.method, id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

    if (req.method === 'GET') {
      const proposal = await proposals.getProposalById(id, tenantId);
      if (!proposal) return res.status(404).json({ success: false, error: 'Proposta não encontrada' });
      return res.json({ success: true, proposal });
    }

    if (req.method === 'PUT') {
      const { data } = req.body || {};
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ success: false, error: 'body.data (object) obrigatório' });
      }
      const updated = await proposals.updateProposalData(id, tenantId, data);
      if (!updated) return res.status(404).json({ success: false, error: 'Proposta não encontrada' });
      return res.json({ success: true, proposal: updated });
    }

    if (req.method === 'DELETE') {
      await proposals.deleteProposal(id, tenantId);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:proposals/[id]]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
