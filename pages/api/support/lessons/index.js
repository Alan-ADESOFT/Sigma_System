/**
 * pages/api/support/lessons/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/support/lessons — cria aula em um módulo (admin/god only)
 *
 * Valida que o moduleId pertence ao tenant antes de inserir — evita que admin
 * de outro workspace burle e crie aula num módulo alheio (defesa em profundidade
 * mesmo que a UI nunca tente isso).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, isAdmin } = require('../../../../lib/api-auth');
const supportModel = require('../../../../models/support.model');

export default async function handler(req, res) {
  try {
    const user = await requireAuth(req);
    const tenantId = await resolveTenantId(req);

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Método não permitido' });
    }
    if (!isAdmin(user)) {
      return res.status(403).json({ success: false, error: 'Apenas admin pode criar aulas' });
    }

    const { moduleId, title, description, sort_order } = req.body || {};
    if (!moduleId) return res.status(400).json({ success: false, error: 'moduleId obrigatório' });
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, error: 'title obrigatório' });
    }

    const owns = await supportModel.isModuleOfTenant(moduleId, tenantId);
    if (!owns) {
      return res.status(404).json({ success: false, error: 'Módulo não encontrado' });
    }

    const created = await supportModel.createLesson(
      { module_id: moduleId, title, description, sort_order },
      tenantId,
      user.id
    );
    console.log('[SUCESSO][API:support/lessons] criada', { id: created.id, moduleId, by: user.id });
    return res.status(201).json({ success: true, lesson: created });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][API:support/lessons]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
