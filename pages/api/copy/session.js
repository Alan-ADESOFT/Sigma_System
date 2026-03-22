/**
 * @fileoverview Endpoint: Sessao de copy (workspace)
 * @route GET /api/copy/session?contentId=xxx → busca/cria sessao + estruturas + historico + clientes
 * @route PUT /api/copy/session?sessionId=xxx → atualiza campos da sessao
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query } from '../../../infra/db';
import { getOrCreateSession, updateSession, getHistory, getStructures } from '../../../models/copy/copySession';

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    // ── GET: busca/cria sessao com dados complementares ──
    if (req.method === 'GET') {
      const { contentId } = req.query;
      if (!contentId) return res.status(400).json({ success: false, error: 'contentId e obrigatorio' });

      console.log('[INFO][API:copy/session] GET sessao', { contentId, tenantId });

      // Busca ou cria sessao
      const session = await getOrCreateSession(contentId, tenantId);

      // Estruturas disponiveis
      const structures = await getStructures(tenantId);

      // Historico da sessao (ultimos 10)
      const history = await getHistory(session.id, 10);

      // Todos os clientes (para select de base de dados)
      const clients = await query(
        `SELECT id, company_name, niche, main_product, avg_ticket, form_done, logo_url
         FROM marketing_clients
         WHERE tenant_id = $1
         ORDER BY company_name ASC`,
        [tenantId]
      );

      return res.json({
        success: true,
        data: {
          session,
          structures,
          history,
          clients,
        },
      });
    }

    // ── PUT: atualiza campos da sessao ──
    if (req.method === 'PUT') {
      const { sessionId } = req.query;
      if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId e obrigatorio' });

      console.log('[INFO][API:copy/session] PUT sessao', { sessionId });

      const updated = await updateSession(sessionId, req.body);
      if (!updated) return res.status(404).json({ success: false, error: 'Sessao nao encontrada' });

      return res.json({ success: true, data: updated });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:copy/session]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
