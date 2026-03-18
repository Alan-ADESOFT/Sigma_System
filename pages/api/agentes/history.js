/**
 * @fileoverview Endpoint: Histórico de pesquisas e respostas dos agentes
 * @route GET /api/agentes/history?type=search|agent&limit=20&page=1&agentName=agente1
 *
 * Response: {
 *   success: true,
 *   data: array,
 *   pagination: { total, page, limit }
 * }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query, queryOne } from '../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { type = 'agent', limit = '20', page = '1', agentName } = req.query;

  if (!['search', 'agent'].includes(type)) {
    return res.status(400).json({ success: false, error: 'type inválido (search | agent)' });
  }

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  try {
    // ── Histórico de pesquisas web ──────────────────────────────────────────
    if (type === 'search') {
      const conditions = ['tenant_id = $1'];
      const params     = [tenantId];
      let   paramIdx   = 2;

      if (agentName) {
        conditions.push(`agent_name = $${paramIdx++}`);
        params.push(agentName);
      }

      const where = conditions.join(' AND ');

      const [rows, countRow] = await Promise.all([
        query(
          `SELECT id, agent_name, query, result_text, citations, created_at
           FROM ai_search_history WHERE ${where}
           ORDER BY created_at DESC
           LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
          [...params, limitNum, offset]
        ),
        queryOne(
          `SELECT COUNT(*) AS total FROM ai_search_history WHERE ${where}`,
          params
        ),
      ]);

      return res.json({
        success: true,
        data: rows,
        pagination: {
          total: parseInt(countRow?.total || 0),
          page: pageNum,
          limit: limitNum,
        },
      });
    }

    // ── Histórico de respostas dos agentes ──────────────────────────────────
    const conditions = ['tenant_id = $1'];
    const params     = [tenantId];
    let   paramIdx   = 2;

    if (agentName) {
      conditions.push(`agent_name = $${paramIdx++}`);
      params.push(agentName);
    }

    const where = conditions.join(' AND ');

    const [rows, countRow] = await Promise.all([
      query(
        `SELECT id, agent_name, model_used, response_text, metadata, created_at
         FROM ai_agent_history WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limitNum, offset]
      ),
      queryOne(
        `SELECT COUNT(*) AS total FROM ai_agent_history WHERE ${where}`,
        params
      ),
    ]);

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: parseInt(countRow?.total || 0),
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    console.error('[/api/agentes/history] Erro:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
