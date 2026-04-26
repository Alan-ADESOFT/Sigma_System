/**
 * @fileoverview POST /api/setup/image-cleanup
 * @description Endpoint manual para forçar o cleanup de jobs antigos.
 * Protegido por header `x-internal-token` (compara com INTERNAL_API_TOKEN).
 *
 * Útil para:
 *   · Cron externo (Vercel Cron) chamando este endpoint em produção
 *   · Operação manual quando o worker interno não está rodando
 */

const { cleanupOldJobs } = require('../../../server/imageWorker');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const expected = process.env.INTERNAL_API_TOKEN;
  const provided = req.headers['x-internal-token'];
  if (!expected || provided !== expected) {
    return res.status(401).json({ success: false, error: 'Token interno inválido' });
  }

  try {
    const result = await cleanupOldJobs();
    return res.json({
      success: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    console.error('[ERRO][API:setup/image-cleanup]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
