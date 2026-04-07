/**
 * pages/api/onboarding/video-watched.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/onboarding/video-watched
 * Body: { token, stageNumber }
 *
 * Marca o vídeo da etapa como assistido. Idempotente.
 *
 * Chamado pelo OnboardingVideoPlayer quando o evento `ended` dispara
 * (ou quando o cliente atinge 95% do vídeo, o que vier primeiro).
 *
 * NOTA: marcar o vídeo como assistido NÃO desbloqueia automaticamente o
 * formulário no servidor — o desbloqueio (countdown de 20s) é puramente
 * client-side. Aqui só ficamos com o registro pra analytics.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getProgressByToken, markVideoWatched } from '../../../models/onboarding';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const { token, stageNumber } = req.body || {};
  if (!token || !stageNumber) {
    return res.status(400).json({
      success: false,
      error: 'Parâmetros obrigatórios: token, stageNumber.',
    });
  }

  try {
    console.log('[INFO][API:onboarding/video-watched] start', {
      token: token.slice(0, 8) + '...',
      stageNumber,
    });

    const progress = await getProgressByToken(token);
    if (!progress) {
      return res.status(404).json({ success: false, error: 'Token inválido' });
    }

    const row = await markVideoWatched(progress.client_id, progress.tenant_id, stageNumber);

    console.log('[SUCESSO][API:onboarding/video-watched] done', { stageNumber });
    return res.json({
      success: true,
      videoWatchedAt: row?.video_watched_at,
    });
  } catch (err) {
    console.error('[ERRO][API:onboarding/video-watched]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
