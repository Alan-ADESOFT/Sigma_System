/**
 * pages/api/onboarding/admin/stages-config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET  /api/onboarding/admin/stages-config
 *        PUT  /api/onboarding/admin/stages-config
 *
 * Endpoint do PAINEL ADMIN — usa resolveTenantId() pra trabalhar dentro
 * do tenant correto.
 *
 * GET:
 *   Retorna a lista completa de etapas + dias de descanso.
 *   Já dispara o seed default automaticamente se for a primeira chamada.
 *   Resposta: { success, stages: [...], restDays: [...] }
 *
 * PUT:
 *   Body: { stageNumber, data: { title?, description?, video_url?, ... } }
 *   OU
 *   Body: { restDayNumber, message }
 *
 *   Atualiza UMA etapa OU UM dia de descanso.
 *   Campos não enviados são preservados (COALESCE no SQL).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getStagesConfig,
  upsertStageConfig,
  upsertRestDayConfig,
} from '../../../../models/onboarding';

const { resolveTenantId } = require('../../../../infra/get-tenant-id');

export default async function handler(req, res) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Tenant não resolvido' });
    }

    /* ── GET ── lista completa ── */
    if (req.method === 'GET') {
      console.log('[INFO][API:admin/stages-config:GET] start', { tenantId });

      const { stages, restDays } = await getStagesConfig(tenantId);

      return res.json({
        success: true,
        stages: stages.map(s => ({
          id: s.id,
          stageNumber: s.stage_number,
          title: s.title,
          description: s.description,
          videoUrl: s.video_url,
          videoDuration: s.video_duration,
          questions: s.questions_json || [],
          dayRelease: s.day_release,
          timeEstimate: s.time_estimate,
          insightText: s.insight_text,
          active: s.active,
          questionCount: (s.questions_json || []).filter(q => !q.id?.startsWith?.('_extra_')).length,
        })),
        restDays: restDays.map(r => ({
          id: r.id,
          dayNumber: r.day_number,
          message: r.message,
        })),
      });
    }

    /* ── PUT ── atualiza etapa OU dia de descanso ── */
    if (req.method === 'PUT') {
      const { stageNumber, data, restDayNumber, message } = req.body || {};

      // Atualizar dia de descanso
      if (restDayNumber) {
        if (!message) {
          return res.status(400).json({ success: false, error: 'Mensagem obrigatória' });
        }
        const row = await upsertRestDayConfig(tenantId, restDayNumber, message);
        return res.json({ success: true, restDay: row });
      }

      // Atualizar etapa
      if (!stageNumber || !data) {
        return res.status(400).json({
          success: false,
          error: 'Envie { stageNumber, data } para etapa OU { restDayNumber, message } para descanso.',
        });
      }

      const row = await upsertStageConfig(tenantId, stageNumber, data);
      if (!row) {
        return res.status(404).json({ success: false, error: 'Etapa não encontrada' });
      }
      return res.json({ success: true, stage: row });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });

  } catch (err) {
    console.error('[ERRO][API:admin/stages-config]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
