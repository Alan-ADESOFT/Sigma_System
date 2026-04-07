/**
 * pages/api/cron/instagram-publisher.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/cron/instagram-publisher
 *
 * Cron de publicação no Instagram. Roda a cada 5 minutos:
 *   - Busca posts em status 'scheduled' com scheduled_at <= now()
 *   - Para cada um: publica via Meta API usando o token do PRÓPRIO cliente
 *   - Atualiza status → published | failed
 *
 * Protegido por header `x-internal-token` (mesmo padrão dos outros crons).
 *
 * Vercel/Railway cron config:
 *   { "path": "/api/cron/instagram-publisher", "schedule": "* /5 * * * *" }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { runPublisherCycle } = require('../../../server/instagramPublisher');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use POST' });
  }

  const token = req.headers['x-internal-token'];
  if (!token || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  try {
    const results = await runPublisherCycle();
    return res.json({ success: true, ...results });
  } catch (err) {
    console.error('[ERRO][Cron:InstagramPublisher]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
