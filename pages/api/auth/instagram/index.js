export default function handler(req, res) {
  console.log('[INFO][API:/api/auth/instagram] Requisição recebida', { method: req.method, query: req.query });
  const clientId = process.env.INSTAGRAM_APP_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`;

  if (!clientId) {
    return res.status(500).json({ error: 'INSTAGRAM_APP_ID nao configurado.' });
  }

  const scope = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages';

  const authUrl =
    `https://www.instagram.com/oauth/authorize` +
    `?enable_fb_login=0` +
    `&force_reauth=0` +
    `&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${scope}`;

  console.log('[SUCESSO][API:/api/auth/instagram] Redirecionando para OAuth', { authUrl });
  res.redirect(authUrl);
}
