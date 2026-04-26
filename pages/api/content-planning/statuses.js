/**
 * pages/api/content-planning/statuses.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Colunas configuráveis do Kanban de Planejamento.
 *   GET   → lista (semeia 6 defaults na primeira chamada)
 *   POST  → cria status
 *   PUT   → reordena (body: { orderedIds: string[] })
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const statusModel = require('../../../models/contentPlanning/status');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      await statusModel.ensureDefaults(tenantId);
      const statuses = await statusModel.listStatuses(tenantId);
      return res.json({ success: true, statuses });
    }

    if (req.method === 'POST') {
      const { key, label, color, sort_order, is_default, is_terminal } = req.body || {};
      if (!key || !label) {
        return res.status(400).json({ success: false, error: 'key e label sao obrigatorios' });
      }
      const status = await statusModel.createStatus(tenantId, {
        key, label, color, sort_order, is_default, is_terminal,
      });
      return res.status(201).json({ success: true, status });
    }

    if (req.method === 'PUT') {
      const { orderedIds } = req.body || {};
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ success: false, error: 'orderedIds obrigatorio' });
      }
      const statuses = await statusModel.reorderStatuses(tenantId, orderedIds);
      return res.json({ success: true, statuses });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:content-planning/statuses]', { method: req.method, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
