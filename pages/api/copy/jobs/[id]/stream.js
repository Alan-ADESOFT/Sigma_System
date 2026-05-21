/**
 * @fileoverview SSE: stream de status + partial_text de job de copy
 * @route GET /api/copy/jobs/[id]/stream
 *
 * O frontend abre EventSource neste endpoint enquanto o job esta em
 * pending/running. Eventos emitidos:
 *   event: status   data: { status }
 *   event: chunk    data: { partial: string }   (so quando partial_text muda)
 *   event: done     data: { text, historyId }
 *   event: error    data: { error }
 *
 * Implementacao: polling do banco a cada 400ms — barato, robusto, e nao
 * exige Redis Pub/Sub (single-instance). Quando o job conclui, emite done
 * e fecha a conexao. O cliente cai em fallback de polling se a conexao
 * nao receber nenhum evento nos primeiros 3s (vide CopyWorkspace).
 *
 * Notas de producao (Railway): SSE depende de proxy nao bufferizar. O
 * header X-Accel-Buffering: no desliga o nginx buffering quando aplicavel.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
import { getCopyJob } from '../../../../../models/copy/copyJobRunner';

const POLL_MS = 400;
const HARD_TIMEOUT_MS = 5 * 60_000; // mata a conexao apos 5min sem terminar

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  let tenantId;
  try {
    tenantId = await resolveTenantId(req);
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Nao autorizado' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  // Headers SSE — nao buffer, sem cache
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event, data) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  let lastPartialLen = 0;
  let lastStatus = null;
  let closed = false;
  const startedAt = Date.now();

  const cleanup = () => {
    closed = true;
    try { res.end(); } catch {}
  };
  req.on('close', cleanup);

  // Heartbeat — mantem conexao viva atras de proxies que matam idle
  const heartbeat = setInterval(() => {
    if (closed) return;
    try { res.write(': ping\n\n'); } catch {}
  }, 15_000);

  try {
    while (!closed) {
      if (Date.now() - startedAt > HARD_TIMEOUT_MS) {
        sendEvent('error', { error: 'Timeout — feche e abra novamente.' });
        break;
      }

      const job = await getCopyJob(id, tenantId);
      if (!job) {
        sendEvent('error', { error: 'Job nao encontrado' });
        break;
      }

      if (job.status !== lastStatus) {
        lastStatus = job.status;
        sendEvent('status', { status: job.status });
      }

      if (job.status === 'running' && job.partial_text) {
        if (job.partial_text.length !== lastPartialLen) {
          lastPartialLen = job.partial_text.length;
          sendEvent('chunk', { partial: job.partial_text });
        }
      }

      if (job.status === 'done') {
        sendEvent('done', {
          text: job.result_text || '',
          historyId: job.history_id || null,
        });
        break;
      }
      if (job.status === 'error') {
        sendEvent('error', { error: job.error_message || 'Erro desconhecido' });
        break;
      }

      await new Promise(r => setTimeout(r, POLL_MS));
    }
  } catch (err) {
    console.error('[ERRO][API:copy/jobs/stream]', { error: err.message });
    sendEvent('error', { error: err.message || 'Erro interno' });
  } finally {
    clearInterval(heartbeat);
    cleanup();
  }
}
