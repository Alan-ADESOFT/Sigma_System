/**
 * pages/api/content-planning/plans/[id]/clone.js
 *   POST → clona o plano (e criativos) com overrides opcionais
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../lib/auth');
const planModel = require('../../../../../models/contentPlanning/plan');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { id: sourceId } = req.query;
  const session = verifyToken(req.cookies?.sigma_token);
  const userId = session?.userId || null;

  if (!sourceId) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  try {
    const { clientId, title, monthReference, ownerId, dueDate, isTemplate } = req.body || {};

    const plan = await planModel.clonePlan(sourceId, tenantId, {
      client_id: clientId || undefined,
      title: title || undefined,
      month_reference: monthReference !== undefined ? monthReference : undefined,
      owner_id: ownerId !== undefined ? ownerId : undefined,
      due_date: dueDate !== undefined ? dueDate : undefined,
      is_template: typeof isTemplate === 'boolean' ? isTemplate : undefined,
      actor_id: userId,
    });

    return res.status(201).json({ success: true, plan });
  } catch (err) {
    if (err.message === 'source_plan_not_found') {
      return res.status(404).json({ success: false, error: 'Plano de origem nao encontrado' });
    }
    console.error('[ERRO][API:content-planning/plans/[id]/clone]', { sourceId, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
