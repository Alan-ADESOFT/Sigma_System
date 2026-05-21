const { getAccounts, saveAccount, deleteAccount } = require('../../models/account.model');
const { resolveTenantId } = require('../../infra/get-tenant-id');
const { requireAuth } = require('../../lib/api-auth');

/**
 * @route GET    /api/accounts — lista. Exige auth.
 * @route POST   /api/accounts — cria/atualiza. Exige auth.
 * @route DELETE /api/accounts?id=X — deleta. Exige auth.
 *
 * Patch de segurança (20260521): endpoint estava aberto a anônimos pra
 * POST/DELETE — fechado via requireAuth. Single-workspace, então todo user
 * logado pode mexer; gate de admin não se aplica aqui (são contas operacionais
 * do user, não config global).
 */
export default async function handler(req, res) {
  console.log('[INFO][API:/api/accounts] Requisição recebida', { method: req.method, query: req.query });

  try {
    await requireAuth(req);
    const tenantId = await resolveTenantId(req);

    if (req.method === 'GET') {
      const accounts = await getAccounts(tenantId);
      console.log('[SUCESSO][API:/api/accounts] Resposta enviada', { count: accounts.length });
      return res.json({ success: true, accounts });
    }

    if (req.method === 'POST') {
      const result = await saveAccount(tenantId, req.body);
      console.log('[SUCESSO][API:/api/accounts] Conta salva', { success: result.success });
      return res.json(result);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'ID obrigatorio' });
      const result = await deleteAccount(tenantId, id);
      console.log('[SUCESSO][API:/api/accounts] Conta removida', { id });
      return res.json(result);
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][API:/api/accounts] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
