/**
 * @fileoverview Helper de autenticação para endpoints de API
 * @description Centraliza a verificação do cookie de sessão e a busca
 * do usuário no banco. Compatível com o padrão CommonJS dos models.
 *
 * Modelo single-workspace: `user.tenant_id` aponta para o WORKSPACE_TENANT_ID
 * (workspace global), NÃO para o id do user. Para isolamento por usuário,
 * use `user.id` em colunas como `assigned_to`/`created_by`.
 *
 * Uso típico:
 *   const { requireAuth, isAdmin } = require('../../../lib/api-auth');
 *   try {
 *     const user = await requireAuth(req); // 401 se não autenticado
 *     if (!isAdmin(user)) return res.status(403)...
 *     ...
 *   } catch (err) {
 *     if (err.statusCode) return res.status(err.statusCode).json({ success: false, error: err.message });
 *     throw err;
 *   }
 */

const { verifyToken } = require('./auth');
const { queryOne } = require('../infra/db');

/**
 * Valida o cookie de sessão e retorna o usuário autenticado.
 * Lança Error com `statusCode=401` se inválido.
 *
 * @param {object} req - Objeto request do Next.js
 * @returns {Promise<{id: string, name: string, email: string, role: string,
 *   custom_role_id: string|null, tenant_id: string}>}
 */
async function requireAuth(req) {
  const token = req?.cookies?.sigma_token;
  const session = verifyToken(token);
  if (!session) {
    const err = new Error('Não autenticado');
    err.statusCode = 401;
    throw err;
  }

  const user = await queryOne(
    `SELECT id, name, email, role, custom_role_id, is_active
       FROM tenants
      WHERE id = $1
      LIMIT 1`,
    [session.userId]
  );
  if (!user || !user.is_active) {
    const err = new Error('Sessão inválida');
    err.statusCode = 401;
    throw err;
  }

  // Tenant é o workspace global, NÃO o id do user.
  // Para queries multi-tenant: WHERE tenant_id = $user.tenant_id
  // Para isolamento por usuário: WHERE assigned_to = $user.id
  user.tenant_id = process.env.WORKSPACE_TENANT_ID || null;
  if (!user.tenant_id) {
    console.warn('[WARN][api-auth] WORKSPACE_TENANT_ID não definido — queries multi-tenant vão falhar');
  }
  return user;
}

/**
 * Verifica se o user tem permissões de admin.
 * Aceita 'admin' OU 'god' (god = nível superior, sempre tem acesso a tudo).
 * O frontend já considera ambos como admin (DashboardLayout, useAuth) —
 * o backend precisa fazer o mesmo pra evitar 403 falso pra users god.
 *
 * @param {{ role: string }} user
 * @returns {boolean}
 */
function isAdmin(user) {
  return user?.role === 'admin' || user?.role === 'god';
}

/**
 * Wrapper que converte erros de auth em respostas HTTP padronizadas.
 * Reduz boilerplate nos handlers.
 *
 * @param {object} res - Next.js response
 * @param {Error} err
 * @returns {boolean} true se o erro foi tratado, false caso contrário
 */
function handleAuthError(res, err) {
  if (err && err.statusCode === 401) {
    res.status(401).json({ success: false, error: err.message });
    return true;
  }
  if (err && err.statusCode === 403) {
    res.status(403).json({ success: false, error: err.message });
    return true;
  }
  return false;
}

module.exports = { requireAuth, isAdmin, handleAuthError };
