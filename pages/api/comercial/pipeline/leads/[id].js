/**
 * pages/api/comercial/pipeline/leads/[id].js
 *   GET    → detalhe completo
 *   PUT    → atualiza qualquer campo editável
 *   DELETE → deleta
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const pipeline = require('../../../../../models/comercial/pipeline.model');

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/pipeline/leads/[id]]', { method: req.method, id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

    if (req.method === 'GET') {
      const lead = await pipeline.getLeadById(id, tenantId);
      if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
      return res.json({ success: true, lead });
    }

    if (req.method === 'PUT') {
      const lead = await pipeline.updateLead(id, tenantId, req.body || {});
      if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
      return res.json({ success: true, lead });
    }

    if (req.method === 'DELETE') {
      await pipeline.deleteLead(id, tenantId);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:comercial/pipeline/leads/[id]]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
