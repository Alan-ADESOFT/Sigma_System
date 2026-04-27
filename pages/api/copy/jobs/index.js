/**
 * @fileoverview Endpoint: Enfileira job assíncrono de copy
 * @route POST /api/copy/jobs
 *
 * Cria uma linha em copy_generation_jobs, dispara processCopyJob via
 * setImmediate (mesmo processo, não bloqueia a request) e retorna 202 com o
 * jobId. O cliente faz polling em GET /api/copy/jobs/[id] e recebe uma
 * notificação no sininho (system_notifications) quando o job conclui.
 *
 * Body: {
 *   kind: 'generate' | 'improve',
 *   params: { ... mesmos campos dos endpoints síncronos ... }
 * }
 *
 * Em produção single-instance (este projeto) o setImmediate cumpre o papel de
 * worker. Multi-instance exigiria mover pro padrão do imageWorker.
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { createCopyJob, processCopyJob } from '../../../../models/copy/copyJobRunner';

export const config = {
  api: { bodyParser: { sizeLimit: '30mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { kind, params } = req.body || {};

  if (!kind || !['generate', 'improve'].includes(kind)) {
    return res.status(400).json({ success: false, error: 'kind deve ser generate ou improve' });
  }
  if (!params?.sessionId) {
    return res.status(400).json({ success: false, error: 'params.sessionId obrigatorio' });
  }
  if (kind === 'generate' && !params.promptRaiz) {
    return res.status(400).json({ success: false, error: 'params.promptRaiz obrigatorio' });
  }
  if (kind === 'improve' && !params.instruction) {
    return res.status(400).json({ success: false, error: 'params.instruction obrigatorio' });
  }

  try {
    const job = await createCopyJob({
      tenantId,
      sessionId: params.sessionId,
      clientId: params.clientId || null,
      kind,
      params,
    });

    // Dispara processamento assíncrono. Não bloqueia a resposta.
    setImmediate(() => { processCopyJob(job.id); });

    return res.status(202).json({
      success: true,
      data: { jobId: job.id, status: job.status },
    });
  } catch (err) {
    console.error('[ERRO][API:copy/jobs:create]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
