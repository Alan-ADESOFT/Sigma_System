/**
 * @fileoverview Endpoint SSE: Stream de logs do pipeline em tempo real
 * @route GET /api/agentes/stream-log?jobId=xxx
 *
 * Lê eventos do EventEmitter em memória (produzidos pelo run-all.js)
 * e envia via Server-Sent Events para o frontend.
 *
 * Eventos emitidos:
 *   agent_start    — agente começou a executar
 *   agent_done     — agente concluiu
 *   pipeline_done  — pipeline completo
 *   pipeline_error — pipeline falhou
 */

import { getJobEmitter } from '../../../infra/pipelineEmitter';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { jobId } = req.query;
  if (!jobId) return res.status(400).json({ success: false, error: 'jobId é obrigatório' });

  // Configura SSE
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emitter = getJobEmitter(jobId);

  if (!emitter) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Job não encontrado ou já expirado' })}\n\n`);
    return res.end();
  }

  // Handler de eventos
  function onEvent(data) {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  }

  emitter.on('event', onEvent);

  // Heartbeat para manter conexão viva
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 15000);

  // Cleanup quando cliente desconecta
  req.on('close', () => {
    emitter.off('event', onEvent);
    clearInterval(heartbeat);
  });
}
