const { upsertAccountFromOAuth } = require('../../../../models/account.model');
const { getOrCreateAdmin } = require('../../../../models/tenant.model');

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    res.redirect('/dashboard/settings?error=oauth_denied');
    return;
  }
  if (!code) {
    res.redirect('/dashboard/settings?error=no_code');
    return;
  }

  // ✅ Usar a variável server-side diretamente, sem NEXT_PUBLIC_
  // O redirect_uri DEVE ser idêntico ao que foi enviado na autorização
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.TUNNEL_URL;
  const redirectUri = `${appUrl}/api/auth/instagram/callback`;

  // Log para debug — confirma o que está sendo enviado ao Meta
  console.log('[Meta OAuth] redirect_uri usado:', redirectUri);

  // ✅ Strip do #_ que o Meta anexa ao final do code
  const cleanCode = code.replace(/#_$/, '');

  try {
    // 1. Short-lived token
    const tokenForm = new URLSearchParams();
    tokenForm.append('client_id', process.env.INSTAGRAM_APP_ID);
    tokenForm.append('client_secret', process.env.INSTAGRAM_APP_SECRET);
    tokenForm.append('grant_type', 'authorization_code');
    tokenForm.append('redirect_uri', redirectUri);
    tokenForm.append('code', cleanCode);

    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: tokenForm,
    });
    const tokenData = await tokenRes.json();

    console.log('[Meta OAuth] Resposta token completa:', JSON.stringify(tokenData));

    // ✅ CORREÇÃO CRÍTICA: a API nova retorna { data: [{ access_token, user_id }] }
    // mas a API antiga retorna { access_token, user_id } diretamente na raiz
    // Este código suporta os dois formatos:
    const tokenPayload = Array.isArray(tokenData.data)
      ? tokenData.data[0]
      : tokenData;

    if (!tokenPayload?.access_token) {
      console.error('[Meta OAuth] Falha short-lived:', tokenData);
      throw new Error('Falha ao obter token');
    }

    const shortLivedToken = tokenPayload.access_token;
    const userId = String(tokenPayload.user_id);

    // 2. Long-lived token (60 dias)
    const longLivedRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`
    );
    const longLivedData = await longLivedRes.json();

    console.log('[Meta OAuth] Long-lived response:', JSON.stringify(longLivedData));

    if (!longLivedData.access_token) throw new Error('Falha long-lived token');

    const longLivedToken = longLivedData.access_token;
    const expiresAt = Math.floor(Date.now() / 1000) + (longLivedData.expires_in ?? 5183944);

    // 3. Dados do perfil
    const profileRes = await fetch(
      `https://graph.instagram.com/v25.0/me?fields=username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website&access_token=${longLivedToken}`
    );
    const profile = await profileRes.json();

    console.log('[Meta OAuth] Profile:', JSON.stringify(profile));

    // 4. Garantir que existe um admin tenant
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@dashboard.local';
    const tenant = await getOrCreateAdmin(adminEmail, 'Admin');

    // 5. Salvar conta no banco vinculada ao tenant admin
    await upsertAccountFromOAuth(tenant.id, userId, {
      access_token: longLivedToken,
      expires_at: expiresAt,
      username: profile.username ?? '',
      name: profile.name ?? '',
      biography: profile.biography ?? '',
      followers_count: profile.followers_count ?? 0,
      follows_count: profile.follows_count ?? 0,
      media_count: profile.media_count ?? 0,
      website: profile.website ?? '',
      picture: profile.profile_picture_url ?? '',
    });

    console.log(`[Meta OAuth] @${profile.username} conectada ao tenant ${tenant.id}`);

    res.redirect(
      `/dashboard/settings?success=meta_connected&username=${encodeURIComponent(profile.username || '')}`
    );
  } catch (err) {
    console.error('[Meta OAuth] Erro detalhado:', err.message);
    res.redirect('/dashboard/settings?error=auth_failed');
  }
}
