/**
 * pages/api/support/lessons/[id].js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route PUT    — atualiza aula (admin/god only)
 * @route DELETE — apaga aula (CASCADE apaga mídias do banco; arquivos físicos
 *                 permanecem — dívida técnica)
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
      return res.status(403).json({ success: false, error: 'Apenas admin pode editar aulas' });
    }

    if (req.method === 'PUT') {
      const updated = await supportModel.updateLesson(id, req.body || {}, tenantId);
      if (!updated) return res.status(404).json({ success: false, error: 'Aula não encontrada' });
      console.log('[SUCESSO][API:support/lessons:id] PUT', { id, by: user.id });
      return res.json({ success: true, lesson: updated });
    }

    if (req.method === 'DELETE') {
      const deleted = await supportModel.deleteLesson(id, tenantId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Aula não encontrada' });
      console.log('[SUCESSO][API:support/lessons:id] DELETE', { id, by: user.id });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][API:support/lessons:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
