/**
 * POST /api/auth/logout
 * Invalida o cookie de sessão.
 */

export default function handler(req, res) {
  console.log('[INFO][API:/api/auth/logout] Requisição recebida', { method: req.method, query: req.query });

  if (req.method !== 'POST') return res.status(405).end();

  /* Expira o cookie imediatamente */
  res.setHeader('Set-Cookie', 'sigma_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  console.log('[SUCESSO][API:/api/auth/logout] Logout realizado');
  return res.json({ success: true });
}
