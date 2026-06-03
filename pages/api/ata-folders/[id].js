/**
 * pages/api/ata-folders/[id].js  — PUT edita, DELETE remove (atas filhas viram sem-pasta).
 */
const { requireAuth, handleAuthError } = require('../../../lib/api-auth');
const model = require('../../../models/ataFolder.model');

export default async function handler(req, res) {
  let user;
  try { user = await requireAuth(req); }
  catch (err) { if (handleAuthError(res, err)) return; return res.status(500).json({ success: false, error: err.message }); }
  const tenantId = user.tenant_id;
  const { id } = req.query;

  try {
    if (req.method === 'PUT') {
      const { name, color } = req.body || {};
      const folder = await model.updateFolder(id, tenantId, { name, color });
      if (!folder) return res.status(404).json({ success: false, error: 'Pasta não encontrada' });
      return res.json({ success: true, folder });
    }
    if (req.method === 'DELETE') {
      const row = await model.deleteFolder(id, tenantId);
      if (!row) return res.status(404).json({ success: false, error: 'Pasta não encontrada' });
      return res.json({ success: true });
    }
    return res.status(405).end();
  } catch (err) {
    if (/unique|duplicate/i.test(err.message)) return res.status(409).json({ success: false, error: 'Já existe uma pasta com esse nome' });
    console.error('[ERRO][API:/api/ata-folders/[id]]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
