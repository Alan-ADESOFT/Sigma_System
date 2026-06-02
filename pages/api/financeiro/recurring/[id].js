/**
 * pages/api/financeiro/recurring/[id].js
 * Custos recorrentes — operações por id (admin only).
 * PUT    → atualiza um custo recorrente (inclui toggle is_active)
 * DELETE → remove um custo recorrente
 */

const { requireAdmin, handleAuthError } = require('../../../../lib/api-auth');
const model = require('../../../../models/recurringCost.model');

export default async function handler(req, res) {
  let user;
  try {
    user = await requireAdmin(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    console.error('[ERRO][API:/api/financeiro/recurring/[id]] auth', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
  const tenantId = user.tenant_id;
  const { id } = req.query;

  try {
    if (req.method === 'PUT') {
      const { description, value, category_id, day_of_month, frequency, is_active, notes } = req.body || {};
      const item = await model.updateRecurringCost(id, tenantId, {
        description, value, category_id, day_of_month, frequency, is_active, notes,
      });
      if (!item) return res.status(404).json({ success: false, error: 'Custo recorrente não encontrado' });
      console.log('[SUCESSO][API:/api/financeiro/recurring/[id]] Atualizado', { id });
      return res.json({ success: true, item });
    }

    if (req.method === 'DELETE') {
      const row = await model.deleteRecurringCost(id, tenantId);
      if (!row) return res.status(404).json({ success: false, error: 'Custo recorrente não encontrado' });
      console.log('[SUCESSO][API:/api/financeiro/recurring/[id]] Removido', { id });
      return res.json({ success: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:/api/financeiro/recurring/[id]]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
