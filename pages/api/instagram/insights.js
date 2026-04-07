/**
 * pages/api/instagram/insights.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/instagram/insights?clientId=<id>&period=month&refresh=false
 *
 * Retorna { profile, insights, recentMedia } da conta Instagram do cliente.
 *
 * Cache: 1h em settings (key: ig_insights_cache_<clientId>_<period>)
 * para evitar bater na Meta a cada navegação.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { getInstagramAccount } = require('../../../models/instagram.model');
const { getSetting, setSetting } = require('../../../models/settings.model');
const meta = require('../../../infra/api/meta');

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Use GET' });
  }

  const { clientId, period = 'month', refresh } = req.query;
  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId obrigatório' });
  }

  console.log('[INFO][API:/api/instagram/insights]', { clientId, period, refresh });

  try {
    const tenantId = await resolveTenantId(req);
    const account = await getInstagramAccount(tenantId, clientId);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Cliente não tem conta Instagram conectada',
      });
    }

    // v2 = nova estrutura de métricas (sem impressions deprecada)
    const cacheKey = `ig_insights_cache_v2_${clientId}_${period}`;

    /* Cache lookup (se não pediu refresh forçado) */
    if (refresh !== 'true') {
      const cached = await getSetting(tenantId, cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.fetchedAt && Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
            console.log('[INFO][API:/api/instagram/insights] cache hit');
            return res.json({ success: true, ...parsed.data, cached: true });
          }
        } catch {}
      }
    }

    /* Cache miss → Meta API */
    console.log('[INFO][API:/api/instagram/insights] cache miss → Meta');

    const [profile, insights, recentMedia] = await Promise.all([
      meta.getIGUserProfile(account.igUserId, account.accessToken),
      meta.getAccountInsights(account.igUserId, account.accessToken, period),
      meta.getRecentMedia(account.igUserId, account.accessToken, 25),
    ]);

    const payload = { profile, insights, recentMedia };

    /* Persiste cache */
    try {
      await setSetting(tenantId, cacheKey, JSON.stringify({
        fetchedAt: Date.now(),
        data: payload,
      }));
    } catch (e) {
      console.warn('[WARN] falha ao salvar cache:', e.message);
    }

    console.log('[SUCESSO][API:/api/instagram/insights]', {
      mediaCount: recentMedia.length,
      metricsCount: Object.keys(insights).length,
    });

    return res.json({ success: true, ...payload, cached: false });
  } catch (err) {
    console.error('[ERRO][API:/api/instagram/insights]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
