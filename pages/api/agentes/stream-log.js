/**
 * @fileoverview Endpoint SSE: Stream de logs do pipeline em tempo real
 * @route GET /api/agentes/stream-log?jobId=xxx
 */

import { getJobEmitter } from '../../../infra/pipelineEmitter';

export const config = {
  api: { bodyParser: false, responseLimit: false },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { jobId } = req.query;
  if (!jobId) return res.status(400).json({ success: false, error: 'jobId obrigatorio' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Espera ate 10s pelo emitter (o setImmediate no run-all pode demorar)
  let emitter = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    emitter = getJobEmitter(jobId);
    if (emitter) break;
    await new Promise(r => setTimeout(r, 500));
  }

  if (!emitter) {
    res.write('data: ' + JSON.stringify({ type: 'error', message: 'Job nao encontrado' }) + '\n\n');
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
}
