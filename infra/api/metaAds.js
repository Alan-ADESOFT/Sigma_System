/**
 * infra/api/metaAds.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrapper da Meta Marketing API (Facebook Login for Business).
 *
 * NÃO confundir com infra/api/meta.js — aquele é o fluxo do Instagram Business
 * Login (api.instagram.com / graph.instagram.com). Este aqui é o fluxo da
 * Marketing API: graph.facebook.com + www.facebook.com/dialog/oauth.
 *
 * Multi-tenancy estrita: TODA chamada recebe accessToken explicitamente.
 * NUNCA reuse token entre clientes. NUNCA logue o token completo.
 *
 * Erros tipados:
 *   · TokenInvalidError  — code 190 (token expirado/revogado)
 *   · MetaRateLimitError — code 4 ou 17
 *   · MetaApiError       — outros erros da Meta
 * ─────────────────────────────────────────────────────────────────────────────
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v22.0';
const GRAPH_BASE    = 'https://graph.facebook.com';
const FB_OAUTH_HOST = 'https://www.facebook.com';

const FETCH_TIMEOUT = 8000;

// Scopes obrigatórios para Marketing API
const ADS_SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_read_engagement',
  'pages_show_list',
  'instagram_basic',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─── Erros tipados ─────────────────────────────────────────────────────── */

class MetaApiError extends Error {
  constructor(message, code, subcode, httpStatus) {
    super(message);
    this.name = 'MetaApiError';
    this.code = code;
    this.subcode = subcode;
    this.httpStatus = httpStatus;
  }
}
class TokenInvalidError extends MetaApiError {
  constructor(message, subcode) {
    super(message, 190, subcode, 401);
    this.name = 'TokenInvalidError';
  }
}
class MetaRateLimitError extends MetaApiError {
  constructor(message, code) {
    super(message, code, null, 429);
    this.name = 'MetaRateLimitError';
  }
}

/* ─── Helpers de credenciais ────────────────────────────────────────────── */

function getAppCredentials() {
  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      'INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET obrigatórios no .env para Meta Ads OAuth.'
    );
  }
  return { appId, appSecret };
}

function resolveRedirectUri() {
  if (process.env.META_ADS_REDIRECT_URI?.trim()) return process.env.META_ADS_REDIRECT_URI.trim();
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || `http://localhost:${process.env.PORT || 3001}`;
  return `${base.replace(/\/$/, '')}/api/ads/accounts/oauth-callback`;
}

function maskToken(token) {
  if (!token || typeof token !== 'string') return '<missing>';
  return token.slice(0, 8) + '...';
}

/* ─── Circuit breaker (compartilhado) ───────────────────────────────────── */

const breaker = { failures: 0, lastFailure: 0, isOpen: false, threshold: 5, resetTimeout: 60000 };
function canProceed() {
  if (!breaker.isOpen) return true;
  if (Date.now() - breaker.lastFailure > breaker.resetTimeout) {
    breaker.isOpen = false;
    breaker.failures = 0;
    return true;
  }
  return false;
}
function recordFailure() {
  breaker.failures++;
  breaker.lastFailure = Date.now();
  if (breaker.failures >= breaker.threshold) breaker.isOpen = true;
}
function recordSuccess() {
  breaker.failures = Math.max(0, breaker.failures - 1);
}

/* ─── Mapper de erros da Meta ───────────────────────────────────────────── */

function buildMetaError(httpStatus, errBody) {
  const meta = errBody?.error || {};
  const code = meta.code;
  const subcode = meta.error_subcode;
  const message = meta.message || `HTTP ${httpStatus}`;

  if (code === 190) return new TokenInvalidError(message, subcode);
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return new MetaRateLimitError(message, code);
  }
  return new MetaApiError(message, code, subcode, httpStatus);
}

/* ─── Fetch genérico (GET) ──────────────────────────────────────────────── */

async function graphGet(path, token, params = {}) {
  if (!canProceed()) throw new MetaApiError('Circuit breaker aberto.', null, null, 503);

  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      recordFailure();
      const errBody = await res.json().catch(() => ({}));
      throw buildMetaError(res.status, errBody);
    }
    recordSuccess();
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ─── Fetch genérico (POST form-encoded) ────────────────────────────────── */

async function graphPost(path, token, body = {}) {
  if (!canProceed()) throw new MetaApiError('Circuit breaker aberto.', null, null, 503);

  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${path}`;
  const formData = new URLSearchParams();
  Object.entries(body).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    formData.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      recordFailure();
      const errBody = await res.json().catch(() => ({}));
      throw buildMetaError(res.status, errBody);
    }
    recordSuccess();
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ─── Paginação automática ──────────────────────────────────────────────── */

async function graphGetAll(path, token, params = {}) {
  let allData = [];
  const u = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) u.searchParams.set(k, v);
  });
  let url = u.toString();

  while (url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        recordFailure();
        const errBody = await res.json().catch(() => ({}));
        throw buildMetaError(res.status, errBody);
      }
      recordSuccess();
      const json = await res.json();
      allData = allData.concat(json.data || []);
      url = json.paging?.next || null;
      if (url) await sleep(150);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return allData;
}

/* ─── OAuth ─────────────────────────────────────────────────────────────── */

function buildAuthorizeUrl(state) {
  const { appId } = getAppCredentials();
  const redirectUri = resolveRedirectUri();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: ADS_SCOPES.join(','),
    response_type: 'code',
    state: state || '',
  });
  const url = `${FB_OAUTH_HOST}/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  console.log('[INFO][MetaAds] buildAuthorizeUrl', { redirectUri });
  return url;
}

async function exchangeCodeForToken(code, redirectUriOverride) {
  const { appId, appSecret } = getAppCredentials();
  const redirectUri = redirectUriOverride || resolveRedirectUri();

  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code', code);

  console.log('[INFO][MetaAds] exchangeCodeForToken', { redirectUri });
  const res = await fetch(url.toString());
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw buildMetaError(res.status, errBody);
  }
  const json = await res.json();
  console.log('[SUCESSO][MetaAds] exchangeCodeForToken', { token: maskToken(json.access_token) });
  return {
    accessToken: json.access_token,
    tokenType: json.token_type || 'bearer',
    expiresIn: json.expires_in || null,
  };
}

async function getLongLivedToken(shortToken) {
  const { appId, appSecret } = getAppCredentials();
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortToken);

  console.log('[INFO][MetaAds] getLongLivedToken', { token: maskToken(shortToken) });
  const res = await fetch(url.toString());
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw buildMetaError(res.status, errBody);
  }
  const json = await res.json();
  console.log('[SUCESSO][MetaAds] getLongLivedToken', { newToken: maskToken(json.access_token), expiresIn: json.expires_in });
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in || 60 * 24 * 3600,
  };
}

async function debugToken(token) {
  const { appId, appSecret } = getAppCredentials();
  const appAccessToken = `${appId}|${appSecret}`;
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/debug_token`);
  url.searchParams.set('input_token', token);
  url.searchParams.set('access_token', appAccessToken);

  console.log('[INFO][MetaAds] debugToken', { token: maskToken(token) });
  const res = await fetch(url.toString());
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw buildMetaError(res.status, errBody);
  }
  const json = await res.json();
  const data = json.data || {};
  return {
    isValid: !!data.is_valid,
    appId: data.app_id,
    userId: data.user_id,
    scopes: data.scopes || [],
    expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
    dataAccessExpiresAt: data.data_access_expires_at ? new Date(data.data_access_expires_at * 1000) : null,
    error: data.error || null,
  };
}

/* ─── Discovery ─────────────────────────────────────────────────────────── */

async function getMyAdAccounts(token) {
  return graphGetAll('me/adaccounts', token, {
    fields: 'id,account_id,name,currency,timezone_name,account_status,amount_spent,balance,business',
    limit: 100,
  });
}

async function getAdAccount(token, accountId) {
  return graphGet(accountId, token, {
    fields: 'id,account_id,name,currency,timezone_name,account_status,amount_spent,balance,spend_cap,business',
  });
}

async function getBusinessPages(token, businessId) {
  if (!businessId) {
    return graphGetAll('me/accounts', token, { fields: 'id,name,access_token,instagram_business_account', limit: 100 });
  }
  return graphGetAll(`${businessId}/owned_pages`, token, {
    fields: 'id,name,instagram_business_account',
    limit: 100,
  });
}

async function getInstagramAccounts(token, pageId) {
  const data = await graphGet(pageId, token, {
    fields: 'instagram_business_account{id,username,profile_picture_url}',
  });
  return data?.instagram_business_account ? [data.instagram_business_account] : [];
}

/* ─── Read: campanhas, adsets, ads, creative ────────────────────────────── */

async function getCampaigns(token, accountId, opts = {}) {
  const params = {
    fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,created_time,updated_time,start_time,stop_time,buying_type',
    limit: 100,
  };
  if (opts.statusFilter?.length) params.effective_status = JSON.stringify(opts.statusFilter);
  return graphGetAll(`${accountId}/campaigns`, token, params);
}

async function getAdSets(token, accountId, campaignId) {
  const path = campaignId ? `${campaignId}/adsets` : `${accountId}/adsets`;
  return graphGetAll(path, token, {
    fields: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,budget_remaining,billing_event,optimization_goal,bid_amount,targeting,created_time,start_time,end_time',
    limit: 100,
  });
}

async function getAds(token, accountId, adsetId) {
  const path = adsetId ? `${adsetId}/ads` : `${accountId}/ads`;
  return graphGetAll(path, token, {
    fields: 'id,name,adset_id,campaign_id,status,effective_status,creative{id,thumbnail_url,image_url,body,title,link_url,object_story_spec},created_time',
    limit: 100,
  });
}

async function getAdCreative(token, creativeId) {
  return graphGet(creativeId, token, {
    fields: 'id,name,thumbnail_url,image_url,body,title,link_url,object_story_spec,call_to_action_type',
  });
}

/* ─── Insights ──────────────────────────────────────────────────────────── */

const INSIGHTS_FIELDS = [
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'impressions', 'clicks', 'spend', 'cpc', 'cpm', 'ctr', 'reach', 'frequency',
  'actions', 'cost_per_action_type', 'purchase_roas', 'inline_link_clicks', 'inline_link_click_ctr',
  'date_start', 'date_stop', 'objective', 'account_currency',
].join(',');

/**
 * Insights genérico.
 * params: { level, datePreset?, timeRange?, timeIncrement?, breakdowns? }
 */
async function getInsights(token, targetId, params = {}) {
  const queryParams = {
    fields: INSIGHTS_FIELDS,
    level: params.level || 'campaign',
    limit: 500,
  };
  if (params.datePreset && params.datePreset !== 'lifetime') queryParams.date_preset = params.datePreset;
  if (params.timeRange) queryParams.time_range = JSON.stringify(params.timeRange);
  if (params.timeIncrement) queryParams.time_increment = params.timeIncrement;
  if (params.breakdowns) queryParams.breakdowns = params.breakdowns;
  if (params.actionBreakdowns) queryParams.action_breakdowns = params.actionBreakdowns;

  return graphGetAll(`${targetId}/insights`, token, queryParams);
}

async function getDailyInsights(token, accountId, range) {
  const params = { level: 'account', timeIncrement: '1' };
  if (range?.datePreset) params.datePreset = range.datePreset;
  if (range?.timeRange) params.timeRange = range.timeRange;
  return getInsights(token, accountId, params);
}

async function getBreakdownInsights(token, accountId, breakdowns, range) {
  const params = { level: 'account', breakdowns };
  if (range?.datePreset) params.datePreset = range.datePreset;
  if (range?.timeRange) params.timeRange = range.timeRange;
  return getInsights(token, accountId, params);
}

/* ─── Write: status e budget ────────────────────────────────────────────── */

async function updateStatus(token, objectId, status) {
  if (!['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'].includes(status)) {
    throw new MetaApiError(`Status inválido: ${status}`, null, null, 400);
  }
  const result = await graphPost(objectId, token, { status });
  return result?.success === true || !!result?.id;
}

async function updateBudget(token, objectId, dailyBudget, lifetimeBudget) {
  const body = {};
  if (dailyBudget != null) body.daily_budget = Math.round(Number(dailyBudget) * 100).toString();
  if (lifetimeBudget != null) body.lifetime_budget = Math.round(Number(lifetimeBudget) * 100).toString();
  if (Object.keys(body).length === 0) {
    throw new MetaApiError('Nenhum budget fornecido', null, null, 400);
  }
  const result = await graphPost(objectId, token, body);
  return result?.success === true || !!result?.id;
}

/* ─── Exports ───────────────────────────────────────────────────────────── */

module.exports = {
  // Constants
  ADS_SCOPES,
  GRAPH_VERSION,

  // Errors
  MetaApiError,
  TokenInvalidError,
  MetaRateLimitError,

  // OAuth
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getLongLivedToken,
  debugToken,

  // Discovery
  getMyAdAccounts,
  getAdAccount,
  getBusinessPages,
  getInstagramAccounts,

  // Read
  getCampaigns,
  getAdSets,
  getAds,
  getAdCreative,
  getInsights,
  getDailyInsights,
  getBreakdownInsights,

  // Write
  updateStatus,
  updateBudget,

  // Helpers (internos, exportados para reuso)
  resolveRedirectUri,
  maskToken,
};
