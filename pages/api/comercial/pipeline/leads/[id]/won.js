/**
 * pages/api/comercial/pipeline/leads/[id]/won.js
 *   POST → fecha lead como ganho. Cria marketing_client.
 *
 * Body: {
 *   mainProduct, niche, region, avgTicket, observations,
 *   contract?: { contractValue, monthlyValue, numInstallments, dueDay, startDate, services }
 * }
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../../lib/auth');
const { query } = require('../../../../../../infra/db');
const { closeAsWon } = require('../../../../../../models/comercial/closing');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:won]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { id } = req.query;
    const body = req.body || {};

    const result = await closeAsWon(tenantId, id, body, userId);

    // Cria contrato se informado (best-effort, não bloqueia o fluxo)
    if (body.contract && body.contract.contractValue && result.client) {
      try {
        await query(
          `INSERT INTO client_contracts
             (tenant_id, client_id, contract_value, monthly_value, num_installments, due_day, start_date, services, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'active')`,
          [
            tenantId,
            result.client.id,
            Number(body.contract.contractValue),
            body.contract.monthlyValue ? Number(body.contract.monthlyValue) : null,
            body.contract.numInstallments ? Number(body.contract.numInstallments) : null,
            body.contract.dueDay ? Number(body.contract.dueDay) : null,
            body.contract.startDate || null,
            JSON.stringify(body.contract.services || []),
          ]
        );
      } catch (err) {
        console.warn('[WARN][API:won] Falha ao criar contract — cliente foi criado mesmo assim', { error: err.message });
      }
    }

    return res.json({
      success: true,
      clientId: result.client.id,
      isNew: result.isNew !== false,
      redirectTo: `/dashboard/clients/${result.client.id}`,
    });
  } catch (err) {
    console.error('[ERRO][API:won]', { error: err.message, stack: err.stack });
    const status = /não encontrad/i.test(err.message) ? 404 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
}
