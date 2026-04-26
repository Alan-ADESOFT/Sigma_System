/**
 * pages/api/ads/accounts/[id].js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route PATCH  /api/ads/accounts/[id]   → atualiza pageId / instagramActorId / accountName / businessId
 * @route DELETE /api/ads/accounts/[id]   → remove conta (CASCADE em cache, anomalias, tokens)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { queryOne } = require('../../../../infra/db');
const adsAccount = require('../../../../models/ads/adsAccount.model');
const { createNotification } = require('../../../../models/clientForm');

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

  console.log('[INFO][API:/api/ads/accounts/[id]]', { method: req.method, id });

  try {
    const tenantId = await resolveTenantId(req);
    const existing = await adsAccount.getById(tenantId, id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Conta não encontrada' });
    }

    if (req.method === 'PATCH') {
      const { pageId, instagramActorId, businessId, accountName } = req.body || {};
      const updated = await adsAccount.updateMeta(id, tenantId, {
        page_id: pageId,
        instagram_actor_id: instagramActorId,
        business_id: businessId,
        account_name: accountName,
      });
      console.log('[SUCESSO][API:/api/ads/accounts/[id]] PATCH', { id });
      return res.json({ success: true, account: updated });
    }

    if (req.method === 'DELETE') {
      const client = await queryOne(
        `SELECT company_name FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
        [existing.client_id, tenantId]
      );
      const removed = await adsAccount.remove(id, tenantId);
      if (!removed) return res.status(404).json({ success: false, error: 'Conta não encontrada' });

      try {
        await createNotification(
          tenantId,
          'ads_disconnected',
          'Conta de Ads desconectada',
          `A conta de Ads do cliente ${client?.company_name || existing.client_id} foi removida.`,
          existing.client_id
        );
      } catch {}

      console.log('[SUCESSO][API:/api/ads/accounts/[id]] DELETE', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/accounts/[id]]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
