/**
 * pages/api/support/modules/[id].js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET    — retorna o módulo aninhado com aulas e mídias (getModuleFull)
 * @route PUT    — atualiza metadados do módulo (admin only)
 * @route DELETE — apaga módulo. CASCADE no banco apaga aulas + mídias.
 *                 Arquivos físicos em public/uploads/ permanecem (dívida técnica).
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

    if (req.method === 'GET') {
      const data = await supportModel.getModuleFull(id, tenantId);
      if (!data) return res.status(404).json({ success: false, error: 'Módulo não encontrado' });
      return res.json({ success: true, module: data });
    }

    if (req.method === 'PUT') {
      if (!isAdmin(user)) {
        return res.status(403).json({ success: false, error: 'Apenas admin pode editar módulos' });
      }
      const updated = await supportModel.updateModule(id, req.body || {}, tenantId);
      if (!updated) return res.status(404).json({ success: false, error: 'Módulo não encontrado' });
      console.log('[SUCESSO][API:support/modules:id] PUT', { id, by: user.id });
      return res.json({ success: true, module: updated });
    }

    if (req.method === 'DELETE') {
      if (!isAdmin(user)) {
        return res.status(403).json({ success: false, error: 'Apenas admin pode apagar módulos' });
      }
      const deleted = await supportModel.deleteModule(id, tenantId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Módulo não encontrado' });
      console.log('[SUCESSO][API:support/modules:id] DELETE', { id, by: user.id });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][API:support/modules:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
