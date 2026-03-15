const { getOrCreateAdmin } = require('../models/tenant.model');

let _cachedAdminId = null;

/**
 * Resolve o tenant ID do request.
 * Prioridade: header x-tenant-id > env ADMIN_TENANT_ID > busca/cria admin no DB
 */
async function resolveTenantId(req) {
  if (req?.headers?.['x-tenant-id']) return req.headers['x-tenant-id'];
  if (process.env.ADMIN_TENANT_ID) return process.env.ADMIN_TENANT_ID;

  if (!_cachedAdminId) {
    const email = process.env.ADMIN_EMAIL || 'admin@dashboard.local';
    const name = process.env.ADMIN_NAME || 'Admin';
    const tenant = await getOrCreateAdmin(email, name);
    _cachedAdminId = tenant?.id;
  }

  return _cachedAdminId;
}

// Limpa o cache (util em testes ou quando o tenant muda)
function clearTenantCache() {
  _cachedAdminId = null;
}

module.exports = { resolveTenantId, clearTenantCache };
