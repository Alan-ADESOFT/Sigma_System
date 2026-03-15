/**
 * POST /api/auth/login
 * Autentica usuário por e-mail OU username + senha.
 * Retorna token de sessão e dados do usuário.
 */

const { getDb } = require('../../../infra/db');
const { verifyPassword, generateToken } = require('../../../lib/auth');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { credential, password } = req.body || {};

  /* Validação básica de entrada */
  if (!credential?.trim() || !password?.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Credencial e senha são obrigatórios.',
    });
  }

  try {
    const sql = getDb();
    const cred = credential.trim().toLowerCase();

    /* Busca por e-mail (case-insensitive) OU username */
    const rows = await sql`
      SELECT id, name, email, username, password, role, avatar_url, is_active
      FROM tenants
      WHERE (LOWER(email) = ${cred} OR LOWER(username) = ${cred})
        AND is_active = true
      LIMIT 1
    `;

    const user = rows[0];

    /* Mesmo erro para usuário não encontrado e senha errada (evita enumeração) */
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({
        success: false,
        error: 'Credenciais inválidas. Verifique seu e-mail / usuário e senha.',
      });
    }

    /* Gera token assinado */
    const token = generateToken(user.id);

    /* Define cookie httpOnly de sessão (7 dias) */
    const cookieOpts = [
      `sigma_token=${token}`,
      'HttpOnly',
      'Path=/',
      'Max-Age=604800',
      'SameSite=Lax',
      ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
    ].join('; ');
    res.setHeader('Set-Cookie', cookieOpts);

    return res.json({
      success: true,
      token,
      user: {
        id:       user.id,
        name:     user.name,
        email:    user.email,
        username: user.username,
        role:     user.role,
        avatarUrl: user.avatar_url,
      },
    });
  } catch (err) {
    console.error('[/api/auth/login]', err);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor.' });
  }
}
