/**
 * POST /api/auth/logout
 * Invalida o cookie de sessão.
 */

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  /* Expira o cookie imediatamente */
  res.setHeader('Set-Cookie', 'sigma_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  return res.json({ success: true });
}
