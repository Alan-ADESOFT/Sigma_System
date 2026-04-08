/**
 * POST /api/referral/collect-info
 * Salva nome e telefone do indicado no referral.
 * Chamado uma única vez pela landing page antes de liberar o conteúdo.
 *
 * Body: { refCode, name, phone }
 */

import { queryOne } from '../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido.' });

  try {
    const { refCode, name, phone } = req.body || {};

    if (!refCode) return res.status(400).json({ success: false, error: 'refCode obrigatório.' });
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Nome obrigatório.' });
    if (!phone?.trim()) return res.status(400).json({ success: false, error: 'Telefone obrigatório.' });

    const referral = await queryOne(`SELECT id, status FROM referrals WHERE ref_code = $1`, [refCode]);
    if (!referral) return res.status(404).json({ success: false, error: 'Link não encontrado.' });

    await queryOne(
      `UPDATE referrals SET referred_name = $2, referred_phone = $3, updated_at = now() WHERE ref_code = $1 RETURNING id`,
      [refCode, name.trim(), phone.replace(/\D/g, '').trim()]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('[ERRO][API:/api/referral/collect-info]', err.message);
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
}
