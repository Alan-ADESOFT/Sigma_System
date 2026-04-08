/**
 * GET  /api/users — Lista todos os usuários (god only)
 * POST /api/users — Cria novo usuário (god only)
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

    /* ── GET: listar usuários ── */
    if (req.method === 'GET') {
      const rows = await query(
        `SELECT id, name, email, username, role, phone, avatar_url, is_active, custom_role_id, created_at
         FROM tenants
         ORDER BY
           CASE role WHEN 'god' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
           name ASC`
      );
      return res.json({ success: true, users: rows });
    }

    /* ── POST: criar usuário ── */
    if (req.method === 'POST') {
      const { name, email, username, password, phone, role, custom_role_id } = req.body || {};

      if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: 'Nome, email e senha são obrigatórios.' });
      }

      // Nunca permite criar god
      const safeRole = role === 'admin' ? 'admin' : 'user';

      // Verifica email duplicado
      const existing = await queryOne(`SELECT id FROM tenants WHERE LOWER(email) = LOWER($1)`, [email]);
      if (existing) {
        return res.status(409).json({ success: false, error: 'Já existe um usuário com esse email.' });
      }

      // Verifica username duplicado
      if (username) {
        const existingUser = await queryOne(`SELECT id FROM tenants WHERE LOWER(username) = LOWER($1)`, [username]);
        if (existingUser) {
          return res.status(409).json({ success: false, error: 'Já existe um usuário com esse username.' });
        }
      }

      const hashed = hashPassword(password);
      const safeCustomRoleId = safeRole === 'user' && custom_role_id ? custom_role_id : null;
      const row = await queryOne(
        `INSERT INTO tenants (name, email, username, password, phone, role, custom_role_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING id, name, email, username, role, phone, avatar_url, is_active, custom_role_id, created_at`,
        [name.trim(), email.toLowerCase().trim(), username?.trim() || null, hashed, phone?.trim() || null, safeRole, safeCustomRoleId]
      );

      try {
        await createNotification(
          tenantId, 'system', 'Novo usuário criado',
          `${row.name} (${safeRole.toUpperCase()}) foi adicionado ao sistema.`,
          null, { action: 'user_created', userId: row.id, createdBy: god.id }
        );
      } catch {}

      return res.json({ success: true, user: row });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ success: false, error: err.message });
    if (err.status === 403) return res.status(403).json({ success: false, error: err.message });
    console.error('[ERRO][API:/api/users]', err.message);
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
}
