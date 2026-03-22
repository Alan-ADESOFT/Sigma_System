/**
 * @fileoverview Endpoint: Status do pipeline de um cliente
 * @route GET /api/agentes/pipeline/status?clientId=xxx
 *
 * Retorna o job mais recente do cliente com status de execução.
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { queryOne }        from '../../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { clientId } = req.query;

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId é obrigatório' });
  }

  try {
    const job = await queryOne(
      `SELECT id, status, total_agents, completed_agents, current_agent, logs, error, started_at, finished_at
       FROM pipeline_jobs
       WHERE client_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [clientId, tenantId]
    );

    if (!job) {
      return res.json({ success: true, data: null });
    }

    return res.json({
      success: true,
      data: {
        jobId:           job.id,
        status:          job.status,
        completedAgents: job.completed_agents,
        totalAgents:     job.total_agents,
        currentAgent:    job.current_agent,
        logs:            job.logs,
        error:           job.error,
        startedAt:       job.started_at,
        finishedAt:      job.finished_at,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:pipeline/status] Erro', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
