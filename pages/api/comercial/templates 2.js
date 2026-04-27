/**
 * pages/api/comercial/templates.js
 *   GET  → lista templates (auto-bootstrap dos defaults se vazio)
 *   POST → cria template custom
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const { verifyToken } = require('../../../lib/auth');
const tpl = require('../../../models/comercial/messageTemplate.model');

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/templates]', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    if (req.method === 'GET') {
      // Bootstrap idempotente
      await tpl.bootstrapDefaultTemplates(tenantId);
      const { category, channel } = req.query;
      const list = await tpl.listTemplates(tenantId, { category, channel });
      return res.json({ success: true, templates: list });
    }

    if (req.method === 'POST') {
      const data = req.body || {};
      if (!data.name || !data.content) {
        return res.status(400).json({ success: false, error: 'name e content obrigatórios' });
      }
      const created = await tpl.createTemplate(tenantId, data, userId);
      return res.status(201).json({ success: true, template: created });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:templates]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
