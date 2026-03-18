const { fetchInstagramInsights, verifyMetaToken, refreshMetaToken } = require('../../models/instagram-graph.service');
const { findAccountByToken, updateAccountToken } = require('../../models/account.model');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/meta-insights] Requisição recebida', { method: req.method, query: req.query });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use POST.' });
  }

  try {
    const { token, limit = 50, verifyOnly } = req.body;

    if (!token || token.trim() === '') {
      return res.status(400).json({ success: false, error: 'Token nao fornecido.' });
    }

    let currentToken = token;

    // Auto-refresh se perto de expirar
    try {
      const account = await findAccountByToken(token);
      if (account && account.expires_at) {
        const now = Math.floor(Date.now() / 1000);
        if (account.expires_at - now < 7 * 24 * 60 * 60) {
          const refreshed = await refreshMetaToken(currentToken);
          if (refreshed) {
            currentToken = refreshed.access_token;
            await updateAccountToken(account.id, currentToken, now + refreshed.expires_in);
          }
        }
      }
    } catch (dbErr) {
      console.warn('[Meta Token] Erro refresh:', dbErr);
    }

    const verification = await verifyMetaToken(currentToken);
    if (!verification.valid) {
      return res.status(401).json({ success: false, error: 'Token invalido ou expirado.' });
    }

    if (verifyOnly) {
      return res.json({ success: true, ...verification });
    }

    const posts = await fetchInstagramInsights(currentToken, limit);

    console.log('[SUCESSO][API:/api/meta-insights] Resposta enviada', { postCount: posts.length, verifyOnly });
    return res.json({
      success: true,
      data: posts,
      ...verification,
      source: 'meta',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ERRO][API:/api/meta-insights] Erro no endpoint', { error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, error: error.message });
  }
}
