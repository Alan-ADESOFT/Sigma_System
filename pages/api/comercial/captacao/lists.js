/**
 * pages/api/comercial/captacao/lists.js
 *   GET → lista todas as listas do tenant + agregados
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const leadList = require('../../../../models/comercial/leadList.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:comercial/captacao/lists]', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);
    const lists = await leadList.listLists(tenantId, { limit: 200, offset: 0 });
    return res.json({
      success: true,
      lists: lists.map(l => ({
        id: l.id,
        name: l.name,
        source: l.source,
        status: l.status,
        totalLeads: l.total_leads,
        leadsCount: l.leads_count,
        importedCount: l.imported_count,
        expiresAt: l.expires_at,
        errorMessage: l.error_message,
        createdAt: l.created_at,
        filters: l.filters,
      })),
    });
  } catch (err) {
    console.error('[ERRO][API:comercial/captacao/lists]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
