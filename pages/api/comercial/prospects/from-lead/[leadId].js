/**
 * pages/api/comercial/prospects/from-lead/[leadId].js
 *   POST → cria/retorna prospect a partir de pipeline_lead. Idempotente.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../lib/auth');
const prospects = require('../../../../../models/comercial/prospect.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:comercial/prospects/from-lead]', { leadId: req.query?.leadId });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { leadId } = req.query;
    if (!leadId) return res.status(400).json({ success: false, error: 'leadId obrigatório' });

    const result = await prospects.getOrCreateFromPipelineLead(leadId, tenantId, userId);
    return res.json({ success: true, prospect: result.prospect, isNew: result.isNew });
  } catch (err) {
    console.error('[ERRO][API:from-lead]', { error: err.message });
    const status = /não encontrado/i.test(err.message) ? 404 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
}
