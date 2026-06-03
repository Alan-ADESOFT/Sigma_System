/**
 * pages/api/atas/[id].js
 * GET  → ata + status AO VIVO dos afazeres (puxa de client_tasks via ata_id).
 * PUT  → salva cabeçalho + afazeres (rascunho).
 * DELETE → remove a ata (tasks linkadas ficam com ata_id = NULL).
 */
const { requireAuth, handleAuthError } = require('../../../lib/api-auth');
const model = require('../../../models/ata.model');

export default async function handler(req, res) {
  let user;
  try { user = await requireAuth(req); }
  catch (err) { if (handleAuthError(res, err)) return; return res.status(500).json({ success: false, error: err.message }); }
  const tenantId = user.tenant_id;
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const ata = await model.getAtaWithStatus(id, tenantId);
      if (!ata) return res.status(404).json({ success: false, error: 'Ata não encontrada' });
      return res.json({ success: true, ata });
    }
    if (req.method === 'PUT') {
      const ata = await model.updateAta(id, tenantId, req.body || {});
      if (!ata) return res.status(404).json({ success: false, error: 'Ata não encontrada' });
      return res.json({ success: true, ata });
    }
    if (req.method === 'DELETE') {
      const row = await model.deleteAta(id, tenantId);
      if (!row) return res.status(404).json({ success: false, error: 'Ata não encontrada' });
      return res.json({ success: true });
    }
    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:/api/atas/[id]]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
