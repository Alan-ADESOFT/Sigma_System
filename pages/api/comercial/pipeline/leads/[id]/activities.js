/**
 * pages/api/comercial/pipeline/leads/[id]/activities.js
 *   GET  → lista timeline do lead
 *   POST → cria activity manual (apenas tipos 'note' e 'call_logged')
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../../lib/auth');
const pipeline = require('../../../../../../models/comercial/pipeline.model');
const activity = require('../../../../../../models/comercial/activity.model');

const MANUAL_TYPES = ['note', 'call_logged'];

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/pipeline/leads/[id]/activities]', { method: req.method, id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { id } = req.query;
    const lead = await pipeline.getLeadById(id, tenantId);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    if (req.method === 'GET') {
      const list = await activity.getActivitiesByLead(tenantId, id, { limit: 100 });
      return res.json({ success: true, activities: list });
    }

    if (req.method === 'POST') {
      const { type, content, metadata } = req.body || {};
      if (!MANUAL_TYPES.includes(type)) {
        return res.status(400).json({ success: false, error: `Tipo inválido (use: ${MANUAL_TYPES.join('|')})` });
      }
      if (!content || !String(content).trim()) {
        return res.status(400).json({ success: false, error: 'content obrigatório' });
      }
      const created = await activity.createActivity(tenantId, {
        pipelineLeadId: id,
        type,
        content: String(content).trim(),
        metadata: metadata || {},
        createdBy: userId,
      });
      return res.status(201).json({ success: true, activity: created });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:activities]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
