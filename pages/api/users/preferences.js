/**
 * pages/api/users/preferences.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → retorna a preferência do usuário logado (default_view).
 * PUT  → atualiza a preferência (upsert).
 *
 * Por que existe: o dashboard de tasks tem 3 views (kanban/lista/checklist) e
 * a default agora é Checklist. Cada usuário pode escolher a sua e a UI deve
 * abrir já na view certa, sem flash.
 *
 * Multi-tenancy: resolveTenantId sempre, requireAuth sempre. Não confiar em
 * userId vindo do body — é sempre o usuário do cookie.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { requireAuth } = require('../../../lib/api-auth');
const prefsModel = require('../../../models/userPreferences.model');

export default async function handler(req, res) {
  try {
    const user = await requireAuth(req);
    const tenantId = await resolveTenantId(req);

    if (req.method === 'GET') {
      const prefs = await prefsModel.getPreferences(tenantId, user.id);
      console.log('[INFO][users/preferences] GET', { userId: user.id, view: prefs.default_view });
      return res.json({ success: true, preferences: prefs });
    }

    if (req.method === 'PUT') {
      const { default_view } = req.body || {};
      if (!default_view || !prefsModel.isValidView(default_view)) {
        return res.status(400).json({
          success: false,
          error: `default_view inválido. Use: ${prefsModel.ALLOWED_VIEWS.join(', ')}`,
        });
      }
      const updated = await prefsModel.upsertPreferences(tenantId, user.id, { default_view });
      console.log('[SUCESSO][users/preferences] PUT', { userId: user.id, view: updated.default_view });
      return res.json({ success: true, preferences: updated });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][users/preferences]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
