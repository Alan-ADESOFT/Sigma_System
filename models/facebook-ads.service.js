const GRAPH_BASE = 'https://graph.facebook.com';
const GRAPH_VERSION = 'v25.0';

function metaHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Circuit Breaker ---
function createCircuitBreaker(threshold = 5, resetTimeout = 60000) {
  return { failures: 0, lastFailure: 0, isOpen: false, threshold, resetTimeout };
}

const coreCircuitBreaker = createCircuitBreaker(5, 60000);

function checkCircuitBreaker(breaker = coreCircuitBreaker) {
  if (!breaker.isOpen) return true;
  if (Date.now() - breaker.lastFailure > breaker.resetTimeout) {
    breaker.isOpen = false;
    breaker.failures = 0;
    return true;
  }
  return false;
}

function recordFailure(breaker = coreCircuitBreaker) {
  breaker.failures++;
  breaker.lastFailure = Date.now();
  if (breaker.failures >= breaker.threshold) breaker.isOpen = true;
}

function recordSuccess(breaker = coreCircuitBreaker) {
  breaker.failures = Math.max(0, breaker.failures - 1);
}

// --- Cache ---
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const FETCH_TIMEOUT = 8000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data, ttl = CACHE_TTL) {
  if (Array.isArray(data) && data.length === 0) return;
  cache.set(key, { data, ts: Date.now(), ttl });
}

function clearAdsCache() {
  cache.clear();
}

// --- Generic Fetch ---
async function graphGet(path, token, params = {}) {
  if (!checkCircuitBreaker()) throw new Error('Circuit breaker aberto.');
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url.toString(), { headers: metaHeaders(token), signal: controller.signal });
    if (!res.ok) {
      recordFailure();
      const errBody = await res.json().catch(() => ({}));
      throw new Error(`Meta Ads API: ${errBody?.error?.message || `HTTP ${res.status}`}`);
    }
    recordSuccess();
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function graphPost(path, token, body = {}) {
  if (!checkCircuitBreaker()) throw new Error('Circuit breaker aberto.');
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${path}`;
  const formData = new URLSearchParams();
  Object.entries(body).forEach(([k, v]) => formData.set(k, typeof v === 'string' ? v : JSON.stringify(v)));
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...metaHeaders(token), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });
  if (!res.ok) {
    recordFailure();
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Meta Ads API POST: ${errBody?.error?.message || `HTTP ${res.status}`}`);
  }
  recordSuccess();
  return res.json();
}

// --- Paginated Fetch ---
async function graphGetAll(path, token, params = {}) {
  let allData = [];
  let url = (() => {
    const u = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/${path}`);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  })();

  while (url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, { headers: metaHeaders(token), signal: controller.signal });
      if (!res.ok) {
        recordFailure();
        const errBody = await res.json().catch(() => ({}));
        throw new Error(`Meta Ads API: ${errBody?.error?.message || `HTTP ${res.status}`}`);
      }
      recordSuccess();
      const json = await res.json();
      allData = allData.concat(json.data || []);
      url = json.paging?.next || null;
      if (url) await sleep(200);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return allData;
}

// --- Ad Account ---
async function getAdAccount(token, accountId) {
  const ck = `adaccount:${accountId}`;
  const cached = getCached(ck);
  if (cached) return cached;
  const data = await graphGet(accountId, token, {
    fields: 'id,account_id,name,currency,timezone_name,account_status,amount_spent,balance,spend_cap',
  });
  setCache(ck, data);
  return data;
}

// --- Campaigns ---
async function getCampaigns(token, accountId, statusFilter) {
  const ck = `campaigns:${accountId}:${statusFilter?.join(',') || 'all'}`;
  const cached = getCached(ck);
  if (cached) return cached;
  const params = {
    fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,created_time,updated_time,start_time,stop_time',
    limit: '100',
  };
  if (statusFilter?.length) params.effective_status = JSON.stringify(statusFilter);
  const data = await graphGetAll(`${accountId}/campaigns`, token, params);
  setCache(ck, data);
  return data;
}

// --- Ad Sets ---
async function getAdSets(token, accountId, campaignId) {
  const path = campaignId ? `${campaignId}/adsets` : `${accountId}/adsets`;
  const ck = `adsets:${path}`;
  const cached = getCached(ck);
  if (cached) return cached;
  const data = await graphGetAll(path, token, {
    fields: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,budget_remaining,billing_event,optimization_goal,bid_amount,created_time,start_time,end_time',
    limit: '100',
  });
  setCache(ck, data);
  return data;
}

// --- Ads ---
async function getAds(token, accountId, adsetId) {
  const path = adsetId ? `${adsetId}/ads` : `${accountId}/ads`;
  const ck = `ads:${path}`;
  const cached = getCached(ck);
  if (cached) return cached;
  const data = await graphGetAll(path, token, {
    fields: 'id,name,adset_id,campaign_id,status,effective_status,creative{id,thumbnail_url,image_url,body,title,link_url},created_time',
    limit: '100',
  });
  setCache(ck, data);
  return data;
}

// --- Insights ---
const INSIGHTS_FIELDS = [
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'impressions', 'clicks', 'spend', 'cpc', 'cpm', 'ctr', 'reach', 'frequency',
  'actions', 'cost_per_action_type', 'purchase_roas',
  'date_start', 'date_stop', 'objective', 'account_currency',
].join(',');

async function getInsights(token, accountId, options = {}) {
  const { level = 'campaign', datePreset, timeRange, timeIncrement, campaignId } = options;
  const path = campaignId ? `${campaignId}/insights` : `${accountId}/insights`;
  const ck = `insights:${path}:${level}:${datePreset || ''}:${JSON.stringify(timeRange || {})}:${timeIncrement || ''}`;
  const cached = getCached(ck);
  if (cached) return cached;

  const params = { fields: INSIGHTS_FIELDS, level, limit: '500' };
  if (datePreset && datePreset !== 'lifetime') params.date_preset = datePreset;
  if (timeRange) params.time_range = JSON.stringify(timeRange);
  if (timeIncrement) params.time_increment = timeIncrement;

  const data = await graphGetAll(path, token, params);
  setCache(ck, data);
  return data;
}

// --- Helpers ---
function sumActions(actions, types) {
  if (!actions) return 0;
  return actions
    .filter((a) => types.some((t) => a.action_type.includes(t)))
    .reduce((sum, a) => sum + (parseInt(a.value) || 0), 0);
}

function sumActionValues(roas) {
  if (!roas) return 0;
  return roas.reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
}

// --- Daily Insights ---
async function getDailyInsights(token, accountId, datePreset, timeRange) {
  const raw = await getInsights(token, accountId, {
    level: 'account',
    datePreset: datePreset || undefined,
    timeRange,
    timeIncrement: '1',
  });
  return raw.map((r) => ({
    date: r.date_start,
    spend: parseFloat(r.spend) || 0,
    impressions: parseInt(r.impressions) || 0,
    clicks: parseInt(r.clicks) || 0,
    reach: parseInt(r.reach || '0') || 0,
    cpc: parseFloat(r.cpc || '0') || 0,
    cpm: parseFloat(r.cpm || '0') || 0,
    ctr: parseFloat(r.ctr || '0') || 0,
    conversions: sumActions(r.actions, ['offsite_conversion', 'lead', 'purchase', 'complete_registration']),
    conversionValue: sumActionValues(r.purchase_roas),
    roas: parseFloat(r.purchase_roas?.[0]?.value || '0') || 0,
  }));
}

// --- KPI Summary ---
function computeKpiSummary(insights, campaigns, currency = 'BRL') {
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0;
  let totalConversions = 0, totalConversionValue = 0;
  let weightedCpc = 0, weightedCpm = 0, weightedCtr = 0, weightedFreq = 0;

  for (const r of insights) {
    const spend = parseFloat(r.spend) || 0;
    const impressions = parseInt(r.impressions) || 0;
    const clicks = parseInt(r.clicks) || 0;
    const reach = parseInt(r.reach || '0') || 0;
    totalSpend += spend;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalReach += reach;
    totalConversions += sumActions(r.actions, ['offsite_conversion', 'lead', 'purchase', 'complete_registration']);
    const roasValue = parseFloat(r.purchase_roas?.[0]?.value || '0') || 0;
    totalConversionValue += roasValue * spend;
    weightedCpc += (parseFloat(r.cpc || '0') || 0) * clicks;
    weightedCpm += (parseFloat(r.cpm || '0') || 0) * impressions;
    weightedCtr += (parseFloat(r.ctr || '0') || 0) * impressions;
    weightedFreq += (parseFloat(r.frequency || '0') || 0) * reach;
  }

  const activeCampaigns = campaigns.filter((c) => c.effective_status === 'ACTIVE').length;
  const pausedCampaigns = campaigns.filter((c) => c.effective_status === 'PAUSED').length;

  return {
    totalSpend, totalImpressions, totalClicks, totalReach,
    avgCpc: totalClicks > 0 ? weightedCpc / totalClicks : 0,
    avgCpm: totalImpressions > 0 ? weightedCpm / totalImpressions : 0,
    avgCtr: totalImpressions > 0 ? weightedCtr / totalImpressions : 0,
    avgFrequency: totalReach > 0 ? weightedFreq / totalReach : 0,
    totalConversions, totalConversionValue,
    roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
    cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
    activeCampaigns, pausedCampaigns, currency,
  };
}

// --- Campaign Actions ---
async function updateCampaignStatus(token, campaignId, status) {
  const result = await graphPost(campaignId, token, { status });
  clearAdsCache();
  return result?.success === true;
}

async function updateCampaignBudget(token, campaignId, dailyBudget, lifetimeBudget) {
  const body = {};
  if (dailyBudget != null) body.daily_budget = Math.round(dailyBudget * 100).toString();
  if (lifetimeBudget != null) body.lifetime_budget = Math.round(lifetimeBudget * 100).toString();
  const result = await graphPost(campaignId, token, body);
  clearAdsCache();
  return result?.success === true;
}

async function updateAdSetStatus(token, adsetId, status) {
  const result = await graphPost(adsetId, token, { status });
  clearAdsCache();
  return result?.success === true;
}

module.exports = {
  getAdAccount, getCampaigns, getAdSets, getAds,
  getInsights, getDailyInsights, computeKpiSummary,
  updateCampaignStatus, updateCampaignBudget, updateAdSetStatus,
  clearAdsCache,
};
