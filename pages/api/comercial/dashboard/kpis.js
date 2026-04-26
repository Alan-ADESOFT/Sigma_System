/**
 * pages/api/comercial/dashboard/kpis.js
 *   GET ?period=month|week|year
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const { getKPIs } = require('../../../../models/comercial/dashboard.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:dashboard/kpis]', { period: req.query?.period });

  try {
    const tenantId = await resolveTenantId(req);
    const period = ['week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'month';
    const kpis = await getKPIs(tenantId, { period });
    return res.json({ success: true, kpis, period: kpis.period });
  } catch (err) {
    console.error('[ERRO][API:dashboard/kpis]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
