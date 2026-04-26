/**
 * pages/api/comercial/proposals/[id]/duplicate.js
 *   POST → clona proposta como draft com novo slug.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../lib/auth');
const proposals = require('../../../../../models/comercial/proposal.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:proposals/[id]/duplicate]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;
    const { id } = req.query;

    const created = await proposals.duplicateProposal(id, tenantId, userId);
    return res.status(201).json({ success: true, proposal: created });
  } catch (err) {
    console.error('[ERRO][API:duplicate]', { error: err.message });
    const status = /não encontrada/i.test(err.message) ? 404 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
}
