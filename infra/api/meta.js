/**
 * infra/api/meta.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrapper para Instagram API com Instagram Login (Business Login).
 *
 * Esse é o fluxo NOVO da Meta (lançado julho/2024) — substitui o Facebook
 * Login for Business para integrações com Instagram. Diferenças importantes
 * versus o fluxo antigo:
 *
 *   · Authorization URL → api.instagram.com/oauth/authorize (NÃO facebook.com)
 *   · Token exchange    → api.instagram.com/oauth/access_token (POST form-data)
 *   · Long-lived/refresh → graph.instagram.com (NÃO graph.facebook.com)
 *   · Não precisa de Facebook Page intermediária
 *   · O próprio token JÁ aponta pro IG User direto (sem /me/accounts)
 *   · Scopes novos: instagram_business_*  (os antigos foram depreciados em
 *     27/01/2025)
 *
 * Multi-tenancy estrita: TODA chamada recebe accessToken explicitamente.
 * NUNCA reuse token entre clientes.
 *
 * Métricas v22+ válidas (não usar depreciadas):
 *   OK: impressions, reach, total_interactions, accounts_engaged, views,
 *       follower_count, profile_views
 *   DEPRECIADAS: video_views (não-reels), email_contacts, website_clicks,
 *       phone_call_clicks
 * ─────────────────────────────────────────────────────────────────────────────
 */

const GRAPH_VERSION = 'v22.0';

// Hosts do Instagram Business Login
const IG_OAUTH_HOST   = 'https://api.instagram.com';
const IG_GRAPH_HOST   = 'https://graph.instagram.com';
const IG_GRAPH_BASE   = `${IG_GRAPH_HOST}/${GRAPH_VERSION}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Scopes do Instagram Business Login (novos, válidos pós jan/2025)
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
];

/**
 * Resolve credenciais do app pro fluxo Instagram Business Login.
 *
 * IMPORTANTE: o Meta App "parent" tem um ID (META_APP_ID) DIFERENTE do
 * "app do Instagram" criado dentro do produto Instagram (INSTAGRAM_APP_ID).
 * Pro OAuth `api.instagram.com/oauth/authorize` o client_id correto é o
 * do "app do Instagram" — usar o META_APP_ID gera erro "Invalid platform app".
 *
 * Onde encontrar no painel:
 *   Painel Meta → produto Instagram → Configurações
 *   - "ID do app do Instagram"     → INSTAGRAM_APP_ID
 *   - "Chave secreta do app do Instagram" → INSTAGRAM_APP_SECRET
 */
function getAppCredentials() {
  // Prioriza INSTAGRAM_APP_ID (correto pro fluxo de Business Login)
  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      'INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET obrigatórios no .env. ' +
      'Pegue em: Painel Meta → produto Instagram → Configurações'
    );
  }
  return { appId, appSecret };
}

/**
 * Resolve o redirect_uri usado no OAuth.
 * Prioridade:
 *   1. META_REDIRECT_URI (explícito)
 *   2. NEXT_PUBLIC_BASE_URL + /api/instagram/callback
 *   3. NEXT_PUBLIC_APP_URL + /api/instagram/callback
 *   4. localhost
 */
function resolveRedirectUri() {
  if (process.env.META_REDIRECT_URI?.trim()) return process.env.META_REDIRECT_URI.trim();
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || `http://localhost:${process.env.PORT || 3001}`;
  return `${base.replace(/\/$/, '')}/api/instagram/callback`;
}

/**
 * Monta a URL de autorização do Instagram Business Login.
 * @param {string} state - valor opaco devolvido pelo Instagram no callback (CSRF / contexto)
 */
function buildAuthorizeUrl(state) {
  const { appId } = getAppCredentials();
  const redirectUri = resolveRedirectUri();

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(','),
    response_type: 'code',
  });
  if (state) params.set('state', state);

  return `${IG_OAUTH_HOST}/oauth/authorize?${params.toString()}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Helper interno — fetch + tratamento de erro padronizado
───────────────────────────────────────────────────────────────────────────── */
async function metaFetch(url, init = {}, label = 'request') {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = { raw: text }; }

    if (!res.ok || data.error || data.error_type) {
      const msg = data.error?.message
        || data.error_message
        || data.error?.type
        || `HTTP ${res.status}`;
      console.error(`[ERRO][Meta] ${label} →`, { status: res.status, msg, body: data });
      const err = new Error(msg);
      err.metaCode = data.error?.code;
      err.metaSubcode = data.error?.error_subcode;
      err.httpStatus = res.status;
      throw err;
    }
    return data;
  } catch (err) {
    if (!err.metaCode && !err.httpStatus) {
      console.error(`[ERRO][Meta] ${label} → falha de rede`, { error: err.message });
    }
    throw err;
  }
}

/* ═════════════════════════════════════════════════════════════════════════════
   OAUTH (Instagram Business Login)
═════════════════════════════════════════════════════════════════════════════ */

/**
 * Troca o code do OAuth por um token curto (~1h).
 * Endpoint: POST https://api.instagram.com/oauth/access_token (form-data)
 *
 * Resposta inclui:
 *   { access_token, user_id, permissions }
 */
async function exchangeCodeForToken(code) {
  console.log('[INFO][Meta] Trocando code por token curto (Instagram OAuth)');

  const { appId, appSecret } = getAppCredentials();
  const redirectUri = resolveRedirectUri();

  const body = new URLSearchParams();
  body.set('client_id', appId);
  body.set('client_secret', appSecret);
  body.set('grant_type', 'authorization_code');
  body.set('redirect_uri', redirectUri);
  body.set('code', code);

  const data = await metaFetch(
    `${IG_OAUTH_HOST}/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    'exchangeCodeForToken'
  );

  console.log('[SUCESSO][Meta] Token curto obtido', { userId: data.user_id });
  return {
    accessToken: data.access_token,
    userId: data.user_id,         // já é o IG user ID — não precisa de /me/accounts
    permissions: data.permissions || [],
  };
}

/**
 * Troca um token curto por um long-lived (~60 dias).
 * Endpoint: GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token
 */
async function getLongLivedToken(shortToken) {
  console.log('[INFO][Meta] Trocando token curto por long-lived');

  const { appSecret } = getAppCredentials();

  const url = `${IG_GRAPH_HOST}/access_token`
    + `?grant_type=ig_exchange_token`
    + `&client_secret=${encodeURIComponent(appSecret)}`
    + `&access_token=${encodeURIComponent(shortToken)}`;

  const data = await metaFetch(url, {}, 'getLongLivedToken');
  console.log('[SUCESSO][Meta] Token longo obtido', { expiresIn: data.expires_in });
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 60 * 24 * 3600,
  };
}

/**
 * Renova um token long-lived (precisa ter 24h+ de idade).
 * Endpoint: GET https://graph.instagram.com/refresh_access_token
 */
async function refreshToken(longLivedToken) {
  console.log('[INFO][Meta] Renovando token longo');

  const url = `${IG_GRAPH_HOST}/refresh_access_token`
    + `?grant_type=ig_refresh_token`
    + `&access_token=${encodeURIComponent(longLivedToken)}`;

  const data = await metaFetch(url, {}, 'refreshToken');
  console.log('[SUCESSO][Meta] Token renovado', { expiresIn: data.expires_in });
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 60 * 24 * 3600,
  };
}

/* ═════════════════════════════════════════════════════════════════════════════
   PERFIL & MÍDIA
═════════════════════════════════════════════════════════════════════════════ */

/**
 * Busca dados do perfil do IG User conectado.
 * Endpoint: GET https://graph.instagram.com/v22.0/{ig-user-id}
 */
async function getIGUserProfile(igUserId, accessToken) {
  console.log('[INFO][Meta] Buscando perfil IG', { igUserId });

  const fields = [
    'id', 'user_id', 'username', 'name', 'biography',
    'followers_count', 'follows_count', 'media_count',
    'profile_picture_url', 'website', 'account_type',
  ].join(',');

  const url = `${IG_GRAPH_BASE}/${igUserId}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;
  const data = await metaFetch(url, {}, 'getIGUserProfile');

  console.log('[SUCESSO][Meta] Perfil obtido', { username: data.username });
  return data;
}

/**
 * Insights da conta agregados por período.
 * period: 'day' | 'week' | 'days_28'
 *
 * IMPORTANTE — restrições da v22:
 *   · `impressions` foi DEPRECADO em v22 — NÃO usar
 *   · `follower_count` só aceita period=day (com since/until) — não days_28
 *   · As demais métricas (reach, views, accounts_engaged, total_interactions,
 *     profile_views) precisam de metric_type=total_value
 *
 * Por isso fazemos 2 chamadas separadas e combinamos.
 *
 * Mapeia 'month' do front pra 'days_28' que é o que a Meta entende.
 */
async function getAccountInsights(igUserId, accessToken, period = 'days_28') {
  console.log('[INFO][Meta] Buscando insights da conta', { igUserId, period });

  // Normaliza o período (front pode mandar 'month' ou 'week')
  const normPeriod =
    period === 'month' ? 'days_28' :
    period === '90d'   ? 'days_28' :
    period;

  const out = {};

  // ── CHAMADA 1: métricas agregadas (precisam metric_type=total_value) ──
  const aggMetrics = [
    'reach',
    'views',
    'accounts_engaged',
    'total_interactions',
    'profile_views',
  ].join(',');

  const url1 = `${IG_GRAPH_BASE}/${igUserId}/insights`
    + `?metric=${aggMetrics}`
    + `&period=${normPeriod}`
    + `&metric_type=total_value`
    + `&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const data = await metaFetch(url1, {}, 'getAccountInsights:agg');
    for (const item of data.data || []) {
      const v = item.total_value?.value
        ?? item.values?.[0]?.value
        ?? 0;
      out[item.name] = typeof v === 'number' ? v : 0;
    }
    console.log('[SUCESSO][Meta] Insights agg', out);
  } catch (err) {
    console.error('[ERRO][Meta] insights agg falhou:', {
      message: err.message,
      code: err.metaCode,
      url: url1.replace(/access_token=[^&]+/, 'access_token=***'),
    });
  }

  // ── CHAMADA 2: follower_count (só aceita period=day, não days_28) ──
  // Pega o crescimento líquido nos últimos N dias
  const days = normPeriod === 'days_28' ? 28 : normPeriod === 'week' ? 7 : 1;
  const since = Math.floor((Date.now() - days * 86400000) / 1000);
  const until = Math.floor(Date.now() / 1000);

  const url2 = `${IG_GRAPH_BASE}/${igUserId}/insights`
    + `?metric=follower_count`
    + `&period=day`
    + `&since=${since}&until=${until}`
    + `&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const data = await metaFetch(url2, {}, 'getAccountInsights:followers');
    const item = (data.data || [])[0];
    if (item && Array.isArray(item.values)) {
      // Soma o delta diário pra ter o crescimento total no período
      const total = item.values.reduce((sum, v) => sum + (v.value || 0), 0);
      out.follower_count = total;
    }
  } catch (err) {
    // follower_count pode não estar disponível em todas as contas
    console.warn('[WARN][Meta] follower_count não disponível:', err.message);
  }

  console.log('[SUCESSO][Meta] Insights da conta consolidados', {
    metricsObtained: Object.keys(out).length,
    values: out,
  });
  return out;
}

/**
 * Lista as N mídias mais recentes da conta.
 * Endpoint: GET https://graph.instagram.com/v22.0/{ig-user-id}/media
 */
async function getRecentMedia(igUserId, accessToken, limit = 12) {
  console.log('[INFO][Meta] Buscando mídias recentes', { igUserId, limit });

  const fields = [
    'id', 'caption', 'media_type', 'media_product_type',
    'media_url', 'thumbnail_url', 'permalink', 'timestamp',
    'like_count', 'comments_count',
  ].join(',');

  const url = `${IG_GRAPH_BASE}/${igUserId}/media`
    + `?fields=${fields}`
    + `&limit=${limit}`
    + `&access_token=${encodeURIComponent(accessToken)}`;

  const data = await metaFetch(url, {}, 'getRecentMedia');
  console.log('[SUCESSO][Meta] Mídias recentes obtidas', { count: (data.data || []).length });
  return data.data || [];
}

/**
 * Insights de uma mídia específica.
 */
async function getMediaInsights(igMediaId, accessToken) {
  console.log('[INFO][Meta] Buscando insights de mídia', { igMediaId });

  const metrics = 'impressions,reach,saved,total_interactions,views';
  const url = `${IG_GRAPH_BASE}/${igMediaId}/insights`
    + `?metric=${metrics}`
    + `&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const data = await metaFetch(url, {}, 'getMediaInsights');
    const out = {};
    for (const item of data.data || []) {
      const v = item.values?.[0]?.value;
      out[item.name] = typeof v === 'number' ? v : 0;
    }
    return out;
  } catch (err) {
    console.warn('[WARN][Meta] Falha em insights de mídia:', err.message);
    return {};
  }
}

/* ═════════════════════════════════════════════════════════════════════════════
   PUBLICAÇÃO
═════════════════════════════════════════════════════════════════════════════ */

/**
 * Cria um container de mídia.
 * Endpoint: POST https://graph.instagram.com/{ig-user-id}/media
 */
async function createMediaContainer(igUserId, accessToken, params) {
  console.log('[INFO][Meta] Criando container', { igUserId, mediaType: params.mediaType });

  const body = new URLSearchParams();
  body.set('access_token', accessToken);

  const t = (params.mediaType || 'IMAGE').toUpperCase();

  if (t === 'IMAGE') {
    if (!params.imageUrl) throw new Error('imageUrl obrigatório para IMAGE');
    body.set('image_url', params.imageUrl);
    if (params.caption) body.set('caption', params.caption);
    if (params.isCarouselItem) body.set('is_carousel_item', 'true');
  } else if (t === 'REELS') {
    if (!params.videoUrl) throw new Error('videoUrl obrigatório para REELS');
    body.set('media_type', 'REELS');
    body.set('video_url', params.videoUrl);
    if (params.caption) body.set('caption', params.caption);
    body.set('share_to_feed', params.shareToFeed === false ? 'false' : 'true');
  } else if (t === 'VIDEO') {
    if (!params.videoUrl) throw new Error('videoUrl obrigatório para VIDEO');
    body.set('media_type', 'VIDEO');
    body.set('video_url', params.videoUrl);
    if (params.caption) body.set('caption', params.caption);
    if (params.isCarouselItem) body.set('is_carousel_item', 'true');
  } else if (t === 'CAROUSEL') {
    if (!params.children || params.children.length === 0) {
      throw new Error('children obrigatório para CAROUSEL');
    }
    body.set('media_type', 'CAROUSEL');
    body.set('children', params.children.join(','));
    if (params.caption) body.set('caption', params.caption);
  } else if (t === 'STORIES') {
    body.set('media_type', 'STORIES');
    if (params.videoUrl) body.set('video_url', params.videoUrl);
    else if (params.imageUrl) body.set('image_url', params.imageUrl);
    else throw new Error('imageUrl ou videoUrl obrigatório para STORIES');
  } else {
    throw new Error(`mediaType inválido: ${t}`);
  }

  const url = `${IG_GRAPH_BASE}/${igUserId}/media`;
  const data = await metaFetch(
    url,
    { method: 'POST', body },
    'createMediaContainer'
  );

  if (!data.id) throw new Error('Container criado mas sem ID');
  console.log('[SUCESSO][Meta] Container criado', { containerId: data.id });
  return data.id;
}

/**
 * Verifica o status de um container.
 */
async function checkContainerStatus(containerId, accessToken) {
  const url = `${IG_GRAPH_BASE}/${containerId}`
    + `?fields=status_code,status`
    + `&access_token=${encodeURIComponent(accessToken)}`;

  const data = await metaFetch(url, {}, 'checkContainerStatus');
  return {
    statusCode: data.status_code,
    status: data.status,
  };
}

/**
 * Publica um container já processado.
 */
async function publishContainer(igUserId, accessToken, containerId) {
  console.log('[INFO][Meta] Publicando container', { containerId });

  const body = new URLSearchParams();
  body.set('creation_id', containerId);
  body.set('access_token', accessToken);

  const url = `${IG_GRAPH_BASE}/${igUserId}/media_publish`;
  const data = await metaFetch(
    url,
    { method: 'POST', body },
    'publishContainer'
  );

  console.log('[SUCESSO][Meta] Mídia publicada', { igMediaId: data.id });
  return data.id;
}

/**
 * Faz polling do status de um container até FINISHED ou ERROR.
 */
async function waitForContainer(containerId, accessToken, maxWaitMs = 60000) {
  const interval = 5000;
  const maxAttempts = Math.ceil(maxWaitMs / interval);
  console.log('[INFO][Meta] Aguardando processamento', { containerId, maxAttempts });

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(interval);
    try {
      const { statusCode } = await checkContainerStatus(containerId, accessToken);
      console.log('[INFO][Meta] Status container', { containerId, attempt: i + 1, statusCode });

      if (statusCode === 'FINISHED') return { ok: true };
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        return { ok: false, error: `Container ${statusCode}` };
      }
    } catch (err) {
      console.warn('[WARN][Meta] Erro temporário no polling:', err.message);
    }
  }

  return { ok: false, error: 'timeout aguardando processamento' };
}

/* ═════════════════════════════════════════════════════════════════════════════
   EXPORTS
═════════════════════════════════════════════════════════════════════════════ */

module.exports = {
  GRAPH_VERSION,
  SCOPES,
  resolveRedirectUri,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getLongLivedToken,
  refreshToken,
  getIGUserProfile,
  getAccountInsights,
  getRecentMedia,
  getMediaInsights,
  createMediaContainer,
  checkContainerStatus,
  publishContainer,
  waitForContainer,
};
