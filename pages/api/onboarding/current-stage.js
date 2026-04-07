/**
 * pages/api/onboarding/current-stage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/onboarding/current-stage?token={token}
 *
 * Endpoint público (sem auth) — só o token na URL controla acesso.
 * Retorna o "snapshot" do que o cliente deve ver agora:
 *   · não iniciado, dia de descanso, etapa pronta, etapa concluída ou completed.
 *
 * Quando o estado é `stage_ready` ou `stage_done`, vem junto:
 *   - stage: { number, title, description, timeEstimate, insight, questions }
 *   - video: { url, duration, watched }
 *   - response: respostas já salvas (rascunho ou submitted)
 *   - nextStage: teaser da próxima
 *
 * Resposta sempre:
 *   { success: boolean, state: string, ...payload }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getProgressByToken,
  getStageConfig,
  buildClientStageSnapshot,
  getNextStageTeaser,
} from '../../../models/onboarding';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token obrigatório' });
  }

  try {
    console.log('[INFO][API:onboarding/current-stage] start', { token: token.slice(0, 8) + '...' });

    const progress = await getProgressByToken(token);
    if (!progress) {
      return res.status(404).json({ success: false, state: 'not_found', error: 'Token inválido' });
    }

    // Token expirado?
    if (progress.token_expires && new Date(progress.token_expires) < new Date()) {
      return res.json({ success: true, state: 'expired' });
    }

    // Calcula o estado atual
    const snapshot = await buildClientStageSnapshot(progress);

    // Para estados que renderizam etapa, anexa a config (vídeo + perguntas)
    let stagePayload = null;
    if (snapshot.state === 'stage_ready' || snapshot.state === 'stage_done') {
      const config = await getStageConfig(progress.tenant_id, snapshot.stage.stage);
      stagePayload = {
        number: snapshot.stage.stage,
        day: snapshot.day,
        title: config?.title || snapshot.stage.title,
        description: config?.description || snapshot.stage.description,
        timeEstimate: config?.time_estimate || snapshot.stage.timeEstimate,
        insight: config?.insight_text || snapshot.stage.insight,
        // Perguntas vêm da config (admin pode ter editado), senão usa o default
        questions: config?.questions_json || snapshot.stage.questions,
        questionCount: (config?.questions_json || snapshot.stage.questions || [])
          .filter(q => !q.id?.startsWith?.('_extra_')).length,
        video: {
          url: config?.video_url || null,
          duration: config?.video_duration || null,
          watched: snapshot.response?.video_watched || false,
        },
      };
    }

    return res.json({
      success: true,
      state: snapshot.state,
      day: snapshot.day || null,
      message: snapshot.message || null,
      client: {
        company_name: progress.company_name,
        phone: progress.phone,
      },
      progress: {
        currentStage: progress.current_stage,
        currentDay: progress.current_day,
        startedAt: progress.started_at,
        status: progress.status,
      },
      stage: stagePayload,
      response: snapshot.response
        ? {
            responses: snapshot.response.responses_json || {},
            submitted: snapshot.response.submitted,
            videoWatched: snapshot.response.video_watched,
          }
        : null,
      nextStage: stagePayload ? getNextStageTeaser(stagePayload.number) : null,
    });

  } catch (err) {
    console.error('[ERRO][API:onboarding/current-stage]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
