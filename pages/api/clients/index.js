import { getClientsByTenant, createClient, seedStages } from '../../../models/client.model';
import { resolveTenantId } from '../../../infra/get-tenant-id';

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    // GET /api/clients → lista todos os clientes do tenant
    if (req.method === 'GET') {
      const clients = await getClientsByTenant(tenantId);
      return res.json({ success: true, clients });
    }

    // POST /api/clients → cria novo cliente e seeds as 6 etapas
    if (req.method === 'POST') {
      const { company_name } = req.body;
      if (!company_name) {
        return res.status(400).json({ success: false, error: 'Nome da empresa obrigatorio' });
      }
      const client = await createClient(tenantId, req.body);
      await seedStages(client.id);
      return res.status(201).json({ success: true, client });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[/api/clients] Erro:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
