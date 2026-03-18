import { updateCampaignStatus, updateCampaignBudget, updateAdSetStatus } from '../../models/facebook-ads.service';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/ads-actions] Requisição recebida', { method: req.method, query: req.query });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const { token, action, targetId, status, dailyBudget, lifetimeBudget } = req.body;

    if (!token || !action || !targetId) {
      return res.status(400).json({ success: false, error: 'Token, action e targetId obrigatorios.' });
    }

    let result = false;

    switch (action) {
      case 'campaign_status':
        if (!['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status)) {
          return res.status(400).json({ success: false, error: 'Status invalido.' });
        }
        result = await updateCampaignStatus(token, targetId, status);
        break;
      case 'campaign_budget':
        result = await updateCampaignBudget(token, targetId, dailyBudget, lifetimeBudget);
        break;
      case 'adset_status':
        if (!['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status)) {
          return res.status(400).json({ success: false, error: 'Status invalido.' });
        }
        result = await updateAdSetStatus(token, targetId, status);
        break;
      default:
        return res.status(400).json({ success: false, error: `Acao desconhecida: ${action}` });
    }

    console.log('[SUCESSO][API:/api/ads-actions] Resposta enviada', { action, targetId, result });
    return res.json({ success: result });
  } catch (e) {
    console.error('[ERRO][API:/api/ads-actions] Erro no endpoint', { error: e.message, stack: e.stack });
    return res.status(500).json({ success: false, error: e.message });
  }
}
