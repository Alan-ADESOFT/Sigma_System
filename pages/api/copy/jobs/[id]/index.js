/**
 * @fileoverview Endpoint: Consulta status de job de copy
 * @route GET /api/copy/jobs/[id]
 *
 * Retorna status atual do job. result_text so vem quando status='done'.
 * partial_text e atualizado durante streaming SSE pra cliente que estiver
 * em fallback de polling (sem EventSource) ainda ver o texto crescendo.
 *
 * O frontend abre EventSource em /api/copy/jobs/[id]/stream pra receber
 * chunks ao vivo; este endpoint e usado como fallback quando SSE falha.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
import { getCopyJob } from '../../../../../models/copy/copyJobRunner';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { id } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  try {
    const job = await getCopyJob(id, tenantId);
    if (!job) return res.status(404).json({ success: false, error: 'job nao encontrado' });

    return res.json({
      success: true,
      data: {
        id: job.id,
        status: job.status,
        kind: job.kind,
        sessionId: job.session_id,
        text: job.status === 'done' ? job.result_text : null,
        partialText: job.status === 'running' ? (job.partial_text || '') : null,
        historyId: job.history_id,
        error: job.error_message,
        startedAt: job.started_at,
        finishedAt: job.finished_at,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:copy/jobs:get]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
