/**
 * @fileoverview PUT/DELETE /api/image/folders/:id
 *   PUT { name?, color? } — atualiza
 *   DELETE — remove (jobs filhos ficam com folder_id NULL via FK)
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../lib/api-auth');
const { updateFolder, deleteFolder, getFolderById } = require('../../../../models/imageFolder.model');

export default async function handler(req, res) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  if (req.method === 'GET') {
    const folder = await getFolderById(id, tenantId);
    if (!folder) return res.status(404).json({ success: false, error: 'Pasta não encontrada' });
    return res.json({ success: true, data: folder });
  }

  if (req.method === 'PUT') {
    const { name, color } = req.body || {};
    try {
      const updated = await updateFolder(id, tenantId, { name, color });
      if (!updated) return res.status(404).json({ success: false, error: 'Pasta não encontrada' });
      return res.json({ success: true, data: updated });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Já existe uma pasta com esse nome' });
      }
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    const ok = await deleteFolder(id, tenantId);
    if (!ok) return res.status(404).json({ success: false, error: 'Pasta não encontrada' });
    return res.json({ success: true, data: { id, deleted: true } });
  }

  return res.status(405).json({ success: false, error: 'Método não permitido' });
}
