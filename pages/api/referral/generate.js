/**
 * pages/api/referral/generate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/referral/generate
 *
 * Gera (ou retorna o existente) link de indicação pra um cliente.
 *
 * Aceita DOIS modos de identificação:
 *   1. Body { token } — token público do onboarding (cliente final, sem auth)
 *   2. Body { clientId } — admin chamando, com tenant resolvido por header
 *
 * Comportamento idempotente: se o cliente já tem um link "vivo"
 * (não comprado, não expirado), retorna o mesmo. Não cria zumbi.
 *
 * Resposta:
 *   { success: true, referral: { refCode, refLink, status, ... } }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const {
  generateReferralLink,
  getReferralConfig,
} = require('../../../models/referral');
const { getProgressByToken } = require('../../../models/onboarding');
const { resolveTenantId } = require('../../../infra/get-tenant-id');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { token, clientId: bodyClientId } = req.body || {};

    let clientId = null;
    let tenantId = null;

    // Modo 1 — token público do onboarding
    if (token) {
      const progress = await getProgressByToken(token);
      if (!progress) {
        return res.status(404).json({ success: false, error: 'Token inválido' });
      }
      clientId = progress.client_id;
      tenantId = progress.tenant_id;
    }
    // Modo 2 — admin direto
    else if (bodyClientId) {
      clientId = bodyClientId;
      tenantId = await resolveTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Tenant não resolvido' });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Envie { token } (cliente) ou { clientId } (admin)',
      });
    }

    console.log('[INFO][API:referral/generate] start', { clientId });

    const referral = await generateReferralLink(clientId, tenantId);

    // Devolve também a config — o ReferralBlock no front precisa dos textos
    // (copyWarningMessage e whatsappMessage) sem ter que fazer outra chamada.
    const config = await getReferralConfig(tenantId);

    return res.json({
      success: true,
      referral,
      config: {
        copyWarningMessage: config?.copyWarningMessage,
        whatsappMessage:    config?.whatsappMessage,
        timerHours:         config?.timerHours,
      },
    });

  } catch (err) {
    console.error('[ERRO][API:referral/generate]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
