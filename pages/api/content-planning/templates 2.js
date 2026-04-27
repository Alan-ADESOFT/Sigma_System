/**
 * pages/api/content-planning/templates.js
 *   GET → lista planos com is_template = true
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const planModel = require('../../../models/contentPlanning/plan');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);

  try {
    const templates = await planModel.listTemplates(tenantId);
    return res.json({ success: true, templates });
  } catch (err) {
    console.error('[ERRO][API:content-planning/templates]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
