/**
 * POST /api/referral/generate-test
 * Gera link de indicação temporário para teste (god/admin only).
 * Cria um referral sem cliente real vinculado, com label "[TESTE]".
 */

import { requireRole } from '../../../infra/checkRole';
import { resolveTenantId } from '../../../infra/get-tenant-id';
import { queryOne } from '../../../infra/db';

const crypto = require('crypto');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido.' });

  try {
    const user = await requireRole(req, 'admin');
    const tenantId = await resolveTenantId(req);

    const { label } = req.body || {};
    const testLabel = (label || 'Teste').trim().slice(0, 50);

    // Gera código único
    let refCode;
    for (let i = 0; i < 5; i++) {
      refCode = 'test_' + crypto.randomBytes(4).toString('hex');
      const dup = await queryOne(`SELECT id FROM referrals WHERE ref_code = $1`, [refCode]);
      if (!dup) break;
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
    const refLink = `${baseUrl}/indicacao/${refCode}`;

    const row = await queryOne(
      `INSERT INTO referrals (referrer_id, tenant_id, ref_code, ref_link, referred_name, status)
       VALUES ($1, $2, $3, $4, $5, 'link_created')
       RETURNING *`,
      [user.id, tenantId, refCode, refLink, `[TESTE] ${testLabel}`]
    );

    return res.json({
      success: true,
      referral: {
        id: row.id,
        refCode: row.ref_code,
        refLink: row.ref_link,
        label: testLabel,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    if (err.status === 401 || err.status === 403) return res.status(err.status).json({ success: false, error: err.message });
    console.error('[ERRO][API:/api/referral/generate-test]', err.message);
    return res.status(500).json({ success: false, error: 'Erro ao gerar link de teste.' });
  }
}
