/**
 * pages/api/comercial/proposals.js
 *   GET  → ?status=&search=&prospectId=
 *   POST → body { prospectId, baseData? } → cria draft
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const { verifyToken } = require('../../../lib/auth');
const proposals = require('../../../models/comercial/proposal.model');
const { getSetting } = require('../../../models/settings.model');

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/proposals]', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    if (req.method === 'GET') {
      const { status, prospectId, search, limit, offset } = req.query;
      const list = await proposals.listProposals(tenantId, {
        status, prospectId, search,
        limit: limit ? Math.max(1, Math.min(200, parseInt(limit, 10))) : 100,
        offset: offset ? Math.max(0, parseInt(offset, 10)) : 0,
      });
      return res.json({ success: true, proposals: list });
    }

    if (req.method === 'POST') {
      const { prospectId, baseData } = req.body || {};
      if (!prospectId) {
        return res.status(400).json({ success: false, error: 'prospectId obrigatório' });
      }
      // expires_at default vem do setting; ainda como rascunho ele não expira
      const ttlCfg = await getSetting(tenantId, 'comercial_proposal_ttl_days');
      const ttlDays = Number(ttlCfg) > 0 ? Number(ttlCfg) : 7;
      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

      const proposal = await proposals.createProposal(tenantId, {
        prospectId,
        data: baseData || {},
        createdBy: userId,
        expiresAt,
      });
      return res.status(201).json({ success: true, proposal });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:comercial/proposals]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
