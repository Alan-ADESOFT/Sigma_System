/**
 * pages/api/clients/[id]/contracts.js
 * GET  → retorna { contract, installments } do cliente
 * POST → cria contrato + gera parcelas automaticamente
 * PUT  → atualiza dados do contrato (sem alterar parcelas)
 */

import { query, queryOne } from '../../../../infra/db';
import { getClientById } from '../../../../models/client.model';
import { resolveTenantId } from '../../../../infra/get-tenant-id';

/* ── Gera as datas de vencimento das parcelas ── */
function buildInstallments(contractId, clientId, contractValue, frequency, periodMonths, dueDay, startDate) {
  const freqMap = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, one_time: 9999 };
  const freqMonths = freqMap[frequency] ?? 1;
  const numInstallments = frequency === 'one_time' ? 1 : Math.ceil(periodMonths / freqMonths);
  const valueEach = parseFloat((contractValue / numInstallments).toFixed(2));

  const installments = [];
  const base = new Date(startDate);

  for (let i = 0; i < numInstallments; i++) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i * freqMonths);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dueDay, lastDay));
    installments.push({
      contractId,
      clientId,
      num: i + 1,
      dueDate: d.toISOString().split('T')[0],
      value: valueEach,
    });
  }
  return installments;
}

export default async function handler(req, res) {
  const tenantId   = await resolveTenantId(req);
  const { id: clientId } = req.query;

  try {
    const client = await getClientById(clientId, tenantId);
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

    /* ── GET ── */
    if (req.method === 'GET') {
      const contract = await queryOne(
        `SELECT * FROM client_contracts WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [clientId]
      );
      if (!contract) return res.json({ success: true, contract: null, installments: [] });

      const installments = await query(
        `SELECT * FROM client_installments WHERE contract_id = $1 ORDER BY installment_number ASC`,
        [contract.id]
      );
      return res.json({ success: true, contract, installments });
    }

    /* ── POST — cria contrato + parcelas ── */
    if (req.method === 'POST') {
      const { contract_value, frequency, period_months, due_day, start_date, notes } = req.body;

      if (!contract_value || !start_date) {
        return res.status(400).json({ success: false, error: 'contract_value e start_date são obrigatórios' });
      }

      const val  = parseFloat(contract_value);
      const freq = frequency || 'monthly';
      const per  = parseInt(period_months) || 12;
      const day  = Math.min(Math.max(parseInt(due_day) || 10, 1), 31);

      // Cria contrato
      const contract = await queryOne(
        `INSERT INTO client_contracts (client_id, contract_value, frequency, period_months, due_day, start_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [clientId, val, freq, per, day, start_date, notes || null]
      );

      // Gera e insere parcelas
      const rows = buildInstallments(contract.id, clientId, val, freq, per, day, start_date);
      for (const r of rows) {
        await queryOne(
          `INSERT INTO client_installments (contract_id, client_id, installment_number, due_date, value)
           VALUES ($1, $2, $3, $4, $5)`,
          [r.contractId, r.clientId, r.num, r.dueDate, r.value]
        );
      }

      const installments = await query(
        `SELECT * FROM client_installments WHERE contract_id = $1 ORDER BY installment_number ASC`,
        [contract.id]
      );
      return res.json({ success: true, contract, installments });
    }

    /* ── PUT — edita contrato (sem regenerar parcelas) ── */
    if (req.method === 'PUT') {
      const { contractId, notes, status } = req.body;
      if (!contractId) return res.status(400).json({ success: false, error: 'contractId é obrigatório' });

      const contract = await queryOne(
        `UPDATE client_contracts SET
           notes  = COALESCE($2, notes),
           status = COALESCE($3, status),
           updated_at = now()
         WHERE id = $1 AND client_id = $4 RETURNING *`,
        [contractId, notes ?? null, status ?? null, clientId]
      );
      return res.json({ success: true, contract });
    }

    return res.status(405).end();
  } catch (err) {
    console.error(`[/api/clients/${clientId}/contracts]`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
