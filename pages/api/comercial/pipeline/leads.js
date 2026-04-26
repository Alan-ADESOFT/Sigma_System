/**
 * pages/api/comercial/pipeline/leads.js
 *   GET  → ?columnId=&assignedTo=&search=
 *   POST → cria lead manual (default columnId = 'start')
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../lib/auth');
const pipeline = require('../../../../models/comercial/pipeline.model');
const { calculateSigmaScore } = require('../../../../models/comercial/sigmaScore');

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/pipeline/leads]', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    if (req.method === 'GET') {
      // garante colunas default antes de consultar
      await pipeline.bootstrapDefaultColumns(tenantId);
      const leads = await pipeline.getLeads(tenantId, {
        columnId:   req.query.columnId,
        assignedTo: req.query.assignedTo,
        search:     req.query.search,
      });
      return res.json({ success: true, leads });
    }

    if (req.method === 'POST') {
      const data = req.body || {};
      if (!data.company_name || !String(data.company_name).trim()) {
        return res.status(400).json({ success: false, error: 'company_name obrigatório' });
      }
      // calcula sigma_score se não vier
      if (data.sigma_score == null) {
        data.sigma_score = calculateSigmaScore({
          google_rating: data.google_rating,
          review_count:  data.review_count,
          phone:         data.phone,
          website:       data.website,
          has_website:   !!(data.website && String(data.website).trim()),
        });
      }
      const lead = await pipeline.createLead(tenantId, data, userId);
      return res.status(201).json({ success: true, lead });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:comercial/pipeline/leads]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
