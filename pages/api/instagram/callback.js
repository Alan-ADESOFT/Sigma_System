/**
 * pages/api/instagram/callback.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/instagram/callback?code=<code>&state=<clientId>
 *
 * Callback do OAuth do Instagram Business Login:
 *   1. Troca code → token curto (já vem com user_id)
 *   2. Troca token curto → token longo (60 dias)
 *   3. Busca perfil do IG via graph.instagram.com/{user_id}
 *   4. Salva em instagram_accounts
 *   5. Redireciona para a aba Instagram do cliente
 *
 * Diferenças do fluxo antigo (Facebook Login):
 *   · Não precisa chamar /me/accounts
 *   · O próprio token JÁ aponta pro IG User direto via user_id
 *   · Não precisa de Facebook Page intermediária
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { queryOne } = require('../../../infra/db');
const meta = require('../../../infra/api/meta');
const { saveInstagramAccount } = require('../../../models/instagram.model');
const { createNotification } = require('../../../models/clientForm');

/**
 * Renderiza uma página HTML curta que:
 *   1. Tenta postar mensagem no window.opener (caso aberto via popup)
 *   2. Tenta fechar a janela
 *   3. Se nada disso funcionar (aberto direto, sem opener), redireciona pro dashboard
 */
function renderResultPage(res, { success, clientId, error }) {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || `http://localhost:${process.env.PORT || 3001}`;
  const fallbackUrl = clientId
    ? `${base.replace(/\/$/, '')}/dashboard/clients/${clientId}?tab=instagram&connected=${success ? 'true' : 'false'}${error ? `&error=${encodeURIComponent(error)}` : ''}`
    : `${base.replace(/\/$/, '')}/dashboard`;

  // Sanitiza valores que vão pro JSON inline
  const payload = JSON.stringify({
    type: 'ig-oauth-result',
    success: !!success,
    clientId: clientId || null,
    error: error || null,
  });

  // jsonForHtml escapa < / > pra evitar quebra do <script>
  const safePayload = payload
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const safeFallback = fallbackUrl.replace(/"/g, '&quot;');

  const title = success ? 'Conectado' : 'Erro';
  const msg = success
    ? 'Instagram conectado. Você pode fechar esta janela.'
    : `Falha: ${error || 'erro desconhecido'}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${title} — SIGMA</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    html,body{margin:0;padding:0;background:#050505;color:#f0f0f0;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;}
    .box{max-width:420px;padding:32px;text-align:center;}
    .icon{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;}
    .icon.ok{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;}
    .icon.err{background:rgba(255,0,51,0.1);border:1px solid rgba(255,0,51,0.3);color:#ff1a4d;}
    h1{font-size:0.9rem;letter-spacing:0.04em;margin:0 0 8px;}
    p{font-size:0.72rem;color:#a3a3a3;line-height:1.6;margin:0 0 20px;}
    a{color:#ff6680;font-size:0.7rem;text-decoration:none;border:1px solid rgba(255,0,51,0.3);padding:8px 16px;border-radius:4px;display:inline-block;}
  </style>
</head>
<body>
  <div class="box">
    <div class="icon ${success ? 'ok' : 'err'}">${success ? '✓' : '✕'}</div>
    <h1>${title}</h1>
    <p>${msg}</p>
    <a id="back" href="${safeFallback}">Voltar para o app</a>
  </div>
  <script>
  (function(){
    var data = ${safePayload};
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(data, '*');
      }
    } catch (e) {}
    // Tenta fechar (só funciona se aberto via window.open)
    setTimeout(function(){
      try { window.close(); } catch (e) {}
      // Se não fechou após 800ms, redireciona pro app
      setTimeout(function(){
        if (!window.closed) {
          window.location.replace(${JSON.stringify(fallbackUrl)});
        }
      }, 800);
    }, 200);
  })();
  </script>
</body>
</html>`);
}

export default async function handler(req, res) {
  const { code, state, error, error_reason, error_description } = req.query;

  console.log('[INFO][API:/api/instagram/callback] Callback recebido', {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  // Usuário cancelou OU erro do Instagram
  if (error) {
    console.error('[ERRO][API:/api/instagram/callback] Instagram retornou erro', {
      error,
      error_reason,
      error_description,
    });
    return renderResultPage(res, {
      success: false,
      clientId: state || null,
      error: error_description || error_reason || error,
    });
  }

  if (!code || !state) {
    return renderResultPage(res, {
      success: false,
      clientId: null,
      error: 'Parâmetros code/state ausentes',
    });
  }

  const clientId = state;

  try {
    const tenantId = await resolveTenantId(req);

    const client = await queryOne(
      `SELECT id, company_name FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId]
    );
    if (!client) {
      return renderResultPage(res, { success: false, clientId, error: 'Cliente não encontrado' });
    }

    /* 1. code → token curto (já vem com user_id) */
    const shortToken = await meta.exchangeCodeForToken(code);
    if (!shortToken.userId) {
      throw new Error('Token curto não retornou user_id — verifique escopos');
    }

    /* 2. token curto → token longo */
    const longToken = await meta.getLongLivedToken(shortToken.accessToken);
    const expiresAt = new Date(Date.now() + (longToken.expiresIn || 60 * 24 * 3600) * 1000);

    /* 3. busca perfil completo (usando user_id como ig_user_id) */
    const igUserId = String(shortToken.userId);
    let profile = {};
    try {
      profile = await meta.getIGUserProfile(igUserId, longToken.accessToken);
    } catch (e) {
      console.warn('[WARN] falha ao buscar perfil completo, usando dados mínimos:', e.message);
    }

    /* 4. salva no banco */
    await saveInstagramAccount(tenantId, clientId, {
      igUserId,
      accessToken: longToken.accessToken,
      tokenExpiresAt: expiresAt,
      username: profile.username,
      profilePictureUrl: profile.profile_picture_url,
      followersCount: profile.followers_count || 0,
      followsCount: profile.follows_count || 0,
      mediaCount: profile.media_count || 0,
      biography: profile.biography,
      accountType: profile.account_type || 'BUSINESS',
    });

    console.log('[SUCESSO][API:/api/instagram/callback] Conta Instagram conectada', {
      clientId,
      username: profile.username,
      igUserId,
    });

    // Notificação no sininho
    try {
      await createNotification(
        tenantId,
        'instagram_connected',
        'Instagram conectado',
        `Conta @${profile.username || igUserId} foi conectada ao cliente ${client.company_name}.`,
        clientId,
        { igUserId, username: profile.username }
      );
    } catch (e) {
      console.warn('[WARN] notificação de conexão falhou:', e.message);
    }

    return renderResultPage(res, { success: true, clientId });
  } catch (err) {
    console.error('[ERRO][API:/api/instagram/callback]', {
      error: err.message,
      stack: err.stack,
    });
    return renderResultPage(res, { success: false, clientId, error: err.message });
  }
}
