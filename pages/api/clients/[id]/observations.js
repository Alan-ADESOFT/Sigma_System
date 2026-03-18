/**
 * pages/api/clients/[id]/observations.js
 * GET    → lista observações do cliente
 * POST   → cria nova observação
 * PUT    → edita observação existente (body: { observationId, text })
 * DELETE → remove observação (?observationId=...)
 */

import { query, queryOne } from '../../../../infra/db';
import { getClientById } from '../../../../models/client.model';
import { resolveTenantId } from '../../../../infra/get-tenant-id';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/clients/:id/observations] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);
  const { id: clientId, observationId } = req.query;

  try {
    const client = await getClientById(clientId, tenantId);
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

    /* ── GET ── */
    if (req.method === 'GET') {
      const rows = await query(
        `SELECT * FROM client_observations WHERE client_id = $1 ORDER BY created_at DESC`,
        [clientId]
      );
      console.log('[SUCESSO][API:/api/clients/:id/observations] Resposta enviada', { clientId, count: rows.length });
      return res.json({ success: true, observations: rows });
    }

    /* ── POST ── */
    if (req.method === 'POST') {
      const { text } = req.body;
      if (!text?.trim()) return res.status(400).json({ success: false, error: 'text é obrigatório' });

      const row = await queryOne(
        `INSERT INTO client_observations (client_id, text) VALUES ($1, $2) RETURNING *`,
        [clientId, text.trim()]
      );
      console.log('[SUCESSO][API:/api/clients/:id/observations] Observação criada', { clientId, observationId: row.id });
      return res.json({ success: true, observation: row });
    }

    /* ── PUT ── */
    if (req.method === 'PUT') {
      const { observationId: obsId, text } = req.body;
      if (!obsId || !text?.trim()) {
        return res.status(400).json({ success: false, error: 'observationId e text são obrigatórios' });
      }

      const row = await queryOne(
        `UPDATE client_observations SET text = $1, updated_at = now()
         WHERE id = $2 AND client_id = $3 RETURNING *`,
        [text.trim(), obsId, clientId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Observação não encontrada' });
      console.log('[SUCESSO][API:/api/clients/:id/observations] Observação atualizada', { clientId, observationId: obsId });
      return res.json({ success: true, observation: row });
    }

    /* ── DELETE ── */
    if (req.method === 'DELETE') {
      if (!observationId) return res.status(400).json({ success: false, error: 'observationId é obrigatório' });

      const row = await queryOne(
        `DELETE FROM client_observations WHERE id = $1 AND client_id = $2 RETURNING id`,
        [observationId, clientId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Observação não encontrada' });
      console.log('[SUCESSO][API:/api/clients/:id/observations] Observação removida', { clientId, observationId });
      return res.json({ success: true, id: observationId });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:/api/clients/:id/observations] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
