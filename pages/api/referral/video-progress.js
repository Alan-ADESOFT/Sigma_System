/**
 * pages/api/referral/video-progress.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/referral/video-progress
 *
 * Endpoint PÚBLICO — chamado pelo player da página secreta a cada
 * ~25% de avanço do vídeo (25, 50, 75, 100). Atualiza video_progress
 * e promove status para video_started / video_completed conforme avança.
 *
 * Body: { refCode, percent }
 * Resposta: { success, referral }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { markVideoProgress } = require('../../../models/referral');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { refCode, percent } = req.body || {};
    if (!refCode) {
      return res.status(400).json({ success: false, error: 'refCode obrigatório' });
    }
    if (typeof percent !== 'number' && typeof percent !== 'string') {
      return res.status(400).json({ success: false, error: 'percent obrigatório' });
    }

    const referral = await markVideoProgress(refCode, percent);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'Indicação não encontrada' });
    }

    return res.json({ success: true, referral });

  } catch (err) {
    console.error('[ERRO][API:referral/video-progress]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
