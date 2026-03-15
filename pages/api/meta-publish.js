import { getInstagramUserId, publishImage } from '../../models/instagram-graph.service';

export default async function handler(req, res) {
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

    return res.json(result);
  } catch (error) {
    console.error('[/api/meta-publish] Erro:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
