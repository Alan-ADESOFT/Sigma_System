/**
 * @fileoverview Endpoint: Aprovar etapa do pipeline (modo revisão)
 * @route POST /api/agentes/pipeline/[jobId]/approve
 *
 * Muda pipeline_jobs.status de 'awaiting_review' para 'approved'
 * para que o pipeline em background possa continuar.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
import { queryOne }        from '../../../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { jobId } = req.query;

  if (!jobId) {
    return res.status(400).json({ success: false, error: 'jobId é obrigatório' });
  }

  try {
    const job = await queryOne(
      `SELECT id, status, current_agent FROM pipeline_jobs WHERE id = $1 AND tenant_id = $2`,
      [jobId, tenantId]
    );

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job não encontrado' });
    }

    if (job.status !== 'awaiting_review') {
      return res.status(400).json({ success: false, error: `Job não está aguardando revisão (status: ${job.status})` });
    }

    await queryOne(
      `UPDATE pipeline_jobs SET status = 'approved' WHERE id = $1`,
      [jobId]
    );

    console.log('[INFO][Pipeline:approve] Etapa aprovada', { jobId, nextAgent: job.current_agent });
    return res.json({ success: true, nextAgent: job.current_agent });
  } catch (err) {
    console.error('[ERRO][Pipeline:approve]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
