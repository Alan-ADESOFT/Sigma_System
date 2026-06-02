/**
 * CRON: recurring-costs
 * Lança em company_finances todos os custos recorrentes do mês corrente ainda
 * não gerados. Idempotente via recurring_costs.last_generated_month.
 *
 * Observação: a geração também acontece via ensure-on-read no GET
 * /api/financeiro/company, então este cron é redundância/garantia para meses em
 * que ninguém abriu o Financeiro. Pode ser chamado manualmente a qualquer hora.
 *
 * @route POST /api/cron/recurring-costs
 * @protection Header x-internal-token (INTERNAL_API_TOKEN)
 * @schedule Sugerido: todo dia às 7h BRT → cron: 0 10 * * * (UTC)
 */
const { query } = require('../../../infra/db');
const recurringModel = require('../../../models/recurringCost.model');
const { verifyCronToken } = require('../../../lib/cron-auth');

function currentMonthBRT() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido' });

  if (!verifyCronToken(req)) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  console.log('[CRON][recurring-costs] Início');
  const monthKey = currentMonthBRT();
  let totalCreated = 0;
  const perTenant = {};

  try {
    const tenants = await query(`SELECT id FROM tenants WHERE is_active = true`);

    for (const tenant of tenants) {
      try {
        const created = await recurringModel.generateForMonth(tenant.id, monthKey);
        if (created > 0) {
          perTenant[tenant.id] = created;
          totalCreated += created;
        }
      } catch (err) {
        console.error('[CRON][recurring-costs] Falha no tenant', { tenantId: tenant.id, error: err.message });
      }
    }

    console.log('[CRON][recurring-costs] Fim', { monthKey, totalCreated, perTenant });
    return res.json({ success: true, monthKey, totalCreated, perTenant });
  } catch (err) {
    console.error('[ERRO][CRON][recurring-costs]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
