/**
 * pages/api/clients/[id]/form-status.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Retorna o status completo do formulário de um cliente — sem gerar token.
 * Usado pela aba "Respostas" para exibir o estado atual.
 *
 * GET — Retorna: { success, ...formStatus }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { getFormStatusForClient } from '../../../../models/clientForm';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/clients/[id]/form-status] Requisição recebida', { method: req.method, id: req.query.id });

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    await resolveTenantId(req); // valida autenticação
    const { id: clientId } = req.query;

    const status = await getFormStatusForClient(clientId);

    console.log('[SUCESSO][API:/api/clients/[id]/form-status] Status retornado', { clientId, formStatus: status.formStatus });
    return res.json({ success: true, ...status });
  } catch (err) {
    console.error('[ERRO][API:/api/clients/[id]/form-status] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
