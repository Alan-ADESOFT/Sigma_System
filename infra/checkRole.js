/**
 * infra/checkRole.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Helper de verificação de cargo (god / admin / user).
 *
 * Hierarquia: god > admin > user
 * Uso nas API routes:
 *   const { user } = await requireRole(req, 'god');
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { verifyToken } = require('../lib/auth');
const { queryOne } = require('./db');

const ROLE_LEVEL = { user: 1, admin: 2, god: 3 };

/**
 * Verifica se o cargo do usuário atende ao mínimo exigido.
 * @param {string} userRole - cargo do usuário
 * @param {string} minRole  - cargo mínimo exigido
 * @returns {boolean}
 */
function hasAccess(userRole, minRole) {
  return (ROLE_LEVEL[userRole] || 0) >= (ROLE_LEVEL[minRole] || 0);
}

/**
 * Middleware de verificação de cargo para API routes.
 * Lê o cookie de sessão, busca o usuário e verifica o cargo mínimo.
 *
 * @param {import('next').NextApiRequest} req
 * @param {string} minRole - 'user' | 'admin' | 'god'
 * @returns {Promise<{ id: string, name: string, role: string, email: string }>}
 * @throws {Error} se não autenticado ou sem permissão
 */
async function requireRole(req, minRole) {
  const token = req.cookies?.sigma_token;
  const session = verifyToken(token);
  if (!session) {
    const err = new Error('Não autenticado');
    err.status = 401;
    throw err;
  }

  const user = await queryOne(
    `SELECT id, name, email, role FROM tenants WHERE id = $1 AND is_active = true`,
    [session.userId]
  );
  if (!user) {
    const err = new Error('Usuário não encontrado');
    err.status = 401;
    throw err;
  }

  if (!hasAccess(user.role, minRole)) {
    const err = new Error('Permissão insuficiente');
    err.status = 403;
    throw err;
  }

  return user;
}

module.exports = { ROLE_LEVEL, hasAccess, requireRole };
