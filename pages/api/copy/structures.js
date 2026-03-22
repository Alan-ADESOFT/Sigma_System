/**
 * @fileoverview Endpoint: CRUD de estruturas de copy
 * @route GET    /api/copy/structures             → lista estruturas ativas
 * @route POST   /api/copy/structures             → cria nova estrutura
 * @route PUT    /api/copy/structures?id=xxx       → atualiza estrutura
 * @route DELETE /api/copy/structures?id=xxx       → soft delete (active=false)
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query, queryOne } from '../../../infra/db';
import { getStructures } from '../../../models/copy/copySession';

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    // ── GET: lista estruturas ativas ──
    if (req.method === 'GET') {
      const structures = await getStructures(tenantId);
      return res.json({ success: true, data: structures });
    }

    // ── POST: cria nova estrutura ──
    if (req.method === 'POST') {
      const { name, description, prompt_base, icon, sort_order } = req.body;
      if (!name || !prompt_base) {
        return res.status(400).json({ success: false, error: 'name e prompt_base sao obrigatorios' });
      }

      const row = await queryOne(
        `INSERT INTO copy_structures (tenant_id, name, description, prompt_base, icon, sort_order, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, false) RETURNING *`,
        [tenantId, name, description || null, prompt_base, icon || 'file', sort_order || 0]
      );

      console.log('[SUCESSO][API:structures] Estrutura criada', { id: row.id, name });
      return res.status(201).json({ success: true, data: row });
    }

    // ── PUT: atualiza estrutura ──
    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'id e obrigatorio' });

      const { name, description, prompt_base, icon, active } = req.body;
      const sets = [];
      const vals = [];
      let idx = 1;

      if (name !== undefined)        { sets.push(`name = $${idx++}`);        vals.push(name); }
      if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
      if (prompt_base !== undefined)  { sets.push(`prompt_base = $${idx++}`); vals.push(prompt_base); }
      if (icon !== undefined)        { sets.push(`icon = $${idx++}`);        vals.push(icon); }
      if (active !== undefined)      { sets.push(`active = $${idx++}`);      vals.push(active); }

      if (sets.length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar' });
      }

      vals.push(id, tenantId);
      const row = await queryOne(
        `UPDATE copy_structures SET ${sets.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
        vals
      );

      if (!row) return res.status(404).json({ success: false, error: 'Estrutura nao encontrada' });
      console.log('[SUCESSO][API:structures] Estrutura atualizada', { id });
      return res.json({ success: true, data: row });
    }

    // ── DELETE: soft delete (active=false) ──
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'id e obrigatorio' });

      // Nao pode deletar estruturas padrao
      const structure = await queryOne(
        'SELECT is_default FROM copy_structures WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      if (!structure) return res.status(404).json({ success: false, error: 'Estrutura nao encontrada' });
      if (structure.is_default) return res.status(403).json({ success: false, error: 'Estruturas padrao nao podem ser removidas, apenas editadas' });

      await queryOne(
        'UPDATE copy_structures SET active = false WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, tenantId]
      );

      console.log('[SUCESSO][API:structures] Estrutura desativada', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:structures]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
