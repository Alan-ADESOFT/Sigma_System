/**
 * pages/api/comercial/captacao/jobs/[id]/stream.js
 *   GET (SSE) → eventos de progresso de uma captação
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
import { getJobEmitter } from '../../../../../../infra/pipelineEmitter';
const leadList = require('../../../../../../models/comercial/leadList.model');

export const config = {
  api: { bodyParser: false, responseLimit: false },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

  try {
    const tenantId = await resolveTenantId(req);
    const list = await leadList.getListById(id, tenantId);
    if (!list) {
      return res.status(404).json({ success: false, error: 'Lista não encontrada' });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Snapshot inicial — útil quando o cliente reconecta
    res.write('data: ' + JSON.stringify({
      type: 'snapshot',
      status: list.status,
      totalLeads: list.total_leads,
    }) + '\n\n');

    // Espera até 10s pelo emitter (caller pode ter usado setImmediate)
    let emitter = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      emitter = getJobEmitter(id);
      if (emitter) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!emitter) {
      // Job pode ter terminado antes do client se conectar
      res.write('data: ' + JSON.stringify({
        type: list.status === 'completed' ? 'done' : list.status === 'failed' ? 'error' : 'progress',
        message: 'Sem stream ativo. Status atual: ' + list.status,
      }) + '\n\n');
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
    console.error('[ERRO][API:comercial/captacao/jobs/[id]/stream]', { error: err.message });
    try { res.status(500).end(); } catch {}
  }
}
