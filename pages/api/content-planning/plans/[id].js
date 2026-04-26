/**
 * pages/api/content-planning/plans/[id].js
 *   GET    → plano completo (com criativos)
 *   PUT    → atualiza plano (loga status_changed quando aplicavel)
 *   DELETE → remove plano (CASCADE)
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../lib/auth');
const planModel = require('../../../../models/contentPlanning/plan');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;
  const session = verifyToken(req.cookies?.sigma_token);
  const userId = session?.userId || null;

  if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  try {
    if (req.method === 'GET') {
      const plan = await planModel.getPlanById(id, tenantId);
      if (!plan) return res.status(404).json({ success: false, error: 'Planejamento nao encontrado' });
      return res.json({ success: true, plan });
    }

    if (req.method === 'PUT') {
      const {
        title, monthReference, objective, centralPromise, strategyNotes,
        statusId, ownerId, dueDate, isTemplate, metadata,
      } = req.body || {};

      const plan = await planModel.updatePlan(id, tenantId, {
        title: title != null ? title : null,
        month_reference: monthReference != null ? monthReference : null,
        objective: objective != null ? objective : null,
        central_promise: centralPromise != null ? centralPromise : null,
        strategy_notes: strategyNotes != null ? strategyNotes : null,
        status_id: statusId != null ? statusId : null,
        owner_id: ownerId != null ? ownerId : null,
        due_date: dueDate != null ? dueDate : null,
        is_template: typeof isTemplate === 'boolean' ? isTemplate : null,
        metadata: metadata != null ? metadata : null,
        actor_id: userId,
      });

      if (!plan) return res.status(404).json({ success: false, error: 'Planejamento nao encontrado' });
      return res.json({ success: true, plan });
    }

    if (req.method === 'DELETE') {
      const ok = await planModel.deletePlan(id, tenantId);
      if (!ok) return res.status(404).json({ success: false, error: 'Planejamento nao encontrado' });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:content-planning/plans/[id]]', { id, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
