/**
 * pages/api/support/media/[id].js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route PUT    — atualiza metadados (title, description, sort_order). NÃO troca
 *                 arquivo — pra trocar, deletar e recriar (sprint Central de Suporte).
 * @route DELETE — apaga registro do banco. Arquivo físico em public/uploads/
 *                 PERMANECE (dívida técnica — sprint futuro de garbage collection).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, isAdmin } = require('../../../../lib/api-auth');
const supportModel = require('../../../../models/support.model');

export default async function handler(req, res) {
  try {
    const user = await requireAuth(req);
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });
    if (!isAdmin(user)) {
      return res.status(403).json({ success: false, error: 'Apenas admin pode editar mídia' });
    }

    if (req.method === 'PUT') {
      const updated = await supportModel.updateMedia(id, req.body || {}, tenantId);
      if (!updated) return res.status(404).json({ success: false, error: 'Mídia não encontrada' });
      console.log('[SUCESSO][API:support/media:id] PUT', { id, by: user.id });
      return res.json({ success: true, media: updated });
    }

    if (req.method === 'DELETE') {
      const deleted = await supportModel.deleteMedia(id, tenantId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Mídia não encontrada' });
      console.log('[SUCESSO][API:support/media:id] DELETE', { id, by: user.id });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][API:support/media:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
