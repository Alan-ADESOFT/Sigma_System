/**
 * pages/api/referral/admin/config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET  /api/referral/admin/config
 *        PUT  /api/referral/admin/config
 *
 * Admin: edita a config da página de venda do tenant.
 *   GET → carrega (cria com defaults se não existir)
 *   PUT → atualiza qualquer subset dos campos
 *
 * Body PUT:
 *   {
 *     vslVideoUrl?, vslVideoDuration?, offerPrice?, offerOriginal?,
 *     offerInstallments?, timerHours?, checkoutUrl?, pageActive?
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const {
  getReferralConfig,
  upsertReferralConfig,
} = require('../../../../models/referral');
const { resolveTenantId } = require('../../../../infra/get-tenant-id');

export default async function handler(req, res) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Tenant não resolvido' });
    }

    if (req.method === 'GET') {
      const config = await getReferralConfig(tenantId);
      return res.json({ success: true, config });
    }

    if (req.method === 'PUT') {
      const updated = await upsertReferralConfig(tenantId, req.body || {});
      return res.json({ success: true, config: updated });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });

  } catch (err) {
    console.error('[ERRO][API:referral/admin/config]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
