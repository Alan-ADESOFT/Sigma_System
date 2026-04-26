/**
 * pages/api/ads/public/export-pdf.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET /api/ads/public/export-pdf?token=X&datePreset=Y   (PÚBLICO)
 *
 * STATUS: 501 Not Implemented (TODO).
 *
 * Motivo: o projeto não tem lib de PDF instalada (apenas `docx` é uma dep).
 * Para implementar:
 *   1. Adicionar `pdfkit` ao package.json (lightweight, zero-config)
 *   2. Renderizar uma versão server-side do relatório com seções: capa,
 *      KPIs (com Δ vs período anterior), timeline (gráfico SVG embedado), top
 *      e bottom campaigns.
 *   3. Respeitar config.allowExport — se false, retornar 403.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const adsPublicReport = require('../../../../models/ads/adsPublicReport.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Use GET' });

  const { token } = req.query;
  if (!token) return res.status(400).json({ success: false, error: 'token obrigatório' });

  // Pelo menos valida o token pra não vazar 501 sem auth
  const { valid, reason, tokenData } = await adsPublicReport.validateToken(token);
  if (!valid) return res.status(403).json({ success: false, error: `token_${reason}` });
  if (tokenData.config && tokenData.config.allowExport === false) {
    return res.status(403).json({ success: false, error: 'Exportação desativada para este token' });
  }

  return res.status(501).json({
    success: false,
    error: 'Exportação de PDF ainda não implementada nesta sprint. Adicione pdfkit ao package.json e implemente conforme TODO no arquivo.',
  });
}
