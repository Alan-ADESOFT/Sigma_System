/**
 * pages/api/financeiro/recurring/index.js
 * Custos recorrentes (admin only).
 * GET  → lista os custos recorrentes do tenant
 * POST → cria um novo custo recorrente
 */

const { requireAdmin, handleAuthError } = require('../../../../lib/api-auth');
const model = require('../../../../models/recurringCost.model');

export default async function handler(req, res) {
  let user;
  try {
    user = await requireAdmin(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    console.error('[ERRO][API:/api/financeiro/recurring] auth', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
  const tenantId = user.tenant_id;

  try {
    if (req.method === 'GET') {
      const items = await model.getRecurringCosts(tenantId);
      return res.json({ success: true, items });
    }

    if (req.method === 'POST') {
      const { description, value, category_id, day_of_month, frequency, notes } = req.body || {};
      if (!description || !description.trim()) {
        return res.status(400).json({ success: false, error: 'Descrição é obrigatória' });
      }
      const val = parseFloat(value);
      if (!val || val <= 0) {
        return res.status(400).json({ success: false, error: 'Valor inválido' });
      }
      const dom = parseInt(day_of_month, 10) || 1;
      if (dom < 1 || dom > 31) {
        return res.status(400).json({ success: false, error: 'Dia do mês deve estar entre 1 e 31' });
      }
      const item = await model.createRecurringCost(tenantId, {
        description: description.trim(), value: val, category_id: category_id || null,
        day_of_month: dom, frequency: frequency || 'monthly', notes: notes || null,
      });
      console.log('[SUCESSO][API:/api/financeiro/recurring] Custo recorrente criado', { id: item.id });
      return res.status(201).json({ success: true, item });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:/api/financeiro/recurring]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
