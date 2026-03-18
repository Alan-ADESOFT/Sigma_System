/**
 * GET /api/auth/me
 * Retorna o usuário autenticado a partir do cookie de sessão.
 */

const { getDb } = require('../../../infra/db');
const { verifyToken } = require('../../../lib/auth');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/auth/me] Requisição recebida', { method: req.method, query: req.query });

  if (req.method !== 'GET') return res.status(405).end();

  /* Lê token do cookie httpOnly */
  const token = req.cookies?.sigma_token;
  const session = verifyToken(token);

  if (!session) {
    return res.status(401).json({ success: false, error: 'Não autenticado.' });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, email, username, role, avatar_url
      FROM tenants
      WHERE id = ${session.userId} AND is_active = true
      LIMIT 1
    `;

    if (!rows[0]) {
      return res.status(401).json({ success: false, error: 'Sessão inválida.' });
    }

    const u = rows[0];
    console.log('[SUCESSO][API:/api/auth/me] Resposta enviada', { userId: u.id });
    return res.json({
      success: true,
      user: {
        id:       u.id,
        name:     u.name,
        email:    u.email,
        username: u.username,
        role:     u.role,
        avatarUrl: u.avatar_url,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:/api/auth/me] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
}
