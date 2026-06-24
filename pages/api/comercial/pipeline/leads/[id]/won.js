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
const { closeAsWon } = require('../../../../../../models/comercial/closing');
const { createContractWithInstallments } = require('../../../../../../models/contract.model');

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

    // Campos obrigatórios pra um cliente utilizável (defesa server-side).
    if (!body.mainProduct || !String(body.mainProduct).trim() ||
        !body.avgTicket || !String(body.avgTicket).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Produto principal e ticket médio são obrigatórios para criar o cliente.',
      });
    }

    const result = await closeAsWon(tenantId, id, body, userId);

    // Cria contrato se informado (best-effort, não bloqueia o fluxo).
    // result.isNew === false = lead já estava fechado → não recria contrato (evita duplicata).
    if (body.contract && body.contract.contractValue && result.client && result.isNew !== false) {
      try {
        // client_contracts NÃO tem tenant_id (isolamento via client_id). Cria o
        // contrato JÁ com as parcelas — sem parcelas ele não apareceria no
        // financeiro global (que lista client_installments).
        const ni = body.contract.numInstallments ? Number(body.contract.numInstallments) : 12;
        const monthly = body.contract.monthlyValue
          ? Number(body.contract.monthlyValue)
          : (Number(body.contract.contractValue) / (ni || 1));
        await createContractWithInstallments(result.client.id, {
          monthly_value:    monthly,
          num_installments: ni,
          due_day:          body.contract.dueDay ? Number(body.contract.dueDay) : null,
          start_date:       body.contract.startDate || null,
          services:         body.contract.services || [],
        });
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
