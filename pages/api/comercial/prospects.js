/**
 * pages/api/comercial/prospects.js
 *   GET  → lista
 *   POST → cria manual
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const { verifyToken } = require('../../../lib/auth');
const prospects = require('../../../models/comercial/prospect.model');

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/prospects]', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    if (req.method === 'GET') {
      const { search, limit, offset } = req.query;
      const list = await prospects.listProspects(tenantId, {
        limit: limit ? Math.max(1, Math.min(200, parseInt(limit, 10))) : 100,
        offset: offset ? Math.max(0, parseInt(offset, 10)) : 0,
        search: search || '',
      });
      return res.json({ success: true, prospects: list });
    }

    if (req.method === 'POST') {
      const data = req.body || {};
      if (!data.companyName || !String(data.companyName).trim()) {
        return res.status(400).json({ success: false, error: 'companyName obrigatório' });
      }
      const prospect = await prospects.createProspect(tenantId, {
        ...data,
        companyName: String(data.companyName).trim(),
        source: 'manual',
      }, userId);
      return res.status(201).json({ success: true, prospect });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:comercial/prospects]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
