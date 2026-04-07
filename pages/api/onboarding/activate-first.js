/**
 * pages/api/onboarding/activate-first.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/onboarding/activate-first
 * Body: { clientId, message? }
 *
 * Ativa a jornada de onboarding do cliente AGORA (dia 1) e loga que a
 * notificação do dia 1 já foi enviada manualmente — assim o cron diário
 * não reenvia o link de boas-vindas no mesmo dia.
 *
 * Chamado pelo modal "Enviar Formulário" APÓS o envio via Z-API ter dado
 * sucesso. Ou seja: o fluxo completo é:
 *
 *   1. Modal abre → /api/onboarding/prepare  (cria progress sem ativar)
 *   2. Operador edita a mensagem no popup
 *   3. Clica "Enviar"
 *   4. /api/form/send-whatsapp  (envia via Z-API) [reusa o endpoint antigo]
 *   5. /api/onboarding/activate-first  (ativa + loga notificação)
 *
 * Retorno: { success, progress }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { startOnboarding, logNotificationSent } from '../../../models/onboarding';

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { queryOne } = require('../../../infra/db');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const tenantId = await resolveTenantId(req);
    const { clientId, message } = req.body || {};
    if (!clientId) {
      return res.status(400).json({ success: false, error: 'clientId é obrigatório' });
    }

    console.log('[INFO][API:onboarding/activate-first] start', { clientId });

    // Valida cliente no tenant
    const client = await queryOne(
      `SELECT id FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId]
    );
    if (!client) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    // Ativa: status='active', started_at=now(), current_day=1, current_stage=1
    const progress = await startOnboarding(clientId, tenantId);

    // Loga no notifications_log: dia 1, tipo 'stage_link'
    // Isso impede o cron de reenviar o mesmo link no mesmo dia
    await logNotificationSent(
      clientId,
      1,
      'stage_link',
      (message || 'Enviado manualmente via dashboard').slice(0, 2000)
    );

    console.log('[SUCESSO][API:onboarding/activate-first] done', { clientId, token: progress.token });

    return res.json({
      success: true,
      progress: {
        id: progress.id,
        token: progress.token,
        status: progress.status,
        startedAt: progress.started_at,
        currentStage: progress.current_stage,
        currentDay: progress.current_day,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:onboarding/activate-first]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
