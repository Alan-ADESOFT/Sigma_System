/**
 * pages/api/public/content-plan/track-open.js
 *   POST { token } — registra abertura (chamado on-mount na pagina publica).
 *
 * Não exige PIN — só registra a tentativa de visualização. Mesmo que o
 * token seja invalido/expirado, retorna 200 silenciosamente para nao
 * vazar diferenca (timing) entre tokens validos e invalidos.
 */

const shareTokenModel = require('../../../../models/contentPlanning/shareToken');

function setSecurityHeaders(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

function pickIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ success: false, error: 'token obrigatorio' });

  try {
    const data = await shareTokenModel.getTokenByValue(token);
    if (!data) {
      return res.json({ success: true });
    }

    const ip = pickIp(req);
    const ua = req.headers['user-agent'] || null;
    await shareTokenModel.trackOpen(data.id, ip, ua);

    return res.json({ success: true });
  } catch (err) {
    console.error('[ERRO][API:public/content-plan/track-open]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
