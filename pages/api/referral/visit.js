/**
 * pages/api/referral/visit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/referral/visit
 *
 * Endpoint PÚBLICO (sem auth) — chamado quando o indicado abre a página
 * secreta /indicacao/{refCode}.
 *
 * Faz três coisas:
 *   1. Marca first_access_at se for a primeira vez (inicia timer 72h)
 *   2. Atualiza status pra page_visited
 *   3. Retorna o estado completo: referral + config da página de venda
 *
 * Body:  { refCode }
 * Resposta:
 *   { success, referral, config, expired, msRemaining }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const {
  markPageVisited,
  getReferralByCode,
  getReferralConfig,
  checkTimer,
} = require('../../../models/referral');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { refCode } = req.body || {};
    if (!refCode) {
      return res.status(400).json({ success: false, error: 'refCode obrigatório' });
    }

    console.log('[INFO][API:referral/visit] start', { refCode });

    // 1. Garante que existe
    const existing = await getReferralByCode(refCode);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Link inválido' });
    }

    // 2. Marca a visita (idempotente — não reseta timer se já visitou)
    const referral = await markPageVisited(refCode);

    // 2b. Notifica o tenant na primeira visita
    if (!existing.first_access_at) {
      try {
        const { createNotification } = require('../../../models/clientForm');
        await createNotification(
          referral.tenantId, 'referral_visited', 'Indicação acessada',
          `Um indicado abriu o link de ${referral.referredName || 'indicação'}.`,
          null, { refCode, referralId: referral.id }
        );
      } catch {}
    }

    // 3. Carrega config do tenant pra renderizar a página
    const config = await getReferralConfig(referral.tenantId);

    // 4. Status do timer
    const timer = await checkTimer(refCode);

    return res.json({
      success: true,
      referral,
      config,
      expired: timer.expired,
      msRemaining: timer.msRemaining,
      expiresAt: timer.expiresAt,
    });

  } catch (err) {
    console.error('[ERRO][API:referral/visit]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
