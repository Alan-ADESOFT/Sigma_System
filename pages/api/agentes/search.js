/**
 * @fileoverview Endpoint: Pesquisa web avulsa
 * @route POST /api/agentes/search
 *
 * Body: { query: string, instructions?: string }
 *
 * Response: {
 *   success: true,
 *   data: { text, citations, historyId }
 * }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { deepSearch }      from '../../../models/ia/deepSearch';
import { queryOne }        from '../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { query, instructions = '' } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ success: false, error: 'query é obrigatório' });
  }

  try {
    const { text, citations } = await deepSearch(query.trim(), instructions);

    // Salva no histórico de buscas
    const row = await queryOne(
      `INSERT INTO ai_search_history (tenant_id, query, result_text, citations)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantId, query.trim(), text, JSON.stringify(citations)]
    );

    return res.json({
      success: true,
      data: { text, citations, historyId: row?.id },
    });
  } catch (err) {
    console.error('[/api/agentes/search] Erro:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
