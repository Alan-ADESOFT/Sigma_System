/**
 * pages/api/referral/check-timer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/referral/check-timer?refCode=xxx
 *
 * Endpoint PÚBLICO — usado pela página secreta pra verificar se o timer
 * de 72h ainda está vivo. O front renderiza o countdown localmente, mas
 * confia no backend pra saber se já expirou (evita manipular relógio do device).
 *
 * Resposta: { success, expired, msRemaining, expiresAt }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { checkTimer } = require('../../../models/referral');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { refCode } = req.query;
    if (!refCode) {
      return res.status(400).json({ success: false, error: 'refCode obrigatório' });
    }

    const timer = await checkTimer(refCode);
    return res.json({
      success: true,
      expired: timer.expired,
      msRemaining: timer.msRemaining,
      expiresAt: timer.expiresAt,
    });

  } catch (err) {
    console.error('[ERRO][API:referral/check-timer]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
