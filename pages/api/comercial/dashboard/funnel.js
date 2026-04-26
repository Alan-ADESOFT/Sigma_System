/**
 * pages/api/comercial/dashboard/funnel.js
 *   GET → funil agregado por coluna do kanban.
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const { getFunnel, getStageConversion } = require('../../../../models/comercial/dashboard.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:dashboard/funnel]');

  try {
    const tenantId = await resolveTenantId(req);
    const period = ['week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'month';
    const [funnel, conversion] = await Promise.all([
      getFunnel(tenantId),
      getStageConversion(tenantId, { period }),
    ]);

    // Calcula taxa de conversão para cada etapa adjacente
    const conversionMap = {};
    for (const c of conversion) {
      if (c.to_column_id) conversionMap[c.to_column_id] = c.leads_passed;
    }

    const enriched = funnel.map((stage, i) => {
      const prev = i > 0 ? funnel[i - 1] : null;
      const passedHere = conversionMap[stage.column_id] || 0;
      const passedPrev = prev ? (conversionMap[prev.column_id] || prev.lead_count) : null;
      const conversionPct = (prev && passedPrev > 0)
        ? Math.round((passedHere / passedPrev) * 100)
        : null;

      return {
        columnId:    stage.column_id,
        name:        stage.name,
        color:       stage.color,
        systemRole:  stage.system_role,
        leadCount:   stage.lead_count,
        totalValue:  Number(stage.total_value || 0),
        avgDays:     stage.avg_days_in_column ? Number(Number(stage.avg_days_in_column).toFixed(1)) : null,
        passedInPeriod: passedHere,
        conversionPct,
      };
    });

    return res.json({ success: true, funnel: enriched });
  } catch (err) {
    console.error('[ERRO][API:dashboard/funnel]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
