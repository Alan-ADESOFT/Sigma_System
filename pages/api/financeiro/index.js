/**
 * pages/api/financeiro/index.js
 * GET → retorna todas as parcelas (com info do cliente e serviços do contrato) + KPIs
 * PUT → toggle pago/pendente de uma parcela
 */

import { query, queryOne } from '../../../infra/db';
import { resolveTenantId } from '../../../infra/get-tenant-id';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/financeiro] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
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
           cc.monthly_value,
           cc.num_installments,
           cc.services    AS contract_services,
           cc.status      AS contract_status
         FROM client_installments i
         JOIN marketing_clients mc ON mc.id = i.client_id
         JOIN client_contracts  cc ON cc.id = i.contract_id
         WHERE mc.tenant_id = $1
         ORDER BY i.due_date ASC`,
        [tenantId]
      );

      console.log('[SUCESSO][API:/api/financeiro] Resposta enviada', { installmentCount: installments.length });
      return res.json({ success: true, installments });
    }

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
      console.log('[SUCESSO][API:/api/financeiro] Parcela atualizada', { installmentId, clientId, status });
      return res.json({ success: true, installment: row });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:/api/financeiro] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
