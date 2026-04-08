/**
 * pages/api/referral/list.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/referral/list?clientId=xxx
 *        GET /api/referral/list?token=xxx
 *        GET /api/referral/list                  (admin — todas do tenant)
 *
 * Lista as indicações:
 *   · com clientId → só as desse cliente
 *   · com token   → resolve clientId pelo token público do onboarding
 *   · sem nada    → todas as do tenant (admin), aceita filtro ?status=
 *
 * Resposta: { success: true, referrals: [...] }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const {
  getReferralsByClient,
  listReferralsAdmin,
} = require('../../../models/referral');
const { getProgressByToken } = require('../../../models/onboarding');
const { resolveTenantId } = require('../../../infra/get-tenant-id');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { clientId, token, status } = req.query;

    // Modo 1 — token público (cliente vendo as próprias indicações)
    if (token) {
      const progress = await getProgressByToken(token);
      if (!progress) {
        return res.status(404).json({ success: false, error: 'Token inválido' });
      }
      const referrals = await getReferralsByClient(progress.client_id);
      return res.json({ success: true, referrals });
    }

    // Modo 2 — admin com clientId
    if (clientId) {
      const referrals = await getReferralsByClient(clientId);
      return res.json({ success: true, referrals });
    }

    // Modo 3 — admin listando todas do tenant
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Tenant não resolvido' });
    }
    const referrals = await listReferralsAdmin(tenantId, { status });
    return res.json({ success: true, referrals });

  } catch (err) {
    console.error('[ERRO][API:referral/list]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
