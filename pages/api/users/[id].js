/**
 * PUT    /api/users/:id — Edita usuário (god only)
 * DELETE /api/users/:id — Desativa usuário (god only)
 */

import { requireRole } from '../../../infra/checkRole';
import { query, queryOne } from '../../../infra/db';
import { resolveTenantId } from '../../../infra/get-tenant-id';
import { createNotification } from '../../../models/clientForm';

const { hashPassword } = require('../../../lib/auth');

export default async function handler(req, res) {
  try {
    const god = await requireRole(req, 'god');
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;

    if (!id) return res.status(400).json({ success: false, error: 'ID obrigatório.' });

    // Busca usuário alvo
    const target = await queryOne(`SELECT id, name, role FROM tenants WHERE id = $1`, [id]);
    if (!target) return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });

    // Proteção: god não pode ser editado/deletado
    if (target.role === 'god') {
      return res.status(403).json({ success: false, error: 'O usuário God não pode ser editado.' });
    }

    /* ── PUT: editar ── */
    if (req.method === 'PUT') {
      const { name, email, username, password, phone, role, is_active, custom_role_id } = req.body || {};

      // Nunca permite trocar pra god
      const safeRole = role === 'admin' ? 'admin' : role === 'user' ? 'user' : undefined;

      // Verifica email duplicado (se mudou)
      if (email) {
        const dup = await queryOne(
          `SELECT id FROM tenants WHERE LOWER(email) = LOWER($1) AND id != $2`,
          [email, id]
        );
        if (dup) return res.status(409).json({ success: false, error: 'Email já em uso por outro usuário.' });
      }

      // Verifica username duplicado (se mudou)
      if (username) {
        const dup = await queryOne(
          `SELECT id FROM tenants WHERE LOWER(username) = LOWER($1) AND id != $2`,
          [username, id]
        );
        if (dup) return res.status(409).json({ success: false, error: 'Username já em uso.' });
      }

      // Monta campos de atualização dinamicamente
      const sets = [];
      const vals = [];
      let idx = 1;

      if (name !== undefined)      { sets.push(`name = $${idx++}`);      vals.push(name.trim()); }
      if (email !== undefined)     { sets.push(`email = $${idx++}`);     vals.push(email.toLowerCase().trim()); }
      if (username !== undefined)  { sets.push(`username = $${idx++}`);  vals.push(username?.trim() || null); }
      if (phone !== undefined)     { sets.push(`phone = $${idx++}`);     vals.push(phone?.trim() || null); }
      if (safeRole)                { sets.push(`role = $${idx++}`);      vals.push(safeRole); }
      if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(!!is_active); }
      if (password)                { sets.push(`password = $${idx++}`);  vals.push(hashPassword(password)); }
      if (custom_role_id !== undefined) { sets.push(`custom_role_id = $${idx++}`); vals.push(custom_role_id || null); }

      if (sets.length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar.' });
      }

      vals.push(id);
      const row = await queryOne(
        `UPDATE tenants SET ${sets.join(', ')}, updated_at = now()
         WHERE id = $${idx}
         RETURNING id, name, email, username, role, phone, avatar_url, is_active, custom_role_id, created_at`,
        vals
      );

      return res.json({ success: true, user: row });
    }

    /* ── DELETE: desativar ── */
    if (req.method === 'DELETE') {
      await queryOne(
        `UPDATE tenants SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id`,
        [id]
      );

      try {
        await createNotification(
          tenantId, 'system', 'Usuário desativado',
          `${target.name} foi desativado do sistema.`,
          null, { action: 'user_deactivated', userId: id, deactivatedBy: god.id }
        );
      } catch {}

      return res.json({ success: true, message: `Usuário ${target.name} desativado.` });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ success: false, error: err.message });
    if (err.status === 403) return res.status(403).json({ success: false, error: err.message });
    console.error('[ERRO][API:/api/users/:id]', err.message);
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
}
