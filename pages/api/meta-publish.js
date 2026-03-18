import { getInstagramUserId, publishImage } from '../../models/instagram-graph.service';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/meta-publish] Requisição recebida', { method: req.method, query: req.query });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const { token, imageUrl, caption } = req.body;

    if (!token || !imageUrl) {
      return res.status(400).json({ success: false, error: 'Token e imageUrl obrigatorios.' });
    }

    const userId = await getInstagramUserId(token);
    if (!userId) {
      return res.status(500).json({ success: false, error: 'Nao foi possivel encontrar a Conta Profissional.' });
    }

    const result = await publishImage(token, userId, imageUrl, caption || '');
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    console.log('[SUCESSO][API:/api/meta-publish] Publicação realizada', { userId });
    return res.json(result);
  } catch (error) {
    console.error('[ERRO][API:/api/meta-publish] Erro no endpoint', { error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, error: error.message });
  }
}
