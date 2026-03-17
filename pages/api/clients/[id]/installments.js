/**
 * pages/api/clients/[id]/installments.js
 * PUT → atualiza status de uma parcela (pago / pendente)
 *   body: { installmentId, status: 'paid' | 'pending', paid_at? }
 */

import { queryOne } from '../../../../infra/db';
import { getClientById } from '../../../../models/client.model';
import { resolveTenantId } from '../../../../infra/get-tenant-id';

export default async function handler(req, res) {
  const tenantId       = await resolveTenantId(req);
  const { id: clientId } = req.query;

  try {
    const client = await getClientById(clientId, tenantId);
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

    if (req.method === 'PUT') {
      const { installmentId, status } = req.body;
      if (!installmentId || !status) {
        return res.status(400).json({ success: false, error: 'installmentId e status são obrigatórios' });
      }
      if (!['paid', 'pending'].includes(status)) {
        return res.status(400).json({ success: false, error: 'status deve ser paid ou pending' });
      }

      const paidAt = status === 'paid' ? 'now()' : 'NULL';
      const row = await queryOne(
        `UPDATE client_installments
         SET status = $1, paid_at = ${paidAt}, updated_at = now()
         WHERE id = $2 AND client_id = $3 RETURNING *`,
        [status, installmentId, clientId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Parcela não encontrada' });
      return res.json({ success: true, installment: row });
    }

    return res.status(405).end();
  } catch (err) {
    console.error(`[/api/clients/${clientId}/installments]`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
