/**
 * GET /api/auth/profile — Retorna dados do perfil do usuário logado
 * PUT /api/auth/profile — Atualiza dados do próprio perfil
 */

import { queryOne } from '../../../infra/db';

const { verifyToken, verifyPassword, hashPassword } = require('../../../lib/auth');

export default async function handler(req, res) {
  const session = verifyToken(req.cookies?.sigma_token);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Não autenticado.' });
  }

  /* ── GET: dados do perfil ── */
  if (req.method === 'GET') {
    const user = await queryOne(
      `SELECT id, name, email, username, role, phone, avatar_url, created_at
       FROM tenants WHERE id = $1 AND is_active = true`,
      [session.userId]
    );
    if (!user) return res.status(401).json({ success: false, error: 'Sessão inválida.' });

    return res.json({ success: true, user });
  }

  /* ── PUT: atualizar perfil ── */
  if (req.method === 'PUT') {
    try {
      const user = await queryOne(
        `SELECT id, password FROM tenants WHERE id = $1 AND is_active = true`,
        [session.userId]
      );
      if (!user) return res.status(401).json({ success: false, error: 'Sessão inválida.' });

      const { name, email, username, phone, avatar_url, current_password, new_password } = req.body || {};

      const sets = [];
      const vals = [];
      let idx = 1;

      if (name !== undefined)       { sets.push(`name = $${idx++}`);       vals.push(name.trim()); }
      if (email !== undefined)      {
        // Verifica duplicidade de email
        const dup = await queryOne(
          `SELECT id FROM tenants WHERE LOWER(email) = LOWER($1) AND id != $2`,
          [email, user.id]
        );
        if (dup) return res.status(409).json({ success: false, error: 'Email já em uso.' });
        sets.push(`email = $${idx++}`);
        vals.push(email.toLowerCase().trim());
      }
      if (username !== undefined)   {
        if (username) {
          const dup = await queryOne(
            `SELECT id FROM tenants WHERE LOWER(username) = LOWER($1) AND id != $2`,
            [username, user.id]
          );
          if (dup) return res.status(409).json({ success: false, error: 'Username já em uso.' });
        }
        sets.push(`username = $${idx++}`);
        vals.push(username?.trim() || null);
      }
      if (phone !== undefined)      { sets.push(`phone = $${idx++}`);      vals.push(phone?.trim() || null); }
      if (avatar_url !== undefined) { sets.push(`avatar_url = $${idx++}`); vals.push(avatar_url || null); }

      // Troca de senha
      if (new_password) {
        if (!current_password) {
          return res.status(400).json({ success: false, error: 'Informe a senha atual para alterar a senha.' });
        }
        if (!verifyPassword(current_password, user.password)) {
          return res.status(400).json({ success: false, error: 'Senha atual incorreta.' });
        }
        if (new_password.length < 6) {
          return res.status(400).json({ success: false, error: 'A nova senha deve ter pelo menos 6 caracteres.' });
        }
        sets.push(`password = $${idx++}`);
        vals.push(hashPassword(new_password));
      }

      if (sets.length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar.' });
      }

      vals.push(user.id);
      const updated = await queryOne(
        `UPDATE tenants SET ${sets.join(', ')}, updated_at = now()
         WHERE id = $${idx}
         RETURNING id, name, email, username, role, phone, avatar_url, created_at`,
        vals
      );

      return res.json({ success: true, user: updated, message: 'Perfil atualizado.' });
    } catch (err) {
      console.error('[ERRO][API:/api/auth/profile]', err.message);
      return res.status(500).json({ success: false, error: 'Erro interno.' });
    }
  }

  return res.status(405).json({ success: false, error: 'Método não permitido.' });
}
