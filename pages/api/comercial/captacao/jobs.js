/**
 * pages/api/comercial/captacao/jobs.js
 *   POST → cria lista 'pending' + dispara worker Apify (fire and forget)
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../lib/auth');
const { createJobEmitter } = require('../../../../infra/pipelineEmitter');
const { checkRateLimit, logRateLimitEvent } = require('../../../../infra/rateLimit');
const leadList = require('../../../../models/comercial/leadList.model');
const { runCaptacaoJob } = require('../../../../server/apifyWorker');
const { getSetting } = require('../../../../models/settings.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:comercial/captacao/jobs]', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { name, filters } = req.body || {};
    if (!filters || !filters.niche || !filters.state) {
      return res.status(400).json({ success: false, error: 'niche e state obrigatórios' });
    }

    // Rate limit (default 10/dia, configurável via settings)
    const cfgMax = await getSetting(tenantId, 'comercial_max_jobs_per_day');
    const maxJobs = Number(cfgMax) > 0 ? Number(cfgMax) : 10;
    const rl = await checkRateLimit(tenantId, 'comercial_capture', maxJobs, 24 * 60);
    if (!rl.ok) {
      return res.status(429).json({
        success: false,
        error: `Limite diário (${maxJobs}/dia) atingido. Tente novamente em ${Math.ceil(rl.resetIn / 60)} min.`,
        retryAfter: rl.resetIn,
      });
    }

    // TTL configurável
    const cfgTtl = await getSetting(tenantId, 'comercial_list_ttl_days');
    const ttlDays = Number(cfgTtl) > 0 ? Number(cfgTtl) : 5;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const listName = (name && String(name).trim())
      || `${filters.niche} ${filters.city || ''} ${filters.state}`.trim().replace(/\s+/g, ' ');

    const list = await leadList.createList(tenantId, {
      name: listName,
      source: 'apify',
      filters,
      expiresAt,
      createdBy: userId,
    });

    await logRateLimitEvent(tenantId, 'comercial_capture', { listId: list.id });

    // Cria emitter ANTES de retornar pra que o cliente conecte ao SSE imediatamente
    const emitter = createJobEmitter(list.id);

    // Fire and forget — roda no background
    setImmediate(() => {
      runCaptacaoJob({ tenantId, listId: list.id, filters, emitter })
        .catch(err => console.error('[ERRO][captacao/jobs]', { error: err.message }));
    });

    console.log('[SUCESSO][API:comercial/captacao/jobs]', { listId: list.id });
    return res.status(201).json({ success: true, jobId: list.id, listId: list.id, list });
  } catch (err) {
    console.error('[ERRO][API:comercial/captacao/jobs]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
