/**
 * pages/api/cron/onboarding-incentive.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/cron/onboarding-incentive
 *
 * Cron de "cutucada" do meio do dia — sprint Forms v2.
 *
 * ⏰ Horário: 10h BRT diariamente → cron expression UTC: `0 13 * * *`
 *
 * Comportamento:
 *   1. Pega todos os onboardings com status = 'active'.
 *   2. Calcula o currentDay em BRT.
 *   3. Pula se hoje é dia de descanso (4, 8, 13).
 *   4. Pula se a etapa do currentDay JÁ foi submitted (cliente em dia).
 *   5. Pula se já existe log 'incentive' pra (client_id, currentDay) — UNIQUE
 *      constraint na tabela onboarding_notifications_log reforça idempotência.
 *   6. Pula se o cliente não tem phone.
 *   7. Renderiza template (custom via setting `onboarding_msg_incentive` ou
 *      default hardcoded) substituindo {NOME} (getClientGreetingName),
 *      {ETAPA} (título), {LINK}.
 *   8. Envia via Z-API sendText.
 *   9. Loga em onboarding_notifications_log com type = 'incentive'.
 *
 * Protegido por header `x-internal-token` (INTERNAL_API_TOKEN).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  findActiveOnboardings,
  computeCurrentDay,
  wasNotificationSent,
  logNotificationSent,
  getClientGreetingName,
} from '../../../models/onboarding';

import {
  ONBOARDING_STAGES,
  REST_DAY_NUMBERS,
  TOTAL_DAYS,
} from '../../../assets/data/onboardingQuestions';

const { sendText } = require('../../../infra/api/zapi');
const { queryOne } = require('../../../infra/db');
const { getSetting } = require('../../../models/settings.model');

const DEFAULT_INCENTIVE = `Oi, *{NOME}*.

A etapa *{ETAPA}* de hoje ainda tá te esperando. Sem cobrança — só lembrando que tá tudo aqui quando você puder:

{LINK}

5 a 7 minutos é o que separa hoje da próxima etapa.`;

const { verifyCronToken } = require('../../../lib/cron-auth');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  if (!verifyCronToken(req)) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  try {
    console.log('[INFO][Cron:OnboardingIncentive] iniciando ciclo');

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || `http://localhost:${process.env.PORT || 3002}`;

    const onboardings = await findActiveOnboardings();
    console.log('[INFO][Cron:OnboardingIncentive] onboardings ativos', { count: onboardings.length });

    const results = {
      total: onboardings.length,
      sent: 0,
      skippedAlreadyAnswered: 0,
      skippedRest: 0,
      skippedAlreadyNotified: 0,
      skippedNoPhone: 0,
      skippedOutOfRange: 0,
      errors: 0,
    };

    for (const ob of onboardings) {
      try {
        const currentDay = computeCurrentDay(ob.started_at);

        // Fora do calendário (já passou do dia 15 ou ainda não começou)
        if (currentDay < 1 || currentDay > TOTAL_DAYS) {
          results.skippedOutOfRange++;
          continue;
        }

        // (b) Hoje é descanso → não cutuca
        if (REST_DAY_NUMBERS.includes(currentDay)) {
          results.skippedRest++;
          continue;
        }

        // (c) Etapa do dia
        const stage = ONBOARDING_STAGES.find((s) => s.day === currentDay);
        if (!stage) {
          results.skippedOutOfRange++;
          continue;
        }

        // (d) Já respondida → cliente em dia, pula
        const submittedRow = await queryOne(
          `SELECT submitted FROM onboarding_stage_responses
            WHERE client_id = $1 AND stage_number = $2`,
          [ob.client_id, stage.stage]
        );
        if (submittedRow?.submitted) {
          results.skippedAlreadyAnswered++;
          continue;
        }

        // (e) Já cutucou hoje?
        const already = await wasNotificationSent(ob.client_id, currentDay, 'incentive');
        if (already) {
          results.skippedAlreadyNotified++;
          continue;
        }

        // (f) Sem telefone
        if (!ob.phone) {
          console.warn('[WARN][Cron:OnboardingIncentive] cliente sem phone', { clientId: ob.client_id });
          results.skippedNoPhone++;
          continue;
        }

        // (g) Renderiza template
        const template = (await getSetting(ob.tenant_id, 'onboarding_msg_incentive')) || DEFAULT_INCENTIVE;
        const greetingName = getClientGreetingName(ob);
        const firstName = (greetingName || '').split(' ')[0] || greetingName;
        const link = `${baseUrl}/onboarding/${ob.token}`;
        const message = template
          .replace(/\{NOME\}/gi, firstName)
          .replace(/\{ETAPA\}/gi, stage.title)
          .replace(/\{LINK\}/gi, link);

        // (h) Envia
        await sendText(ob.phone, message, { delayTyping: 3 });

        // (i) Loga (UNIQUE evita duplicata se cron rodar 2x)
        await logNotificationSent(ob.client_id, currentDay, 'incentive', message);

        results.sent++;
        console.log('[SUCESSO][Cron:OnboardingIncentive] cutucada enviada', {
          client: ob.company_name, day: currentDay, stage: stage.stage,
        });
      } catch (err) {
        results.errors++;
        console.error('[ERRO][Cron:OnboardingIncentive] cliente', {
          clientId: ob.client_id, company: ob.company_name, error: err.message,
        });
      }
    }

    console.log('[SUCESSO][Cron:OnboardingIncentive] ciclo concluído', results);
    return res.json({ success: true, ...results });
  } catch (err) {
    console.error('[ERRO][Cron:OnboardingIncentive] erro geral', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
