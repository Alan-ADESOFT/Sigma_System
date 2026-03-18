/**
 * @fileoverview Endpoint: Gerenciar rascunhos dos agentes
 * @route GET    /api/agentes/drafts              → lista rascunhos do tenant
 * @route POST   /api/agentes/drafts              → cria novo rascunho
 * @route PUT    /api/agentes/drafts?id=:id       → atualiza rascunho (conteúdo ou status)
 * @route DELETE /api/agentes/drafts?id=:id       → remove rascunho
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query, queryOne } from '../../../infra/db';

const VALID_STATUSES = ['pendente', 'desenvolvendo', 'concluido'];

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    // ── GET: lista rascunhos ──────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { status, agentName, limit = '20', page = '1' } = req.query;
      const pageNum  = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const offset   = (pageNum - 1) * limitNum;

      const conditions = ['tenant_id = $1'];
      const params     = [tenantId];
      let   paramIdx   = 2;

      if (status && VALID_STATUSES.includes(status)) {
        conditions.push(`status = $${paramIdx++}`);
        params.push(status);
      }
      if (agentName) {
        conditions.push(`agent_name = $${paramIdx++}`);
        params.push(agentName);
      }

      const where = conditions.join(' AND ');

      const [rows, countRow] = await Promise.all([
        query(
          `SELECT id, agent_name, title, content, status, metadata, created_at, updated_at
           FROM ai_drafts WHERE ${where}
           ORDER BY updated_at DESC
           LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
          [...params, limitNum, offset]
        ),
        queryOne(
          `SELECT COUNT(*) AS total FROM ai_drafts WHERE ${where}`,
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

    // ── POST: cria rascunho ───────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { agentName, title, content, metadata = {} } = req.body;

      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ success: false, error: 'content é obrigatório' });
      }

      const row = await queryOne(
        `INSERT INTO ai_drafts (tenant_id, agent_name, title, content, original_content, metadata)
         VALUES ($1, $2, $3, $4, $4, $5) RETURNING *`,
        [tenantId, agentName || null, title || null, content.trim(), JSON.stringify(metadata)]
      );

      return res.status(201).json({ success: true, data: row });
    }

    // ── PUT: atualiza rascunho ────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

      const { status, title, content, metadata } = req.body;

      // Verifica se pertence ao tenant
      const existing = await queryOne(
        'SELECT id FROM ai_drafts WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      if (!existing) return res.status(404).json({ success: false, error: 'Rascunho não encontrado' });

      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: 'status inválido (pendente | desenvolvendo | concluido)' });
      }

      const sets   = [];
      const params = [];
      let   idx    = 1;

      if (status  !== undefined) { sets.push(`status = $${idx++}`);   params.push(status); }
      if (title   !== undefined) { sets.push(`title = $${idx++}`);    params.push(title); }
      if (content !== undefined) { sets.push(`content = $${idx++}`);  params.push(content); }
      if (metadata !== undefined){ sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(metadata)); }

      sets.push(`updated_at = now()`);
      params.push(id, tenantId);

      const row = await queryOne(
        `UPDATE ai_drafts SET ${sets.join(', ')}
         WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
        params
      );

      return res.json({ success: true, data: row });
    }

    // ── DELETE: remove rascunho ───────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

      const row = await queryOne(
        'DELETE FROM ai_drafts WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, tenantId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Rascunho não encontrado' });

      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[/api/agentes/drafts] Erro:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
