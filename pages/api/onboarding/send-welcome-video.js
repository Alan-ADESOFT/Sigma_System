/**
 * pages/api/onboarding/send-welcome-video.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/onboarding/send-welcome-video
 * Body: { clientId } | { phone, captionOverride? }
 *
 * Endpoint utilitário usado pelo modal de envio do InfoCliente (botão
 * WhatsApp) e pelo handler de "resend_form" do Jarvis. Encapsula:
 *
 *   1. Resolução do telefone (vem do body OU do client_id)
 *   2. Lookup dos settings `onboarding_welcome_video_url` +
 *      `onboarding_welcome_video_description`
 *   3. Substituição do {NOME} no caption por getClientGreetingName
 *   4. Chamada Z-API sendVideo
 *
 * Resposta:
 *   { success: true, sent: true }   — vídeo enviado
 *   { success: true, sent: false }  — não há vídeo configurado (silent skip)
 *   { success: false, error }       — falha (caller decide se bloqueia)
 *
 * A trava de "se falhar não bloqueia o fluxo" fica no caller (modal/Jarvis),
 * que faz try/catch separado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { requireAuth } = require('../../../lib/api-auth');
const { queryOne } = require('../../../infra/db');
const { sendVideo } = require('../../../infra/api/zapi');
const { getSetting } = require('../../../models/settings.model');

import { getClientGreetingName } from '../../../models/onboarding';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    await requireAuth(req); // só usuário logado pode acionar
    const tenantId = await resolveTenantId(req);

    let { clientId, phone, captionOverride } = req.body || {};
    let client = null;

    if (clientId) {
      client = await queryOne(
        `SELECT id, company_name, phone, responsible_name, onboarding_greeting_with
           FROM marketing_clients
          WHERE id = $1 AND tenant_id = $2`,
        [clientId, tenantId]
      );
      if (!client) {
        return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
      }
      phone = phone || client.phone;
    }

    if (!phone) {
      return res.status(400).json({ success: false, error: 'phone obrigatório' });
    }

    // Settings — se não houver vídeo, retorna sent:false (caller pula silencioso)
    const videoUrl = await getSetting(tenantId, 'onboarding_welcome_video_url');
    if (!videoUrl || !String(videoUrl).trim()) {
      return res.json({ success: true, sent: false, reason: 'no_video_configured' });
    }

    const rawCaption = captionOverride
      || (await getSetting(tenantId, 'onboarding_welcome_video_description'))
      || '';

    // Substitui placeholders no caption (igual ao cron diário)
    const greetName = getClientGreetingName(client) || '';
    const caption = String(rawCaption).replace(/\{NOME\}/gi, greetName);

    console.log('[INFO][API:send-welcome-video] enviando', {
      hasClient: !!client,
      hasCaption: !!caption,
      videoUrl,
    });

    await sendVideo(phone, videoUrl, caption);

    console.log('[SUCESSO][API:send-welcome-video] enviado');
    return res.json({ success: true, sent: true });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][API:send-welcome-video]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
