const { getAccounts, saveAccount, deleteAccount } = require('../../models/account.model');
const { resolveTenantId } = require('../../infra/get-tenant-id');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/accounts] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);

  try {
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
    console.error('[ERRO][API:/api/accounts] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
