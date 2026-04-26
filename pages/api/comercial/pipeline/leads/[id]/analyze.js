/**
 * pages/api/comercial/pipeline/leads/[id]/analyze.js
 *   POST → cria emitter + dispara runLeadAnalysis em fire-and-forget
 *   Retorna jobId pro client conectar no SSE.
 *   Bloqueia execução simultânea pro mesmo lead via jobLock.
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../../lib/auth');
const { createJobEmitter } = require('../../../../../../infra/pipelineEmitter');
const { tryAcquire, release, getActive } = require('../../../../../../infra/jobLock');
const { checkRateLimit, logRateLimitEvent } = require('../../../../../../infra/rateLimit');
const pipeline = require('../../../../../../models/comercial/pipeline.model');
const { runLeadAnalysis } = require('../../../../../../models/comercial/leadAnalysisRunner');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:analyze]', { id: req.query?.id });

  const { id } = req.query;

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const lead = await pipeline.getLeadById(id, tenantId);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    // ── Bloqueia segunda execução simultânea ──
    const existing = getActive('lead_analysis', id);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Já existe uma análise rodando para este lead. Aguarde o término.',
        existingJobId: existing.jobId,
      });
    }

    // ── Rate limit diário ──
    const maxPerDay = Number(process.env.COMERCIAL_RATE_LIMIT_ANALYSIS_PER_DAY) || 20;
    const rl = await checkRateLimit(tenantId, 'comercial_lead_analysis', maxPerDay, 24 * 60);
    if (!rl.ok) {
      return res.status(429).json({
        success: false,
        error: `Limite diário (${maxPerDay} análises/dia) atingido. Tente em ${Math.ceil(rl.resetIn / 60)} min.`,
        retryAfter: rl.resetIn,
      });
    }

    const jobId = `analysis_${id}_${Date.now()}`;
    tryAcquire('lead_analysis', id, jobId);
    const emitter = createJobEmitter(jobId);

    setImmediate(async () => {
      try {
        await runLeadAnalysis({ tenantId, lead, emitter, createdBy: userId });
      } catch (err) {
        console.error('[ERRO][analyze fire-and-forget]', {
          leadId: id,
          error: err.message,
          stack: err.stack,
        });
      } finally {
        release('lead_analysis', id);
      }
    });

    await logRateLimitEvent(tenantId, 'comercial_lead_analysis', { leadId: id });

    return res.status(202).json({
      success: true,
      jobId,
      leadName: lead.company_name,
      rateLimit: { remaining: rl.remaining - 1, max: maxPerDay },
    });
  } catch (err) {
    release('lead_analysis', id);
    console.error('[ERRO][API:analyze]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
