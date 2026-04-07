/**
 * pages/api/instagram/account.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET    /api/instagram/account?clientId=<id>  → busca conta + perfil
 * @route DELETE /api/instagram/account?clientId=<id>  → desconecta
 *
 * IMPORTANTE: o GET nunca expõe o access_token ao frontend.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { queryOne } = require('../../../infra/db');
const {
  getInstagramAccount,
  removeInstagramAccount,
} = require('../../../models/instagram.model');
const { createNotification } = require('../../../models/clientForm');

function sanitizeAccount(account) {
  if (!account) return null;
  // Não devolver o access_token ao frontend
  // eslint-disable-next-line no-unused-vars
  const { accessToken, ...safe } = account;
  return safe;
}

export default async function handler(req, res) {
  const { clientId } = req.query;
  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId obrigatório' });
  }

  try {
    const tenantId = await resolveTenantId(req);

    if (req.method === 'GET') {
      console.log('[INFO][API:/api/instagram/account] GET', { clientId });
      const account = await getInstagramAccount(tenantId, clientId);
      return res.json({ success: true, account: sanitizeAccount(account) });
    }

    if (req.method === 'DELETE') {
      console.log('[INFO][API:/api/instagram/account] DELETE', { clientId });

      // Pega nome do cliente antes de deletar (pra notificação)
      const client = await queryOne(
        `SELECT company_name FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
        [clientId, tenantId]
      );

      const removed = await removeInstagramAccount(tenantId, clientId);
      if (!removed) {
        return res.status(404).json({ success: false, error: 'Conta não encontrada' });
      }

      // Notificação no sininho
      try {
        await createNotification(
          tenantId,
          'instagram_disconnected',
          'Instagram desconectado',
          `A conta Instagram do cliente ${client?.company_name || clientId} foi removida.`,
          clientId
        );
      } catch (e) {
        console.warn('[WARN] notificação de desconexão falhou:', e.message);
      }

      console.log('[SUCESSO][API:/api/instagram/account] Conta removida', { clientId });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/instagram/account]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
