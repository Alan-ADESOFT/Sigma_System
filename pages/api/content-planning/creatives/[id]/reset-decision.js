/**
 * pages/api/content-planning/creatives/[id]/reset-decision.js
 *   POST → reseta client_decision/rating/reason/notes/decided_at do criativo.
 *          Usado quando a equipe edita um criativo já aprovado: a peça volta
 *          a aparecer como pendente no link público de aprovação.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const creativeModel = require('../../../../../models/contentPlanning/creative');
const activityModel = require('../../../../../models/contentPlanning/activity');
const { verifyToken } = require('../../../../../lib/auth');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { id } = req.query;
  const session = verifyToken(req.cookies?.sigma_token);
  const userId = session?.userId || null;

  if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  try {
    const creative = await creativeModel.resetClientDecision(id, tenantId);
    if (!creative) return res.status(404).json({ success: false, error: 'Criativo nao encontrado' });

    await activityModel.logActivity(tenantId, creative.plan_id, {
      creativeId: creative.id,
      actorType: 'internal',
      actorId: userId,
      eventType: 'version_saved', // reaproveita type — ja existe no enum/log; payload diferencia
      payload: { kind: 'reopen_for_client', creative_id: creative.id },
    });

    return res.json({ success: true, creative });
  } catch (err) {
    console.error('[ERRO][API:content-planning/creatives/[id]/reset-decision]', { id, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
