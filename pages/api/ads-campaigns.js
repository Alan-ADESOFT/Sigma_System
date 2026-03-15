import { getCampaigns, getAdSets, getAds, getAdAccount, getInsights } from '../../models/facebook-ads.service';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const { token, accountId, statusFilter, includeSets, includeAds, timeRange } = req.body;
    const datePreset = timeRange ? undefined : (req.body.datePreset || 'last_30d');

    if (!token || !accountId) {
      return res.status(400).json({ success: false, error: 'Token e accountId obrigatorios.' });
    }

    const [account, campaigns] = await Promise.all([
      getAdAccount(token, accountId),
      getCampaigns(token, accountId, statusFilter),
    ]);

    const campaignInsights = await getInsights(token, accountId, { level: 'campaign', datePreset, timeRange });
    const insightMap = new Map(campaignInsights.map((i) => [i.campaign_id, i]));
    const enrichedCampaigns = campaigns.map((c) => ({ ...c, insights: insightMap.get(c.id) || null }));

    let adSets = null;
    let ads = null;

    if (includeSets) {
      adSets = await getAdSets(token, accountId);
      const adsetInsights = await getInsights(token, accountId, { level: 'adset', datePreset, timeRange });
      const adsetInsightMap = new Map(adsetInsights.map((i) => [i.adset_id, i]));
      adSets = adSets.map((s) => ({ ...s, insights: adsetInsightMap.get(s.id) || null }));
    }

    if (includeAds) ads = await getAds(token, accountId);

    return res.json({ success: true, account, campaigns: enrichedCampaigns, adSets, ads });
  } catch (e) {
    console.error('[ads-campaigns] Erro:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
