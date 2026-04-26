/**
 * pages/api/comercial/pipeline/leads/[id]/analyze-stream.js
 *   GET (SSE) ?jobId=xxx → eventos da análise IA em andamento
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
import { getJobEmitter } from '../../../../../../infra/pipelineEmitter';

export const config = {
  api: { bodyParser: false, responseLimit: false },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }

  const { id, jobId } = req.query;
  if (!jobId) {
    res.status(400).json({ success: false, error: 'jobId obrigatório' });
    return;
  }
  // valida que jobId refere ao lead em questão (defesa simples contra IDOR)
  if (id && !String(jobId).startsWith(`analysis_${id}_`)) {
    res.status(400).json({ success: false, error: 'jobId não corresponde ao lead' });
    return;
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
      res.end();
      return;
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
    console.error('[ERRO][API:analyze-stream]', { error: err.message });
    try { res.status(500).end(); } catch {}
  }
}
