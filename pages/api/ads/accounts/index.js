/**
 * pages/api/ads/accounts/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET  /api/ads/accounts          → lista contas do tenant
 * @route POST /api/ads/accounts          → conexão MANUAL (fallback)
 *
 * GET nunca retorna access_token.
 * POST valida o token via debugToken antes de salvar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { queryOne } = require('../../../../infra/db');
const metaAds = require('../../../../infra/api/metaAds');
const adsAccount = require('../../../../models/ads/adsAccount.model');
const { createNotification } = require('../../../../models/clientForm');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/ads/accounts] Requisição recebida', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);

    if (req.method === 'GET') {
      const accounts = await adsAccount.listByTenant(tenantId);
      console.log('[SUCESSO][API:/api/ads/accounts] GET', { count: accounts.length });
      return res.json({ success: true, accounts });
    }

    if (req.method === 'POST') {
      const { clientId, accessToken, adsAccountId, pageId, instagramActorId, businessId } = req.body || {};
      if (!clientId || !accessToken || !adsAccountId) {
        return res.status(400).json({ success: false, error: 'clientId, accessToken e adsAccountId obrigatórios.' });
      }

      const client = await queryOne(
        `SELECT id, company_name FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
        [clientId, tenantId]
      );
      if (!client) {
        return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
      }

      // Garante que ads_account_id começa com 'act_'
      const normalizedAccountId = adsAccountId.startsWith('act_') ? adsAccountId : `act_${adsAccountId}`;

      // Valida token
      let debug;
      try {
        debug = await metaAds.debugToken(accessToken);
      } catch (e) {
        return res.status(400).json({ success: false, error: `Token inválido: ${e.message}` });
      }
      if (!debug.isValid) {
        return res.status(400).json({ success: false, error: 'Token inválido (debug_token retornou is_valid=false)' });
      }

      // Busca metadados da conta
      let accountInfo = {};
      try {
        accountInfo = await metaAds.getAdAccount(accessToken, normalizedAccountId);
      } catch (e) {
        return res.status(400).json({ success: false, error: `Não foi possível acessar a conta ${normalizedAccountId}: ${e.message}` });
      }

      const saved = await adsAccount.saveManual(tenantId, clientId, {
        adsAccountId: normalizedAccountId,
        businessId: businessId || accountInfo.business?.id || null,
        pageId: pageId || null,
        instagramActorId: instagramActorId || null,
        accessToken,
        tokenType: 'manual',
        tokenExpiresAt: debug.expiresAt,
        accountName: accountInfo.name,
        currency: accountInfo.currency,
        timezoneName: accountInfo.timezone_name,
        accountStatus: accountInfo.account_status,
        amountSpent: accountInfo.amount_spent,
        balance: accountInfo.balance,
      });

      try {
        await createNotification(
          tenantId,
          'ads_connected',
          'Conta de Ads conectada (manual)',
          `Conta ${accountInfo.name || normalizedAccountId} foi vinculada ao cliente ${client.company_name}.`,
          clientId,
          { accountId: normalizedAccountId }
        );
      } catch {}

      // Refaz lookup para devolver versão pública (sem token)
      const fresh = await adsAccount.getById(tenantId, saved.id);
      console.log('[SUCESSO][API:/api/ads/accounts] POST manual', { clientId });
      return res.json({ success: true, account: adsAccount.mapAccount(fresh) });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/accounts]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
