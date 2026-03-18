/**
 * @fileoverview Endpoint: Knowledge Base por cliente
 * @description Base de conhecimento vinculada a cada cliente (marca, produto, persona, etc.)
 *
 * @route GET    /api/clients/:id/knowledge             → lista KB do cliente
 * @route POST   /api/clients/:id/knowledge             → cria ou atualiza item (upsert)
 * @route PUT    /api/clients/:id/knowledge?itemId=:id   → edita item existente
 * @route DELETE /api/clients/:id/knowledge?itemId=:id   → remove item
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { getClientById }   from '../../../../models/client.model';
import { query, queryOne } from '../../../../infra/db';

const VALID_CATEGORIES = ['marca', 'produto', 'persona', 'tom_de_voz', 'concorrentes'];

export default async function handler(req, res) {
  console.log('[INFO][API:/api/clients/:id/knowledge] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);
  const { id: clientId, itemId } = req.query;

  if (!clientId) return res.status(400).json({ success: false, error: 'ID do cliente obrigatório' });

  try {
    const client = await getClientById(clientId, tenantId);
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

    // ── GET: lista KB do cliente ──────────────────────────────────────────────
    if (req.method === 'GET') {
      const rows = await query(
        `SELECT id, category, key, value, metadata, created_at, updated_at
         FROM ai_knowledge_base
         WHERE tenant_id = $1 AND client_id = $2
         ORDER BY category, key ASC`,
        [tenantId, clientId]
      );

      const grouped = {};
      for (const cat of VALID_CATEGORIES) grouped[cat] = [];
      for (const row of rows) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push(row);
      }

      console.log('[SUCESSO][API:/api/clients/:id/knowledge] KB carregada', { clientId, totalItems: rows.length });
      return res.json({ success: true, data: grouped, categories: VALID_CATEGORIES });
    }

    // ── POST: cria ou atualiza (upsert) ───────────────────────────────────────
    if (req.method === 'POST') {
      const { category, key, value, metadata = {} } = req.body;

      if (!category || !VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ success: false, error: `category inválida. Use: ${VALID_CATEGORIES.join(' | ')}` });
      }
      if (!key || typeof key !== 'string' || !key.trim()) {
        return res.status(400).json({ success: false, error: 'key é obrigatório' });
      }
      if (value === undefined || value === null) {
        return res.status(400).json({ success: false, error: 'value é obrigatório' });
      }

      const row = await queryOne(
        `INSERT INTO ai_knowledge_base (tenant_id, client_id, category, key, value, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, category, key)
            WHERE client_id = $2
         DO UPDATE SET value = EXCLUDED.value, metadata = EXCLUDED.metadata, updated_at = now()
         RETURNING *`,
        [tenantId, clientId, category, key.trim(), String(value), JSON.stringify(metadata)]
      );

      console.log('[SUCESSO][API:/api/clients/:id/knowledge] Item salvo', { clientId, category, key });
      return res.status(201).json({ success: true, data: row });
    }

    // ── PUT: edita item existente ──────────────────────────────────────────────
    if (req.method === 'PUT') {
      if (!itemId) return res.status(400).json({ success: false, error: 'itemId é obrigatório' });

      const { key, value, metadata } = req.body;

      const existing = await queryOne(
        'SELECT id FROM ai_knowledge_base WHERE id = $1 AND tenant_id = $2 AND client_id = $3',
        [itemId, tenantId, clientId]
      );
      if (!existing) return res.status(404).json({ success: false, error: 'Item não encontrado' });

      const sets   = [];
      const params = [];
      let   idx    = 1;

      if (key   !== undefined) { sets.push(`key = $${idx++}`);      params.push(key.trim()); }
      if (value !== undefined) { sets.push(`value = $${idx++}`);    params.push(String(value)); }
      if (metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(metadata)); }

      sets.push(`updated_at = now()`);
      params.push(itemId, tenantId, clientId);

      const row = await queryOne(
        `UPDATE ai_knowledge_base SET ${sets.join(', ')}
         WHERE id = $${idx} AND tenant_id = $${idx + 1} AND client_id = $${idx + 2} RETURNING *`,
        params
      );

      console.log('[SUCESSO][API:/api/clients/:id/knowledge] Item atualizado', { itemId, clientId });
      return res.json({ success: true, data: row });
    }

    // ── DELETE: remove item ────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      if (!itemId) return res.status(400).json({ success: false, error: 'itemId é obrigatório' });

      const row = await queryOne(
        'DELETE FROM ai_knowledge_base WHERE id = $1 AND tenant_id = $2 AND client_id = $3 RETURNING id',
        [itemId, tenantId, clientId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Item não encontrado' });

      console.log('[SUCESSO][API:/api/clients/:id/knowledge] Item removido', { itemId, clientId });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/clients/:id/knowledge] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
