/**
 * pages/api/atas/index.js  — GET lista (opcional ?folderId=), POST cria.
 */
const { requireAuth, handleAuthError } = require('../../../lib/api-auth');
const model = require('../../../models/ata.model');

export default async function handler(req, res) {
  let user;
  try { user = await requireAuth(req); }
  catch (err) { if (handleAuthError(res, err)) return; return res.status(500).json({ success: false, error: err.message }); }
  const tenantId = user.tenant_id;

  try {
    if (req.method === 'GET') {
      const atas = await model.listAtas(tenantId, { folderId: req.query.folderId || undefined });
      return res.json({ success: true, atas });
    }
    if (req.method === 'POST') {
      const ata = await model.createAta(tenantId, req.body || {}, user.id);
      return res.status(201).json({ success: true, ata });
    }
    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:/api/atas]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
