/**
 * pages/api/clients/[id]/contracts.js
 * GET    → retorna TODOS os contratos + parcelas do cliente
 * POST   → cria contrato (valor mensal × parcelas) + gera parcelas automaticamente
 * PUT    → atualiza contrato (valor, serviços, notas, status) + regenera parcelas se necessário
 * DELETE → remove contrato e suas parcelas
 */

import { query, queryOne } from '../../../../infra/db';
import { getClientById } from '../../../../models/client.model';
import { resolveTenantId } from '../../../../infra/get-tenant-id';

function buildInstallments(contractId, clientId, monthlyValue, numInstallments, dueDay, startDate) {
  const installments = [];
  const base = new Date(startDate);

  for (let i = 0; i < numInstallments; i++) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dueDay, lastDay));
    installments.push({
      contractId,
      clientId,
      num: i + 1,
      dueDate: d.toISOString().split('T')[0],
      value: monthlyValue,
    });
  }
  return installments;
}

export default async function handler(req, res) {
  console.log('[INFO][API:/api/clients/:id/contracts] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);
  const { id: clientId } = req.query;

  try {
    const client = await getClientById(clientId, tenantId);
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

    /* ── GET — retorna todos os contratos + parcelas ── */
    if (req.method === 'GET') {
      const contracts = await query(
        `SELECT * FROM client_contracts WHERE client_id = $1 ORDER BY created_at DESC`,
        [clientId]
      );

      const result = [];
      for (const c of contracts) {
        const installments = await query(
          `SELECT * FROM client_installments WHERE contract_id = $1 ORDER BY installment_number ASC`,
          [c.id]
        );
        result.push({ ...c, installments });
      }

      console.log('[SUCESSO][API:/api/clients/:id/contracts] Resposta enviada', { clientId, contractCount: result.length });
      return res.json({ success: true, contracts: result });
    }

    /* ── POST — cria contrato + parcelas ── */
    if (req.method === 'POST') {
      const { monthly_value, num_installments, due_day, start_date, notes, services } = req.body;

      if (!monthly_value || !start_date) {
        return res.status(400).json({ success: false, error: 'monthly_value e start_date são obrigatórios' });
      }

      const mv = parseFloat(monthly_value);
      const ni = parseInt(num_installments) || 12;
      const totalValue = mv * ni;
      const day = Math.min(Math.max(parseInt(due_day) || 10, 1), 31);

      const contract = await queryOne(
        `INSERT INTO client_contracts
           (client_id, contract_value, monthly_value, num_installments, frequency, period_months, due_day, start_date, services, notes)
         VALUES ($1, $2, $3, $4, 'monthly', $4, $5, $6, $7, $8) RETURNING *`,
        [clientId, totalValue, mv, ni, day, start_date, JSON.stringify(services || []), notes || null]
      );

      const rows = buildInstallments(contract.id, clientId, mv, ni, day, start_date);
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
      console.log('[SUCESSO][API:/api/clients/:id/contracts] Contrato criado', { clientId, contractId: contract.id, installmentCount: installments.length });
      return res.json({ success: true, contract: { ...contract, installments } });
    }

    /* ── PUT — edita contrato ── */
    if (req.method === 'PUT') {
      const { contractId, monthly_value, num_installments, due_day, start_date, notes, status, services } = req.body;
      if (!contractId) return res.status(400).json({ success: false, error: 'contractId é obrigatório' });

      const existing = await queryOne(`SELECT * FROM client_contracts WHERE id = $1 AND client_id = $2`, [contractId, clientId]);
      if (!existing) return res.status(404).json({ success: false, error: 'Contrato não encontrado' });

      const needsRegenerate = monthly_value !== undefined || num_installments !== undefined || due_day !== undefined || start_date !== undefined;

      const mv = parseFloat(monthly_value) || parseFloat(existing.monthly_value) || parseFloat(existing.contract_value);
      const ni = parseInt(num_installments) || existing.num_installments || 12;
      const totalValue = mv * ni;
      const day = due_day !== undefined ? Math.min(Math.max(parseInt(due_day), 1), 31) : existing.due_day;
      const sd = start_date || existing.start_date;

      const contract = await queryOne(
        `UPDATE client_contracts SET
           contract_value  = $2,
           monthly_value   = $3,
           num_installments = $4,
           due_day         = $5,
           start_date      = $6,
           notes           = COALESCE($7, notes),
           status          = COALESCE($8, status),
           services        = COALESCE($9::jsonb, services),
           updated_at      = now()
         WHERE id = $1 AND client_id = $10 RETURNING *`,
        [contractId, totalValue, mv, ni, day, sd, notes ?? null, status ?? null,
         services !== undefined ? JSON.stringify(services) : null, clientId]
      );

      if (needsRegenerate) {
        // Remove parcelas não pagas e regenera
        await query(`DELETE FROM client_installments WHERE contract_id = $1 AND status != 'paid'`, [contractId]);
        const paidCount = await query(`SELECT COUNT(*) as cnt FROM client_installments WHERE contract_id = $1 AND status = 'paid'`, [contractId]);
        const alreadyPaid = parseInt(paidCount[0]?.cnt) || 0;

        const rows = buildInstallments(contractId, clientId, mv, ni, day, sd);
        // Só insere parcelas que ainda não existem (a partir de alreadyPaid + 1)
        for (const r of rows) {
          if (r.num > alreadyPaid) {
            await queryOne(
              `INSERT INTO client_installments (contract_id, client_id, installment_number, due_date, value)
               VALUES ($1, $2, $3, $4, $5)`,
              [r.contractId, r.clientId, r.num, r.dueDate, r.value]
            );
          }
        }
      }

      const installments = await query(
        `SELECT * FROM client_installments WHERE contract_id = $1 ORDER BY installment_number ASC`,
        [contractId]
      );
      console.log('[SUCESSO][API:/api/clients/:id/contracts] Contrato atualizado', { clientId, contractId });
      return res.json({ success: true, contract: { ...contract, installments } });
    }

    /* ── DELETE — remove contrato e parcelas ── */
    if (req.method === 'DELETE') {
      const { contractId } = req.body || {};
      if (!contractId) return res.status(400).json({ success: false, error: 'contractId é obrigatório' });

      await query(`DELETE FROM client_installments WHERE contract_id = $1`, [contractId]);
      await query(`DELETE FROM client_contracts WHERE id = $1 AND client_id = $2`, [contractId, clientId]);

      console.log('[SUCESSO][API:/api/clients/:id/contracts] Contrato removido', { clientId, contractId });
      return res.json({ success: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:/api/clients/:id/contracts] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
