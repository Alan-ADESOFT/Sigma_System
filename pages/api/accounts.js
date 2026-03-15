const { getAccounts, saveAccount, deleteAccount } = require('../../models/account.model');
const { resolveTenantId } = require('../../infra/get-tenant-id');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const accounts = await getAccounts(tenantId);
      return res.json({ success: true, accounts });
    }

    if (req.method === 'POST') {
      const result = await saveAccount(tenantId, req.body);
      return res.json(result);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'ID obrigatorio' });
      const result = await deleteAccount(tenantId, id);
      return res.json(result);
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[/api/accounts] Erro:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
