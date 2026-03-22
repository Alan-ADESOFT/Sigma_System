/**
 * @fileoverview Endpoint: Reset da base de dados de um cliente
 * @route POST /api/clients/[id]/reset-database
 *
 * Apaga historico, versoes, scores, KB do cliente e reseta stages para pending.
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { query }           from '../../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const clientId = req.query.id;

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId obrigatorio' });
  }

  try {
    console.log('[INFO][ResetDatabase] Resetando base do cliente', { clientId });

    // Apaga TODO historico de agentes do tenant (single-tenant)
    await query('DELETE FROM ai_agent_history WHERE tenant_id = $1', [tenantId]);

    // Apaga TODO historico de pesquisas do tenant
    await query('DELETE FROM ai_search_history WHERE tenant_id = $1', [tenantId]);

    // Apaga versoes
    await query('DELETE FROM stage_versions WHERE client_id = $1', [clientId]);

    // Apaga KB do cliente (output dos agentes)
    await query('DELETE FROM ai_knowledge_base WHERE client_id = $1 AND tenant_id = $2', [clientId, tenantId]);

    // Apaga pipeline jobs
    await query('DELETE FROM pipeline_jobs WHERE client_id = $1 AND tenant_id = $2', [clientId, tenantId]);

    // Reseta todas as stages para pending e limpa notas/data
    await query(
      `UPDATE marketing_stages SET status = 'pending', data = NULL, notes = NULL, updated_at = now() WHERE client_id = $1`,
      [clientId]
    );

    console.log('[SUCESSO][ResetDatabase] Base resetada', { clientId });
    return res.json({ success: true });
  } catch (err) {
    console.error('[ERRO][ResetDatabase]', { clientId, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
