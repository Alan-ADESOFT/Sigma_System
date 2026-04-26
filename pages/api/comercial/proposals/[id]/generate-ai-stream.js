/**
 * pages/api/comercial/proposals/[id]/generate-ai-stream.js
 *   GET (SSE) ?jobId=xxx
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
import { getJobEmitter } from '../../../../../infra/pipelineEmitter';

export const config = {
  api: { bodyParser: false, responseLimit: false },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id, jobId } = req.query;
  if (!jobId) return res.status(400).json({ success: false, error: 'jobId obrigatório' });
  if (id && !String(jobId).startsWith(`proposal_${id}_`)) {
    return res.status(400).json({ success: false, error: 'jobId não corresponde à proposta' });
  }

  try {
    await resolveTenantId(req);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let emitter = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      emitter = getJobEmitter(jobId);
      if (emitter) break;
      await new Promise(r => setTimeout(r, 500));
    }
    if (!emitter) {
      res.write('data: ' + JSON.stringify({ type: 'error', message: 'Job não encontrado' }) + '\n\n');
      return res.end();
    }

    function onEvent(data) {
      try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch {}
    }
    emitter.on('event', onEvent);

    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n'); } catch {}
    }, 15000);

    req.on('close', () => {
      emitter.off('event', onEvent);
      clearInterval(heartbeat);
    });
  } catch (err) {
    console.error('[ERRO][API:generate-ai-stream]', { error: err.message });
    try { res.status(500).end(); } catch {}
  }
}
