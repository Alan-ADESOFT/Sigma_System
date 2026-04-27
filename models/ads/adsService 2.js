/**
 * models/ads/adsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Substituto moderno de models/facebook-ads.service.js.
 *
 * Diferenças:
 *   · Usa client_ads_accounts (NÃO accounts.ads_token)
 *   · Cache em tabela ads_insights_cache (NÃO em memória)
 *   · Filtra todas as queries por tenant_id
 *
 * Uso típico de um endpoint:
 *   const data = await adsService.fetchAccountKPIs(tenantId, clientId, range);
 * ─────────────────────────────────────────────────────────────────────────────
 */

const metaAds = require('../../infra/api/metaAds');
const adsAccount = require('./adsAccount.model');
const adsCache = require('./adsCache');

/* ─── Erros tipados ─────────────────────────────────────────────────────── */

class TokenExpiredError extends Error {
  constructor(msg) { super(msg); this.name = 'TokenExpiredError'; this.httpStatus = 401; }
}
class TokenInvalidError extends Error {
  constructor(msg) { super(msg); this.name = 'TokenInvalidError'; this.httpStatus = 401; }
}
class AccountNotConnectedError extends Error {
  constructor(msg) { super(msg); this.name = 'AccountNotConnectedError'; this.httpStatus = 404; }
}

/* ─── resolveAccount ────────────────────────────────────────────────────── */

/**
 * Busca a conta vinculada ao cliente, valida o estado do token e
 * retorna { token, accountId, account }.
 *
 * Lança erros tipados pra o endpoint mapear status code.
 */
async function resolveAccount(tenantId, clientId) {
  const row = await adsAccount.getByClient(tenantId, clientId);
  if (!row) {
    throw new AccountNotConnectedError('Nenhuma conta de Ads vinculada a este cliente.');
  }
  const account = adsAccount.mapAccountWithToken(row);

  if (account.healthStatus === 'invalid') {
    throw new TokenInvalidError('Token de Ads marcado como inválido. Reconecte a conta.');
  }
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) <= new Date()) {
    throw new TokenExpiredError('Token de Ads expirado. Reconecte a conta.');
  }

  return {
    token: account.accessToken,
    accountId: account.adsAccountId,
    account,
  };
}

/* ─── Date range helpers ────────────────────────────────────────────────── */

const DATE_PRESETS = {
  today:        () => offsetRange(0, 0),
  yesterday:    () => offsetRange(1, 1),
  last_7d:      () => offsetRange(7, 0),
  last_14d:     () => offsetRange(14, 0),
  last_30d:     () => offsetRange(30, 0),
  last_90d:     () => offsetRange(90, 0),
  this_month:   () => monthRange(0),
  last_month:   () => monthRange(1),
};

function offsetRange(daysBack, daysAgoEnd = 0) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - daysAgoEnd);
  const start = new Date(end);
  start.setDate(start.getDate() - (daysBack - 1));
  return {
    since: start.toISOString().slice(0, 10),
    until: end.toISOString().slice(0, 10),
  };
}

function monthRange(monthsBack = 0) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const start = target;
  const end = monthsBack === 0
    ? new Date()
    : new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0);
  return {
    since: start.toISOString().slice(0, 10),
    until: end.toISOString().slice(0, 10),
  };
}

/**
 * Resolve { datePreset } | { timeRange:{since,until} } → { since, until, datePreset, timeRange }.
 */
function resolveRange(input) {
  if (input?.timeRange?.since && input.timeRange?.until) {
    return {
      since: input.timeRange.since,
      until: input.timeRange.until,
      timeRange: input.timeRange,
      datePreset: null,
    };
  }
  const preset = input?.datePreset || 'last_30d';
  const builder = DATE_PRESETS[preset];
  if (!builder) {
    return {
      ...DATE_PRESETS.last_30d(),
      timeRange: null,
      datePreset: 'last_30d',
    };
  }
  const range = builder();
  return {
    since: range.since,
    until: range.until,
    timeRange: range,
    datePreset: preset,
  };
}

/**
 * Calcula o range "anterior" do mesmo tamanho (ex: last_30d → previous = -60d a -30d).
 */
function previousRange({ since, until }) {
  const start = new Date(since);
  const end = new Date(until);
  const days = Math.round((end - start) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return {
    since: prevStart.toISOString().slice(0, 10),
    until: prevEnd.toISOString().slice(0, 10),
  };
}

/* ─── Cache wrapper ─────────────────────────────────────────────────────── */

async function fetchInsightsCached(tenantId, clientId, token, params) {
  const { level, targetId, dateStart, dateEnd, breakdowns } = params;
  const cacheKey = adsCache.buildCacheKey({ level, targetId, dateStart, dateEnd, breakdowns });
  const cached = await adsCache.getCached(tenantId, clientId, cacheKey);
  if (cached) return cached;

  const apiParams = { level, breakdowns };
  if (params.timeRange) apiParams.timeRange = params.timeRange;
  else if (params.datePreset) apiParams.datePreset = params.datePreset;
  if (params.timeIncrement) apiParams.timeIncrement = params.timeIncrement;

  const data = await metaAds.getInsights(token, targetId, apiParams);
  await adsCache.setCached(tenantId, clientId, {
    level, targetId, dateStart, dateEnd, breakdowns, cacheKey,
  }, data);
  return data;
}

/* ─── Helpers de cálculo (copiado do legado, com pequenas melhorias) ────── */

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

function computeKpiSummary(insights, campaigns = [], currency = 'BRL') {
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
    weightedCpc  += (parseFloat(r.cpc || '0') || 0) * clicks;
    weightedCpm  += (parseFloat(r.cpm || '0') || 0) * impressions;
    weightedCtr  += (parseFloat(r.ctr || '0') || 0) * impressions;
    weightedFreq += (parseFloat(r.frequency || '0') || 0) * reach;
  }

  const activeCampaigns = campaigns.filter((c) => c.effective_status === 'ACTIVE').length;
  const pausedCampaigns = campaigns.filter((c) => c.effective_status === 'PAUSED').length;

  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalReach,
    avgCpc: totalClicks > 0 ? weightedCpc / totalClicks : 0,
    avgCpm: totalImpressions > 0 ? weightedCpm / totalImpressions : 0,
    avgCtr: totalImpressions > 0 ? weightedCtr / totalImpressions : 0,
    avgFrequency: totalReach > 0 ? weightedFreq / totalReach : 0,
    totalConversions,
    totalConversionValue,
    roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
    cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
    activeCampaigns,
    pausedCampaigns,
    currency,
  };
}

/**
 * Compara dois KPIs e retorna deltas semânticos.
 * Direções "boas":
 *   - up:   roas, ctr, totalConversions, totalConversionValue, totalReach,
 *           totalImpressions, totalClicks
 *   - down: cpa, avgCpc, avgCpm, avgFrequency
 */
const METRIC_DIRECTION = {
  totalSpend:           'neutral',
  totalImpressions:     'up',
  totalClicks:          'up',
  totalReach:           'up',
  avgCpc:               'down',
  avgCpm:               'down',
  avgCtr:               'up',
  avgFrequency:         'down',
  totalConversions:     'up',
  totalConversionValue: 'up',
  roas:                 'up',
  cpa:                  'down',
};

function computeComparison(currentKpi, previousKpi) {
  const out = [];
  for (const metric of Object.keys(METRIC_DIRECTION)) {
    const current = currentKpi?.[metric] ?? 0;
    const previous = previousKpi?.[metric] ?? 0;
    let deltaPct = null;
    if (previous !== 0) deltaPct = ((current - previous) / Math.abs(previous)) * 100;
    else if (current !== 0) deltaPct = 100;
    else deltaPct = 0;

    const goodDirection = METRIC_DIRECTION[metric];
    let direction = 'flat';
    if (deltaPct > 0.5) direction = 'up';
    else if (deltaPct < -0.5) direction = 'down';

    let positive = null;
    if (goodDirection === 'neutral') positive = null;
    else if (direction === 'flat') positive = null;
    else if (direction === goodDirection) positive = true;
    else positive = false;

    out.push({ metric, current, previous, deltaPct, direction, positive });
  }
  return out;
}

/* ─── KPIs do account ───────────────────────────────────────────────────── */

async function fetchAccountKPIs(tenantId, clientId, dateRange) {
  const { token, accountId } = await resolveAccount(tenantId, clientId);
  const range = resolveRange(dateRange);

  const insights = await fetchInsightsCached(tenantId, clientId, token, {
    level: 'account',
    targetId: accountId,
    dateStart: range.since,
    dateEnd: range.until,
    timeRange: range.timeRange,
    datePreset: range.datePreset,
  });

  const campaigns = await metaAds.getCampaigns(token, accountId, {});
  const summary = computeKpiSummary(insights, campaigns);

  return { range, summary, campaigns };
}

/* ─── Hierarquia: campaigns → adsets → ads ──────────────────────────────── */

async function fetchCampaignsHierarchy(tenantId, clientId, dateRange, opts = {}) {
  const { token, accountId } = await resolveAccount(tenantId, clientId);
  const range = resolveRange(dateRange);

  const campaigns = await metaAds.getCampaigns(token, accountId, {
    statusFilter: opts.statusFilter,
  });

  const campaignInsights = await fetchInsightsCached(tenantId, clientId, token, {
    level: 'campaign',
    targetId: accountId,
    dateStart: range.since,
    dateEnd: range.until,
    timeRange: range.timeRange,
    datePreset: range.datePreset,
  });
  const campaignInsightMap = new Map(campaignInsights.map((i) => [i.campaign_id, i]));

  const enrichedCampaigns = campaigns.map((c) => ({
    ...c,
    insights: campaignInsightMap.get(c.id) || null,
  }));

  let adSets = null, ads = null;
  if (opts.includeSets) {
    adSets = await metaAds.getAdSets(token, accountId, null);
    const adsetInsights = await fetchInsightsCached(tenantId, clientId, token, {
      level: 'adset',
      targetId: accountId,
      dateStart: range.since,
      dateEnd: range.until,
      timeRange: range.timeRange,
      datePreset: range.datePreset,
    });
    const m = new Map(adsetInsights.map((i) => [i.adset_id, i]));
    adSets = adSets.map((s) => ({ ...s, insights: m.get(s.id) || null }));
  }

  if (opts.includeAds) {
    ads = await metaAds.getAds(token, accountId, null);
    const adInsights = await fetchInsightsCached(tenantId, clientId, token, {
      level: 'ad',
      targetId: accountId,
      dateStart: range.since,
      dateEnd: range.until,
      timeRange: range.timeRange,
      datePreset: range.datePreset,
    });
    const m = new Map(adInsights.map((i) => [i.ad_id, i]));
    ads = ads.map((a) => ({ ...a, insights: m.get(a.id) || null }));
  }

  return { range, campaigns: enrichedCampaigns, adSets, ads };
}

/* ─── Timeline diária ───────────────────────────────────────────────────── */

async function fetchTimeline(tenantId, clientId, dateRange) {
  const { token, accountId } = await resolveAccount(tenantId, clientId);
  const range = resolveRange(dateRange);

  const cacheKey = adsCache.buildCacheKey({
    level: 'account_daily',
    targetId: accountId,
    dateStart: range.since,
    dateEnd: range.until,
    breakdowns: 'time_increment_1',
  });
  const cached = await adsCache.getCached(tenantId, clientId, cacheKey);
  let raw;
  if (cached) {
    raw = cached;
  } else {
    raw = await metaAds.getDailyInsights(token, accountId, range);
    await adsCache.setCached(tenantId, clientId, {
      level: 'account_daily',
      targetId: accountId,
      dateStart: range.since,
      dateEnd: range.until,
      breakdowns: 'time_increment_1',
      cacheKey,
    }, raw);
  }

  const timeline = raw.map((r) => ({
    date: r.date_start,
    spend: parseFloat(r.spend) || 0,
    impressions: parseInt(r.impressions) || 0,
    clicks: parseInt(r.clicks) || 0,
    reach: parseInt(r.reach || '0') || 0,
    cpc: parseFloat(r.cpc || '0') || 0,
    ctr: parseFloat(r.ctr || '0') || 0,
    conversions: sumActions(r.actions, ['offsite_conversion', 'lead', 'purchase', 'complete_registration']),
    roas: parseFloat(r.purchase_roas?.[0]?.value || '0') || 0,
  }));

  return { range, timeline };
}

/* ─── Breakdown ─────────────────────────────────────────────────────────── */

const VALID_BREAKDOWNS = {
  age:                 'age',
  gender:              'gender',
  age_and_gender:      'age,gender',
  publisher_platform:  'publisher_platform',
  platform_position:   'publisher_platform,platform_position',
  region:              'region',
  device_platform:     'device_platform',
};

async function fetchBreakdown(tenantId, clientId, breakdownType, dateRange) {
  const breakdowns = VALID_BREAKDOWNS[breakdownType];
  if (!breakdowns) {
    throw new Error(`breakdownType inválido: ${breakdownType}`);
  }
  const { token, accountId } = await resolveAccount(tenantId, clientId);
  const range = resolveRange(dateRange);

  // Limitação Meta 2025 — age/gender só funcionam nos últimos 13 meses
  if (['age', 'gender', 'age_and_gender'].includes(breakdownType)) {
    const start = new Date(range.since);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 13);
    if (start < cutoff) {
      throw new Error('Breakdown demográfico (age/gender) limitado aos últimos 13 meses pela Meta.');
    }
  }

  const data = await fetchInsightsCached(tenantId, clientId, token, {
    level: 'account',
    targetId: accountId,
    dateStart: range.since,
    dateEnd: range.until,
    timeRange: range.timeRange,
    datePreset: range.datePreset,
    breakdowns,
  });

  return { range, breakdownType, data };
}

/* ─── Ações (sem cache, sempre live + invalida cache do cliente) ────────── */

async function pauseObject(tenantId, clientId, objectId, level) {
  const { token } = await resolveAccount(tenantId, clientId);
  const ok = await metaAds.updateStatus(token, objectId, 'PAUSED');
  await adsCache.invalidateClient(tenantId, clientId);
  return ok;
}

async function resumeObject(tenantId, clientId, objectId, level) {
  const { token } = await resolveAccount(tenantId, clientId);
  const ok = await metaAds.updateStatus(token, objectId, 'ACTIVE');
  await adsCache.invalidateClient(tenantId, clientId);
  return ok;
}

async function updateBudget(tenantId, clientId, objectId, level, daily, lifetime) {
  const { token } = await resolveAccount(tenantId, clientId);
  const ok = await metaAds.updateBudget(token, objectId, daily, lifetime);
  await adsCache.invalidateClient(tenantId, clientId);
  return ok;
}

/* ─── Exports ───────────────────────────────────────────────────────────── */

module.exports = {
  // Errors
  TokenExpiredError,
  TokenInvalidError,
  AccountNotConnectedError,
  // High-level
  resolveAccount,
  fetchAccountKPIs,
  fetchCampaignsHierarchy,
  fetchTimeline,
  fetchBreakdown,
  // Actions
  pauseObject,
  resumeObject,
  updateBudget,
  // Math
  computeKpiSummary,
  computeComparison,
  // Helpers
  resolveRange,
  previousRange,
  sumActions,
  sumActionValues,
};
