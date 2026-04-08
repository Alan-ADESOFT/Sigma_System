/**
 * GET    /api/users/roles — Lista cargos personalizados
 * POST   /api/users/roles — Cria novo cargo
 * PUT    /api/users/roles — Edita cargo (body.id obrigatório)
 * DELETE /api/users/roles — Remove cargo (body.id obrigatório)
 */

import { requireRole } from '../../../infra/checkRole';
import { query, queryOne } from '../../../infra/db';
import { resolveTenantId } from '../../../infra/get-tenant-id';

export default async function handler(req, res) {
  try {
    await requireRole(req, 'god');
    const tenantId = await resolveTenantId(req);

    /* ── GET: listar ── */
    if (req.method === 'GET') {
      const rows = await query(
        `SELECT r.*, (SELECT COUNT(*)::int FROM tenants t WHERE t.custom_role_id = r.id) AS user_count
         FROM user_roles r WHERE r.tenant_id = $1 ORDER BY r.name ASC`,
        [tenantId]
      );
      return res.json({ success: true, roles: rows });
    }

    /* ── POST: criar ── */
    if (req.method === 'POST') {
      const { name, allowed_pages } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ success: false, error: 'Nome do cargo é obrigatório.' });

      const existing = await queryOne(
        `SELECT id FROM user_roles WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)`,
        [tenantId, name.trim()]
      );
      if (existing) return res.status(409).json({ success: false, error: 'Já existe um cargo com esse nome.' });

      const row = await queryOne(
        `INSERT INTO user_roles (tenant_id, name, allowed_pages)
         VALUES ($1, $2, $3::jsonb) RETURNING *`,
        [tenantId, name.trim(), JSON.stringify(allowed_pages || [])]
      );
      return res.json({ success: true, role: row });
    }

    /* ── PUT: editar ── */
    if (req.method === 'PUT') {
      const { id, name, allowed_pages } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'ID do cargo é obrigatório.' });

      const sets = [];
      const vals = [];
      let idx = 1;

      if (name !== undefined) {
        const dup = await queryOne(
          `SELECT id FROM user_roles WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND id != $3`,
          [tenantId, name.trim(), id]
        );
        if (dup) return res.status(409).json({ success: false, error: 'Nome já em uso.' });
        sets.push(`name = $${idx++}`); vals.push(name.trim());
      }
      if (allowed_pages !== undefined) {
        sets.push(`allowed_pages = $${idx++}::jsonb`); vals.push(JSON.stringify(allowed_pages));
      }

      if (sets.length === 0) return res.status(400).json({ success: false, error: 'Nada para atualizar.' });

      vals.push(id); vals.push(tenantId);
      const row = await queryOne(
        `UPDATE user_roles SET ${sets.join(', ')}, updated_at = now()
         WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
        vals
      );
      if (!row) return res.status(404).json({ success: false, error: 'Cargo não encontrado.' });
      return res.json({ success: true, role: row });
    }

    /* ── DELETE: remover ── */
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'ID do cargo é obrigatório.' });

      // Desvincula usuários do cargo antes de deletar
      await query(`UPDATE tenants SET custom_role_id = NULL WHERE custom_role_id = $1`, [id]);

      const deleted = await queryOne(
        `DELETE FROM user_roles WHERE id = $1 AND tenant_id = $2 RETURNING id, name`,
        [id, tenantId]
      );
      if (!deleted) return res.status(404).json({ success: false, error: 'Cargo não encontrado.' });
      return res.json({ success: true, message: `Cargo "${deleted.name}" removido.` });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  } catch (err) {
    if (err.status === 401 || err.status === 403) return res.status(err.status).json({ success: false, error: err.message });
    console.error('[ERRO][API:/api/users/roles]', err.message);
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
}
