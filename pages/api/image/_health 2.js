/**
 * @fileoverview GET /api/image/_health — diagnóstico interno do worker
 * @description Protegido por header `x-internal-token` (compara com
 * INTERNAL_API_TOKEN). Retorna snapshot do worker, fila atual no banco,
 * cache hit rate e último cleanup.
 *
 * Uso típico em produção (Railway):
 *   curl -H "x-internal-token: $INTERNAL_API_TOKEN" \
 *        https://app.example.com/api/image/_health
 */

const { getWorkerSnapshot } = require('../../../server/imageWorker');
const { queryOne } = require('../../../infra/db');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const expected = process.env.INTERNAL_API_TOKEN;
  const provided = req.headers['x-internal-token'];
  if (!expected || provided !== expected) {
    return res.status(401).json({ success: false, error: 'Token interno inválido' });
  }

  try {
    const snap = getWorkerSnapshot();

    // Adiciona contagem ao vivo da fila no banco (não é o que o worker
    // tem em memória — ajuda a detectar drift entre instâncias).
    const queue = await queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
         COUNT(*) FILTER (WHERE status = 'running')::int AS running
       FROM image_jobs`
    );

    return res.json({
      success: true,
      ...snap,
      queue: {
        queued:  queue?.queued || 0,
        running: queue?.running || 0,
      },
      now: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[ERRO][API:image/_health]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
