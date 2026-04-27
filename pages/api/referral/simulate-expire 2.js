/**
 * POST /api/referral/simulate-expire
 * Força a expiração de um referral para testes (admin+ only).
 * Seta timer_expires para 1 minuto atrás.
 *
 * Body: { refCode }
 */

import { requireRole } from '../../../infra/checkRole';
import { queryOne } from '../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido.' });

  try {
    await requireRole(req, 'admin');
    const { refCode } = req.body || {};

    if (!refCode) return res.status(400).json({ success: false, error: 'refCode obrigatório.' });

    const referral = await queryOne(`SELECT id, ref_code, status FROM referrals WHERE ref_code = $1`, [refCode]);
    if (!referral) return res.status(404).json({ success: false, error: 'Referral não encontrado.' });

    // Seta first_access_at (se não existir) e timer_expires para o passado
    const updated = await queryOne(
      `UPDATE referrals
       SET first_access_at = COALESCE(first_access_at, now() - INTERVAL '73 hours'),
           timer_expires = now() - INTERVAL '1 minute',
           status = CASE WHEN status = 'link_created' THEN 'page_visited' ELSE status END,
           updated_at = now()
       WHERE ref_code = $1
       RETURNING id, ref_code, timer_expires`,
      [refCode]
    );

    return res.json({
      success: true,
      message: `Link ${refCode} marcado como expirado.`,
    });
  } catch (err) {
    if (err.status === 401 || err.status === 403) return res.status(err.status).json({ success: false, error: err.message });
    console.error('[ERRO][API:/api/referral/simulate-expire]', err.message);
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
}
