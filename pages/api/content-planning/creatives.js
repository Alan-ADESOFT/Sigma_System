/**
 * pages/api/content-planning/creatives.js
 *   POST → cria criativo dentro de um plano (body: { planId, ...campos })
 *   PUT  → reordena em lote (body: { planId, orderedIds: string[] })
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const creativeModel = require('../../../models/contentPlanning/creative');
const { queryOne } = require('../../../infra/db');

async function ensurePlanInTenant(planId, tenantId) {
  if (!planId) return false;
  const plan = await queryOne(
    'SELECT id FROM content_plans WHERE id = $1 AND tenant_id = $2',
    [planId, tenantId]
  );
  return !!plan;
}

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'POST') {
      const { planId, ...fields } = req.body || {};
      if (!planId) return res.status(400).json({ success: false, error: 'planId obrigatorio' });

      const inTenant = await ensurePlanInTenant(planId, tenantId);
      if (!inTenant) return res.status(404).json({ success: false, error: 'Planejamento nao encontrado' });

      const creative = await creativeModel.createCreative(tenantId, planId, fields);
      return res.status(201).json({ success: true, creative });
    }

    if (req.method === 'PUT') {
      const { planId, orderedIds } = req.body || {};
      if (!planId) return res.status(400).json({ success: false, error: 'planId obrigatorio' });
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ success: false, error: 'orderedIds obrigatorio' });
      }

      const inTenant = await ensurePlanInTenant(planId, tenantId);
      if (!inTenant) return res.status(404).json({ success: false, error: 'Planejamento nao encontrado' });

      const creatives = await creativeModel.reorderCreatives(planId, tenantId, orderedIds);
      return res.json({ success: true, creatives });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    if (err.message === 'plan_not_found') {
      return res.status(404).json({ success: false, error: 'Planejamento nao encontrado' });
    }
    console.error('[ERRO][API:content-planning/creatives]', { method: req.method, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
