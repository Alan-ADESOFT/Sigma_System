import { verifyMetaToken, fetchAccountInsights, fetchAudienceDemographics } from '../../models/instagram-graph.service';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/meta-account-insights] Requisição recebida', { method: req.method, query: req.query });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const { token, days = 30 } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token obrigatorio.' });
    }

    const verification = await verifyMetaToken(token);
    if (!verification.valid) {
      return res.status(401).json({ success: false, error: 'Token invalido.' });
    }

    const userRes = await fetch(`https://graph.instagram.com/v25.0/me?fields=id&access_token=${token}`);
    const userData = await userRes.json();
    if (!userData.id) {
      return res.status(500).json({ success: false, error: 'Falha ao buscar userId.' });
    }

    const accountInsights = await fetchAccountInsights(token, userData.id, days);
    const demographics = await fetchAudienceDemographics(token, userData.id);

    console.log('[SUCESSO][API:/api/meta-account-insights] Resposta enviada', { period: days });
    return res.json({ success: true, accountInsights, demographics, period: days });
  } catch (error) {
    console.error('[ERRO][API:/api/meta-account-insights] Erro no endpoint', { error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, error: error.message });
  }
}
