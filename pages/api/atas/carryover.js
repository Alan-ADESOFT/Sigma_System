/**
 * pages/api/atas/carryover.js
 * GET (?sourceAtaId=) → afazeres da ata anterior que estão "próxima semana" OU
 * cuja task não foi concluída. Voltam como rascunho pra semana nova.
 */
const { requireAuth, handleAuthError } = require('../../../lib/api-auth');
const model = require('../../../models/ata.model');

export default async function handler(req, res) {
  let user;
  try { user = await requireAuth(req); }
  catch (err) { if (handleAuthError(res, err)) return; return res.status(500).json({ success: false, error: err.message }); }
  const tenantId = user.tenant_id;

  try {
    if (req.method !== 'GET') return res.status(405).end();
    const afazeres = await model.getCarryover(tenantId, req.query.sourceAtaId || null);
    return res.json({ success: true, afazeres });
  } catch (err) {
    console.error('[ERRO][API:/api/atas/carryover]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
