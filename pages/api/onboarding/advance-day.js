/**
 * pages/api/onboarding/advance-day.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/onboarding/advance-day
 * Body: { token }
 *
 * Adianta o cliente para a próxima etapa do onboarding (pulando dias de
 * descanso automaticamente). Usado pelo botão "Adiantar Dia" que aparece
 * na tela de celebração após concluir uma etapa.
 *
 * Pré-condições:
 *   - Token válido
 *   - Etapa atual JÁ submetida
 *   - Não estar na última etapa
 *
 * O backend ajusta o `started_at` retroativamente para que o cálculo de
 * `current_day` (que deriva do calendário) fique consistente. Ver comentário
 * em models/onboarding.js → advanceDay() para detalhes.
 *
 * Retorno:
 *   { success, nextStage: { number, day, title, questionCount, timeEstimate } }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getProgressByToken, advanceDay, getNextStageTeaser } from '../../../models/onboarding';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token obrigatório' });
  }

  try {
    console.log('[INFO][API:onboarding/advance-day] start', { token: token.slice(0, 8) + '...' });

    const progress = await getProgressByToken(token);
    if (!progress) {
      return res.status(404).json({ success: false, error: 'Token inválido' });
    }
    if (progress.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Onboarding não está ativo (status: ' + progress.status + ')',
      });
    }

    const result = await advanceDay(progress.client_id);

    // Monta o retorno com info enxuta da nova etapa
    const nextTeaser = {
      number: result.nextStage.stage,
      day: result.nextStage.day,
      title: result.nextStage.title,
      description: result.nextStage.description,
      timeEstimate: result.nextStage.timeEstimate,
      questionCount: (result.nextStage.questions || [])
        .filter(q => !q.id?.startsWith?.('_extra_')).length,
    };

    console.log('[SUCESSO][API:onboarding/advance-day] done', { newStage: nextTeaser.number });

    return res.json({
      success: true,
      nextStage: nextTeaser,
      progress: {
        currentStage: result.progress.current_stage,
        currentDay: result.progress.current_day,
        startedAt: result.progress.started_at,
      },
    });

  } catch (err) {
    console.error('[ERRO][API:onboarding/advance-day]', { error: err.message });
    return res.status(400).json({ success: false, error: err.message });
  }
}
