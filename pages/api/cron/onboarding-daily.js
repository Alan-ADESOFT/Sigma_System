/**
 * pages/api/cron/onboarding-daily.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/cron/onboarding-daily
 *
 * Cron diário do sistema de onboarding por etapas.
 * Deve ser disparado UMA vez por dia (Vercel Cron, GitHub Actions ou cURL).
 *
 * ⏰ HORÁRIO RECOMENDADO
 * ─────────────────────────────────────────────────────────────────────────────
 * Disparar entre 8h e 9h no horário de BRASÍLIA (BRT, UTC-3).
 *
 * Em cron expression UTC (que é o que Vercel Cron e GitHub Actions usam):
 *   - 8h BRT  = "0 11 * * *"   (11h UTC, todos os dias)
 *   - 8:30 BRT = "30 11 * * *"
 *   - 9h BRT  = "0 12 * * *"
 *
 * Exemplo Vercel (vercel.json):
 *   {
 *     "crons": [{
 *       "path": "/api/cron/onboarding-daily",
 *       "schedule": "0 11 * * *"
 *     }]
 *   }
 *
 * IMPORTANTE: o cálculo de "dia da jornada" usa explicitamente o fuso de
 * Brasília (ver computeCurrentDay em models/onboarding.js), então não importa
 * em que fuso o servidor está rodando — a contagem é sempre BRT. O que importa
 * do cron é só QUANDO ele bate, pra entregar a mensagem cedo no dia do cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Para cada cliente com onboarding ativo:
 *   1. Calcula em qual dia da jornada está (computeCurrentDay em BRT).
 *   2. Decide o tipo de mensagem do dia:
 *        · stage_link    → libera a etapa do dia (envia link via WhatsApp)
 *        · rest_message  → mensagem motivacional dos dias 4, 8 e 13
 *        · completion    → manda mensagem de fechamento (1 vez no dia 15)
 *   3. Verifica em onboarding_notifications_log se já foi enviado hoje
 *      (UNIQUE constraint garante que não repete mesmo se o cron rodar 2x).
 *   4. Envia via Z-API e loga.
 *
 * Protegido por header `x-internal-token` — mesma convenção do form-reminder.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  findActiveOnboardings,
  computeCurrentDay,
  wasNotificationSent,
  logNotificationSent,
  syncCurrentDay,
} from '../../../models/onboarding';

import {
  buildStageLinkMessage,
  REST_MESSAGES,
  buildCompletionMessage,
} from '../../../assets/data/onboardingMessages';

import {
  ONBOARDING_STAGES,
  REST_DAY_NUMBERS,
  TOTAL_DAYS,
  getNextStage,
} from '../../../assets/data/onboardingQuestions';

const { sendText } = require('../../../infra/api/zapi');
const { query, queryOne } = require('../../../infra/db');
const { getSetting } = require('../../../models/settings.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  // Autenticação interna
  const token = req.headers['x-internal-token'];
  if (!token || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  try {
    console.log('[INFO][Cron:OnboardingDaily] iniciando ciclo diário');

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const onboardings = await findActiveOnboardings();

    console.log('[INFO][Cron:OnboardingDaily] onboardings ativos', { count: onboardings.length });

    const results = {
      total: onboardings.length,
      stageLinks: 0,
      restMessages: 0,
      completions: 0,
      skipped: 0,
      errors: 0,
    };

    for (const ob of onboardings) {
      try {
        const currentDay = computeCurrentDay(ob.started_at);

        // Sincroniza no banco (mantém current_day em dia pro admin)
        await syncCurrentDay(ob.client_id);

        // Onboarding ainda não começou (started_at futuro?) — pula
        if (currentDay < 1) {
          results.skipped++;
          continue;
        }

        // Passou do fim da jornada — manda mensagem de conclusão (uma vez)
        if (currentDay > TOTAL_DAYS) {
          const already = await wasNotificationSent(ob.client_id, TOTAL_DAYS, 'completion');
          if (already) { results.skipped++; continue; }

          const customCompMsg = await getSetting(ob.tenant_id, 'onboarding_msg_completion');
          let message;
          if (customCompMsg) {
            const firstName = (ob.company_name || '').split(' ')[0];
            message = customCompMsg.replace(/\{NOME\}/gi, firstName);
          } else {
            message = buildCompletionMessage({ name: ob.company_name });
          }
          await sendText(ob.phone, message, { delayTyping: 3 });
          await logNotificationSent(ob.client_id, TOTAL_DAYS, 'completion', message);

          try {
            const { createNotification } = require('../../../models/clientForm');
            await createNotification(
              ob.tenant_id, 'onboarding_completed', 'Onboarding concluído',
              `${ob.company_name} completou todas as 12 etapas do onboarding.`,
              ob.client_id, { action: 'onboarding_completed' }
            );
          } catch {}

          // Marca o cliente como completed (caso ainda não esteja)
          await query(
            `UPDATE onboarding_progress
             SET status = 'completed', completed_at = COALESCE(completed_at, now())
             WHERE client_id = $1`,
            [ob.client_id]
          );
          await query(
            `UPDATE marketing_clients SET onboarding_status = 'completed' WHERE id = $1`,
            [ob.client_id]
          );

          results.completions++;
          console.log('[SUCESSO][Cron:OnboardingDaily] mensagem de conclusão', { client: ob.company_name });
          continue;
        }

        // Hoje é dia de descanso?
        if (REST_DAY_NUMBERS.includes(currentDay)) {
          const already = await wasNotificationSent(ob.client_id, currentDay, 'rest_message');
          if (already) { results.skipped++; continue; }

          // Busca a mensagem custom do tenant (ou usa o default)
          const restRow = await queryOne(
            `SELECT message FROM onboarding_rest_days_config
             WHERE tenant_id = $1 AND day_number = $2`,
            [ob.tenant_id, currentDay]
          );
          const customRestMsg = await getSetting(ob.tenant_id, `onboarding_msg_rest_${currentDay}`);
          const message = customRestMsg || restRow?.message || REST_MESSAGES[currentDay];

          await sendText(ob.phone, message, { delayTyping: 3 });
          await logNotificationSent(ob.client_id, currentDay, 'rest_message', message);
          results.restMessages++;
          console.log('[SUCESSO][Cron:OnboardingDaily] mensagem de descanso', { client: ob.company_name, day: currentDay });
          continue;
        }

        // Dia normal — encontra a etapa que libera hoje
        const stage = ONBOARDING_STAGES.find(s => s.day === currentDay);
        if (!stage) {
          // Não deveria acontecer com a config padrão
          results.skipped++;
          continue;
        }

        const already = await wasNotificationSent(ob.client_id, currentDay, 'stage_link');
        if (already) { results.skipped++; continue; }

        const link = `${baseUrl}/onboarding/${ob.token}`;
        const customStageMsg = await getSetting(ob.tenant_id, 'onboarding_msg_stage_link');
        let message;
        if (customStageMsg) {
          const firstName = (ob.company_name || '').split(' ')[0];
          message = customStageMsg
            .replace(/\{NOME\}/gi, firstName)
            .replace(/\{ETAPA\}/gi, String(stage.stage))
            .replace(/\{TITULO\}/gi, stage.title)
            .replace(/\{LINK\}/gi, link);
        } else {
          message = buildStageLinkMessage({
            name: ob.company_name,
            stageNumber: stage.stage,
            stageTitle: stage.title,
            link,
          });
        }

        await sendText(ob.phone, message, { delayTyping: 3 });
        await logNotificationSent(ob.client_id, currentDay, 'stage_link', message);

        try {
          const { createNotification } = require('../../../models/clientForm');
          await createNotification(
            ob.tenant_id, 'onboarding_link_sent', 'Etapa enviada',
            `Etapa ${stage.stage} enviada para ${ob.company_name} via WhatsApp.`,
            ob.client_id, { day: currentDay, stage: stage.stage }
          );
        } catch {}

        results.stageLinks++;

        console.log('[SUCESSO][Cron:OnboardingDaily] link da etapa enviado', {
          client: ob.company_name,
          day: currentDay,
          stage: stage.stage,
        });

      } catch (err) {
        results.errors++;
        console.error('[ERRO][Cron:OnboardingDaily] cliente', {
          clientId: ob.client_id,
          company: ob.company_name,
          error: err.message,
        });
      }
    }

    console.log('[SUCESSO][Cron:OnboardingDaily] ciclo concluído', results);
    return res.json({ success: true, ...results });

  } catch (err) {
    console.error('[ERRO][Cron:OnboardingDaily] erro geral', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
