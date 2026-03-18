import { getClientsByTenant, createClient, seedStages } from '../../../models/client.model';
import { query, queryOne } from '../../../infra/db';
import { resolveTenantId } from '../../../infra/get-tenant-id';

function buildInstallments(contractId, clientId, monthlyValue, numInstallments, dueDay, startDate) {
  const installments = [];
  const base = new Date(startDate);
  for (let i = 0; i < numInstallments; i++) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dueDay, lastDay));
    installments.push({
      contractId, clientId, num: i + 1,
      dueDate: d.toISOString().split('T')[0],
      value: monthlyValue,
    });
  }
  return installments;
}

export default async function handler(req, res) {
  console.log('[INFO][API:/api/clients] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const clients = await getClientsByTenant(tenantId);
      console.log('[SUCESSO][API:/api/clients] Resposta enviada', { count: clients.length });
      return res.json({ success: true, clients });
    }

    if (req.method === 'POST') {
      const { company_name, contract, ...rest } = req.body;
      if (!company_name) {
        return res.status(400).json({ success: false, error: 'Nome da empresa obrigatorio' });
      }

      const client = await createClient(tenantId, { company_name, ...rest });
      await seedStages(client.id);

      /* Cria contrato automaticamente se enviado */
      if (contract && contract.monthly_value > 0) {
        const mv = parseFloat(contract.monthly_value);
        const ni = parseInt(contract.num_installments) || 12;
        const totalValue = mv * ni;
        const day = Math.min(Math.max(parseInt(contract.due_day) || 10, 1), 31);
        const startDate = contract.start_date || new Date().toISOString().split('T')[0];

        const ct = await queryOne(
          `INSERT INTO client_contracts
             (client_id, contract_value, monthly_value, num_installments, frequency, period_months, due_day, start_date, services, notes)
           VALUES ($1, $2, $3, $4, 'monthly', $4, $5, $6, $7, $8) RETURNING *`,
          [client.id, totalValue, mv, ni, day, startDate,
           JSON.stringify(contract.services || []), contract.notes || null]
        );

        const rows = buildInstallments(ct.id, client.id, mv, ni, day, startDate);
        for (const r of rows) {
          await queryOne(
            `INSERT INTO client_installments (contract_id, client_id, installment_number, due_date, value)
             VALUES ($1, $2, $3, $4, $5)`,
            [r.contractId, r.clientId, r.num, r.dueDate, r.value]
          );
        }
      }

      console.log('[SUCESSO][API:/api/clients] Cliente criado', { clientId: client.id, company_name });
      return res.status(201).json({ success: true, client });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/clients] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
