/**
 * pages/api/whatsapp/reuniao-config.js
 * Config do comando /reuniao (admin only).
 * GET  → { enabled, allowedGroups[], allowedNumbers[] }
 * POST → salva a config
 */

const { requireAdmin, handleAuthError } = require('../../../lib/api-auth');
const { getReuniaoConfig, saveReuniaoConfig } = require('../../../models/reuniaoBotConfig.model');

export default async function handler(req, res) {
  let user;
  try {
    user = await requireAdmin(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    return res.status(500).json({ success: false, error: err.message });
  }
  const tenantId = user.tenant_id;

  try {
    if (req.method === 'GET') {
      const config = await getReuniaoConfig(tenantId);
      return res.json({ success: true, config });
    }
    if (req.method === 'POST') {
      await saveReuniaoConfig(tenantId, req.body || {});
      const config = await getReuniaoConfig(tenantId);
      return res.json({ success: true, config });
    }
    return res.status(405).end();
  } catch (err) {
    console.error('[ERRO][API:reuniao-config]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
