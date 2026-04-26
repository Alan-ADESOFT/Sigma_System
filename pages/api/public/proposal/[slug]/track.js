/**
 * pages/api/public/proposal/[slug]/track.js
 *   POST (público) — actions: 'start' | 'ping' | 'end'
 *
 * Body por action:
 *   start: { userAgent?, referer? } → retorna { viewId }
 *   ping:  { viewId, timeSeconds, scrollPct }
 *   end:   { viewId, timeSeconds?, scrollPct? }
 */

const proposals = require('../../../../../models/comercial/proposal.model');

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || req.connection?.remoteAddress || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { slug } = req.query;
    const body = req.body || {};
    const action = body.action;

    if (action === 'start') {
      const result = await proposals.recordView(slug, {
        ip: getClientIp(req),
        userAgent: body.userAgent || req.headers['user-agent'] || '',
        referer: body.referer || req.headers.referer || null,
      });
      if (!result) return res.status(404).json({ success: false, error: 'not_found' });
      if (result.expired || result.draft) {
        return res.status(410).json({ success: false, error: result.expired ? 'expired' : 'not_published' });
      }
      return res.json({ success: true, viewId: result.view.id, isUnique: result.view.is_unique });
    }

    if (action === 'ping') {
      if (!body.viewId) return res.status(400).json({ success: false, error: 'viewId obrigatório' });
      const updated = await proposals.pingView(body.viewId, {
        timeSeconds: body.timeSeconds,
        scrollPct: body.scrollPct,
      });
      if (!updated) return res.status(404).json({ success: false, error: 'view não encontrada' });
      return res.json({ success: true });
    }

    if (action === 'end') {
      if (!body.viewId) return res.status(400).json({ success: false, error: 'viewId obrigatório' });
      // Aplica último ping antes de encerrar
      if (body.timeSeconds != null || body.scrollPct != null) {
        await proposals.pingView(body.viewId, {
          timeSeconds: body.timeSeconds,
          scrollPct: body.scrollPct,
        });
      }
      await proposals.endView(body.viewId);
      return res.json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'action inválida (use start|ping|end)' });
  } catch (err) {
    console.error('[ERRO][API:public/proposal/track]', { error: err.message });
    return res.status(500).json({ success: false, error: 'internal' });
  }
}
