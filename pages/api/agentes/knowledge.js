/**
 * @fileoverview Endpoint: Knowledge Base dinâmica do tenant
 * @description Dados de marca, produto, persona, etc. injetados automaticamente
 * nos prompts dos agentes via placeholders ({MARCA}, {PRODUTO}, etc.).
 *
 * @route GET    /api/agentes/knowledge             → lista todos os dados por categoria
 * @route POST   /api/agentes/knowledge             → cria ou atualiza um item (upsert)
 * @route PUT    /api/agentes/knowledge?id=:id      → edita item existente
 * @route DELETE /api/agentes/knowledge?id=:id      → remove item
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query, queryOne } from '../../../infra/db';

const VALID_CATEGORIES = ['marca', 'produto', 'persona', 'tom_de_voz', 'concorrentes'];

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    console.log('[INFO][API:/api/agentes/knowledge] Requisição recebida', { method: req.method, query: req.query });

    // ── GET: lista todos os itens agrupados por categoria ──────────────────
    if (req.method === 'GET') {
      const rows = await query(
        `SELECT id, category, key, value, metadata, created_at, updated_at
         FROM ai_knowledge_base
         WHERE tenant_id = $1
         ORDER BY category, key ASC`,
        [tenantId]
      );

      // Agrupa por categoria para facilitar renderização na UI
      const grouped = {};
      for (const cat of VALID_CATEGORIES) grouped[cat] = [];
      for (const row of rows) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push(row);
      }

      return res.json({ success: true, data: grouped, categories: VALID_CATEGORIES });
    }

    // ── POST: cria ou atualiza (upsert por category + key) ─────────────────
    if (req.method === 'POST') {
      const { category, key, value, metadata = {} } = req.body;

      if (!category || !VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({
          success: false,
          error: `category inválida. Use: ${VALID_CATEGORIES.join(' | ')}`,
        });
      }
      if (!key || typeof key !== 'string' || !key.trim()) {
        return res.status(400).json({ success: false, error: 'key é obrigatório' });
      }
      if (value === undefined || value === null) {
        return res.status(400).json({ success: false, error: 'value é obrigatório' });
      }

      const row = await queryOne(
        `INSERT INTO ai_knowledge_base (tenant_id, category, key, value, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, category, key)
         DO UPDATE SET value = EXCLUDED.value, metadata = EXCLUDED.metadata, updated_at = now()
         RETURNING *`,
        [tenantId, category, key.trim(), String(value), JSON.stringify(metadata)]
      );

      return res.status(201).json({ success: true, data: row });
    }

    // ── PUT: edita item existente ───────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

      const { key, value, metadata } = req.body;

      const existing = await queryOne(
        'SELECT id FROM ai_knowledge_base WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      if (!existing) return res.status(404).json({ success: false, error: 'Item não encontrado' });

      const sets   = [];
      const params = [];
      let   idx    = 1;

      if (key   !== undefined) { sets.push(`key = $${idx++}`);      params.push(key.trim()); }
      if (value !== undefined) { sets.push(`value = $${idx++}`);    params.push(String(value)); }
      if (metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(metadata)); }

      sets.push(`updated_at = now()`);
      params.push(id, tenantId);

      const row = await queryOne(
        `UPDATE ai_knowledge_base SET ${sets.join(', ')}
         WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
        params
      );

      return res.json({ success: true, data: row });
    }

    // ── DELETE: remove item ────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

      const row = await queryOne(
        'DELETE FROM ai_knowledge_base WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, tenantId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Item não encontrado' });

      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/agentes/knowledge] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
