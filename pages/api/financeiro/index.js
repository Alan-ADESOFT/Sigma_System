/**
 * pages/api/financeiro/index.js
 * GET → retorna todas as parcelas (com info do cliente) + KPIs do tenant
 * PUT → delega para /api/clients/[id]/installments (toggle pago/pendente)
 */

import { query, queryOne } from '../../../infra/db';
import { resolveTenantId } from '../../../infra/get-tenant-id';

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      /* Todas as parcelas de todos os clientes ativos do tenant */
      const installments = await query(
        `SELECT
           i.id,
           i.installment_number,
           i.due_date,
           i.value,
           i.status,
           i.paid_at,
           i.notes        AS installment_notes,
           i.contract_id,
           mc.id          AS client_id,
           mc.company_name,
           mc.logo_url,
           cc.frequency,
           cc.contract_value AS total_contract_value,
           cc.status      AS contract_status
         FROM client_installments i
         JOIN marketing_clients mc ON mc.id = i.client_id
         JOIN client_contracts  cc ON cc.id = i.contract_id
         WHERE mc.tenant_id = $1
         ORDER BY i.due_date ASC`,
        [tenantId]
      );

      return res.json({ success: true, installments });
    }

    /* PUT — toggle status de uma parcela */
    if (req.method === 'PUT') {
      const { installmentId, clientId, status } = req.body;
      if (!installmentId || !clientId || !status) {
        return res.status(400).json({ success: false, error: 'installmentId, clientId e status são obrigatórios' });
      }
      if (!['paid', 'pending'].includes(status)) {
        return res.status(400).json({ success: false, error: 'status deve ser paid ou pending' });
      }
      const paidAt = status === 'paid' ? 'now()' : 'NULL';
      const row = await queryOne(
        `UPDATE client_installments
         SET status = $1, paid_at = ${paidAt}, updated_at = now()
         WHERE id = $2 AND client_id = $3 RETURNING *`,
        [status, installmentId, clientId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Parcela não encontrada' });
      return res.json({ success: true, installment: row });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[/api/financeiro]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
