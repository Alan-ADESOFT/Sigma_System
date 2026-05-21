/**
 * @fileoverview Endpoint: status do job de export
 * @route GET /api/copy/export/[jobId]
 *
 * Retorna o estado atual do job. Quando status='done', resultUrl aponta
 * pro arquivo gerado em /uploads/exports/... pronto pra download direto.
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { getExportJob } from '../../../../models/copy/exportJobRunner';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { jobId } = req.query;
  if (!jobId) return res.status(400).json({ success: false, error: 'jobId obrigatorio' });

  try {
    const job = await getExportJob(jobId, tenantId);
    if (!job) return res.status(404).json({ success: false, error: 'job nao encontrado' });

    return res.json({
      success: true,
      data: {
        id: job.id,
        status: job.status,
        template: job.template,
        format: job.format,
        useBrandbook: job.use_brandbook,
        resultUrl: job.status === 'done' ? job.result_url : null,
        resultSizeBytes: job.result_size_bytes,
        durationMs: job.duration_ms,
        error: job.error_message,
        startedAt: job.started_at,
        finishedAt: job.finished_at,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:copy/export:get]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
