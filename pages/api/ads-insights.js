import { getDailyInsights, getInsights, computeKpiSummary, getCampaigns } from '../../models/facebook-ads.service';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const { token, accountId, timeRange, level = 'campaign' } = req.body;
    const datePreset = timeRange ? undefined : (req.body.datePreset || 'last_30d');

    if (!token || !accountId) {
      return res.status(400).json({ success: false, error: 'Token e accountId obrigatorios.' });
    }

    const [dailyData, insights, campaigns] = await Promise.all([
      getDailyInsights(token, accountId, datePreset, timeRange),
      getInsights(token, accountId, { level, datePreset, timeRange }),
      getCampaigns(token, accountId),
    ]);

    const kpiSummary = computeKpiSummary(insights, campaigns);
    return res.json({ success: true, daily: dailyData, insights, kpiSummary });
  } catch (e) {
    console.error('[ads-insights] Erro:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
