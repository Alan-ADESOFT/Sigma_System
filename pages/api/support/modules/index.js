/**
 * pages/api/support/modules/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET  /api/support/modules — lista módulos do tenant
 * @route POST /api/support/modules — cria módulo (admin/god only)
 *
 * Multi-tenant via resolveTenantId. GET é livre pra qualquer user autenticado;
 * POST exige role admin ou god (checagem server-side via isAdmin do api-auth).
 * Não confiar no front: o user pode forjar requests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, isAdmin } = require('../../../../lib/api-auth');
const supportModel = require('../../../../models/support.model');

export default async function handler(req, res) {
  try {
    const user = await requireAuth(req);
    const tenantId = await resolveTenantId(req);

    if (req.method === 'GET') {
      const modules = await supportModel.getAllModules(tenantId);
      return res.json({ success: true, modules });
    }

    if (req.method === 'POST') {
      if (!isAdmin(user)) {
        return res.status(403).json({ success: false, error: 'Apenas admin pode criar módulos' });
      }
      const { title, description, icon, sort_order } = req.body || {};
      if (!title || !String(title).trim()) {
        return res.status(400).json({ success: false, error: 'title obrigatório' });
      }
      const created = await supportModel.createModule(
        { title, description, icon, sort_order },
        tenantId,
        user.id
      );
      console.log('[SUCESSO][API:support/modules] criado', { id: created.id, by: user.id });
      return res.status(201).json({ success: true, module: created });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][API:support/modules]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
