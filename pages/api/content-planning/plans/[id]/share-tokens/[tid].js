/**
 * pages/api/content-planning/plans/[id]/share-tokens/[tid].js
 *   DELETE             → revoga o token (mantém registro com status='revoked')
 *   DELETE ?hard=1     → remove o registro completamente do banco
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const shareTokenModel = require('../../../../../../models/contentPlanning/shareToken');
const { queryOne } = require('../../../../../../infra/db');

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { id: planId, tid, hard } = req.query;
  const isHardDelete = hard === '1' || hard === 'true';

  if (!planId || !tid) return res.status(400).json({ success: false, error: 'id e tid obrigatorios' });

  try {
    const plan = await queryOne(
      'SELECT id FROM content_plans WHERE id = $1 AND tenant_id = $2',
      [planId, tenantId]
    );
    if (!plan) return res.status(404).json({ success: false, error: 'Planejamento nao encontrado' });

    if (isHardDelete) {
      const ok = await shareTokenModel.deleteToken(tid, tenantId);
      if (!ok) return res.status(404).json({ success: false, error: 'Token nao encontrado' });
      return res.json({ success: true, removed: true });
    }

    const token = await shareTokenModel.revokeToken(tid, tenantId);
    if (!token) return res.status(404).json({ success: false, error: 'Token nao encontrado' });
    return res.json({ success: true, revoked: true });
  } catch (err) {
    console.error('[ERRO][API:content-planning/plans/[id]/share-tokens/[tid]]', { planId, tid, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
