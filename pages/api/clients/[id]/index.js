/**
 * pages/api/clients/[id]/index.js
 * GET    /api/clients/[id]  → retorna dados do cliente
 * PUT    /api/clients/[id]  → atualiza dados do cliente
 * DELETE /api/clients/[id]  → remove cliente e todas as etapas
 */

import { getClientById, updateClient, deleteClient } from '../../../../models/client.model';
import { resolveTenantId } from '../../../../infra/get-tenant-id';

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id }   = req.query;

  if (!id) return res.status(400).json({ success: false, error: 'ID do cliente obrigatorio' });

  try {
    if (req.method === 'GET') {
      const client = await getClientById(id, tenantId);
      if (!client) return res.status(404).json({ success: false, error: 'Cliente nao encontrado' });
      return res.json({ success: true, client });
    }

    if (req.method === 'PUT') {
      const client = await updateClient(id, tenantId, req.body);
      if (!client) return res.status(404).json({ success: false, error: 'Cliente nao encontrado' });
      return res.json({ success: true, client });
    }

    if (req.method === 'DELETE') {
      const deleted = await deleteClient(id, tenantId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Cliente nao encontrado' });
      return res.json({ success: true, id: deleted.id });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error(`[/api/clients/${id}] Erro:`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
