/**
 * pages/api/onboarding/current-stage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/onboarding/current-stage?token={token}
 *
 * Endpoint público (sem auth) — só o token na URL controla acesso.
 * Retorna o "snapshot" do que o cliente deve ver agora.
 *
 * SPRINT FORMS V2 — consolidação de queries:
 *   Antes: ~5 queries (progress + submitted_set + response + seed_count + config).
 *   Depois: 3 queries (progress + seedCheck + stages-with-responses LEFT JOIN).
 *   Reduzimos N+1 mantendo o mesmo contrato externo. Mede com console.time
 *   `[PERF][current-stage]` pra comparar em produção.
 *
 * Resposta sempre:
 *   { success: boolean, state: string, ...payload }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getProgressByToken,
  computeCurrentDay,
  seedDefaultConfig,
  getNextStageTeaser,
} from '../../../models/onboarding';

import {
  ONBOARDING_STAGES,
  REST_DAYS,
  REST_DAY_NUMBERS,
  TOTAL_DAYS,
} from '../../../assets/data/onboardingQuestions';

const { query } = require('../../../infra/db');

/**
 * Busca, em UMA query só, todas as etapas do tenant + a resposta do cliente
 * pra cada etapa (LEFT JOIN). Sem N+1 — o caller varre o array em memória.
 */
async function loadStagesWithResponses(tenantId, clientId) {
  return query(
    `SELECT
        c.stage_number,
        c.day_release,
        c.title,
        c.description,
        c.video_url,
        c.video_duration,
        c.time_estimate,
        c.insight_text,
        c.questions_json,
        r.submitted,
        r.video_watched,
        r.responses_json
      FROM onboarding_stages_config c
      LEFT JOIN onboarding_stage_responses r
        ON r.client_id = $1 AND r.stage_number = c.stage_number
      WHERE c.tenant_id = $2
      ORDER BY c.day_release ASC`,
    [clientId, tenantId]
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token obrigatório' });
  }

  const perfLabel = `[PERF][current-stage] token=${String(token).slice(0, 8)}`;
  console.time(perfLabel);

  try {
    console.log('[INFO][API:onboarding/current-stage] start', { token: String(token).slice(0, 8) + '...' });

    const progress = await getProgressByToken(token);
    if (!progress) {
      console.timeEnd(perfLabel);
      return res.status(404).json({ success: false, state: 'not_found', error: 'Token inválido' });
    }
    if (progress.token_expires && new Date(progress.token_expires) < new Date()) {
      console.timeEnd(perfLabel);
      return res.json({ success: true, state: 'expired' });
    }
    if (progress.status === 'not_started') {
      console.timeEnd(perfLabel);
      return res.json({ success: true, state: 'not_started' });
    }
    if (progress.status === 'completed') {
      console.timeEnd(perfLabel);
      return res.json({
        success: true,
        state: 'completed',
        client: {
          company_name: progress.company_name,
          phone: progress.phone,
        },
      });
    }

    // Garante seed (idempotente — uma chamada só)
    await seedDefaultConfig(progress.tenant_id);

    // Query consolidada: todas as etapas + resposta do cliente em LEFT JOIN
    const rows = await loadStagesWithResponses(progress.tenant_id, progress.client_id);
    const currentDay = computeCurrentDay(progress.started_at);

    // Conta quantas etapas já foram submetidas (pra detectar completed)
    const submittedCount = rows.filter(r => r.submitted).length;
    if (submittedCount >= ONBOARDING_STAGES.length) {
      console.timeEnd(perfLabel);
      return res.json({
        success: true,
        state: 'completed',
        client: {
          company_name: progress.company_name,
          phone: progress.phone,
        },
      });
    }

    // Encontra a PRIMEIRA etapa pendente cujo day_release <= currentDay (catch-up)
    const pending = rows.find(r => Number(r.day_release) <= currentDay && !r.submitted);

    if (!pending) {
      // Tudo até hoje respondido
      if (currentDay > TOTAL_DAYS) {
        console.timeEnd(perfLabel);
        return res.json({ success: true, state: 'completed' });
      }
      if (REST_DAY_NUMBERS.includes(currentDay)) {
        console.timeEnd(perfLabel);
        return res.json({
          success: true,
          state: 'rest_day',
          day: currentDay,
          message: REST_DAYS[currentDay],
        });
      }
      console.timeEnd(perfLabel);
      return res.json({ success: true, state: 'waiting_next', day: currentDay });
    }

    // Localiza a definição do stage em ONBOARDING_STAGES (pra fallbacks)
    const stageDef = ONBOARDING_STAGES.find(s => s.stage === Number(pending.stage_number));

    const stagePayload = {
      number: Number(pending.stage_number),
      day: currentDay,
      title: pending.title || stageDef?.title,
      description: pending.description || stageDef?.description,
      timeEstimate: pending.time_estimate || stageDef?.timeEstimate,
      insight: pending.insight_text || stageDef?.insight,
      questions: pending.questions_json || stageDef?.questions || [],
      questionCount: (pending.questions_json || stageDef?.questions || [])
        .filter(q => !q.id?.startsWith?.('_extra_')).length,
      video: {
        url: pending.video_url || null,
        duration: pending.video_duration || null,
        watched: !!pending.video_watched,
      },
    };

    console.timeEnd(perfLabel);
    return res.json({
      success: true,
      state: 'stage_ready',
      day: currentDay,
      message: null,
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
      response: pending.responses_json
        ? {
            responses: pending.responses_json,
            submitted: !!pending.submitted,
            videoWatched: !!pending.video_watched,
          }
        : null,
      nextStage: getNextStageTeaser(stagePayload.number),
    });
  } catch (err) {
    console.timeEnd(perfLabel);
    console.error('[ERRO][API:onboarding/current-stage]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
