/**
 * pages/api/content-planning/plans.js
 *   GET  → lista planos com filtros e agregados
 *   POST → cria plano
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const { verifyToken } = require('../../../lib/auth');
const planModel = require('../../../models/contentPlanning/plan');
const statusModel = require('../../../models/contentPlanning/status');

export default async function handler(req, res) {
  console.log('[INFO][API:content-planning/plans]', { method: req.method });

  const tenantId = await resolveTenantId(req);
  const session = verifyToken(req.cookies?.sigma_token);
  const userId = session?.userId || null;

  try {
    // Garante que os 6 status default existem para este tenant
    await statusModel.ensureDefaults(tenantId);

    if (req.method === 'GET') {
      const { clientId, statusId, ownerId, isTemplate, search, limit, offset } = req.query;
      const plans = await planModel.listPlans(tenantId, {
        clientId,
        statusId,
        ownerId,
        isTemplate: isTemplate === 'true' ? true : isTemplate === 'false' ? false : undefined,
        search,
        limit: limit ? Math.max(1, Math.min(200, parseInt(limit, 10))) : 50,
        offset: offset ? Math.max(0, parseInt(offset, 10)) : 0,
      });
      return res.json({ success: true, plans });
    }

    if (req.method === 'POST') {
      const {
        clientId, title, monthReference, objective, centralPromise, strategyNotes,
        dueDate, ownerId, statusId, isTemplate, templateSource, metadata,
      } = req.body || {};

      if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatorio' });
      if (!title || !title.trim()) return res.status(400).json({ success: false, error: 'title obrigatorio' });

      const plan = await planModel.createPlan(tenantId, {
        client_id: clientId,
        title: title.trim(),
        month_reference: monthReference || null,
        objective: objective || null,
        central_promise: centralPromise || null,
        strategy_notes: strategyNotes || null,
        due_date: dueDate || null,
        owner_id: ownerId || null,
        status_id: statusId || null,
        is_template: !!isTemplate,
        template_source: templateSource || null,
        metadata: metadata || null,
        actor_id: userId,
      });
      return res.status(201).json({ success: true, plan });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:content-planning/plans]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
