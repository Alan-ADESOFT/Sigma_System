/**
 * pages/api/comercial/captacao/lists/[id]/import.js
 *   POST → importa leads pra pipeline (coluna 'start').
 *
 * Body opções:
 *   { leadIds: [...] }   → importa apenas os IDs especificados
 *   { importAll: true }  → importa TODOS os leads ainda não importados da lista
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../../lib/auth');
const { query } = require('../../../../../../infra/db');
const pipeline = require('../../../../../../models/comercial/pipeline.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:comercial/captacao/lists/[id]/import]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { id } = req.query;
    const { leadIds, importAll } = req.body || {};

    let finalIds = leadIds;

    if (importAll) {
      // Pega todos não-importados da lista
      const rows = await query(
        `SELECT id FROM comercial_leads
          WHERE list_id = $1 AND tenant_id = $2 AND imported_to_pipeline = false`,
        [id, tenantId]
      );
      finalIds = rows.map(r => r.id);
      if (finalIds.length === 0) {
        return res.json({ success: true, importedCount: 0, message: 'Nenhum lead pendente — todos já estão no pipeline' });
      }
    }

    if (!Array.isArray(finalIds) || finalIds.length === 0) {
      return res.status(400).json({ success: false, error: 'leadIds (array) ou importAll=true obrigatório' });
    }

    const result = await pipeline.bulkImportFromList(tenantId, id, finalIds, userId);
    console.log('[SUCESSO][API:import]', { listId: id, importedCount: result.count });
    return res.json({ success: true, importedCount: result.count });
  } catch (err) {
    console.error('[ERRO][API:comercial/captacao/lists/[id]/import]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
