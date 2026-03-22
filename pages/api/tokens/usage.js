/**
 * @fileoverview Endpoint: Dashboard de uso de tokens
 * @route GET /api/tokens/usage?period=month|custom|all&startDate=&endDate=
 *
 * Retorna resumo de consumo de tokens para visualizacao no dashboard.
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { getUsageSummary, getLastRequests } from '../../../models/copy/tokenUsage';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { period, startDate, endDate } = req.query;

  try {
    console.log('[INFO][API:tokens/usage] Buscando resumo de uso', { tenantId, period });

    const summary = await getUsageSummary(tenantId, { period, startDate, endDate });
    const lastRequests = await getLastRequests(tenantId, 20);

    return res.json({
      success: true,
      data: {
        ...summary,
        lastRequests,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:tokens/usage]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
