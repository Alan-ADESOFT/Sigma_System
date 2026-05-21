/**
 * @fileoverview Endpoint: Configuração do Copy
 * @route GET/POST /api/settings/copy-config
 *
 * GET  → retorna { copy_model }
 * POST → { key: 'copy_model', value: '...' }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { getSetting, setSetting } from '../../../models/settings.model';

const { requireAuth, requireAdmin } = require('../../../lib/api-auth');

const ALLOWED_KEYS = ['copy_model'];

export default async function handler(req, res) {
  // Patch de segurança (20260521): leitura exige auth; escrita exige admin/god
  try {
    if (req.method === 'GET') await requireAuth(req);
    else                      await requireAdmin(req);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    throw err;
  }

  const tenantId = await resolveTenantId(req);

  if (req.method === 'GET') {
    try {
      const copyModel = await getSetting(tenantId, 'copy_model');
      return res.json({
        success: true,
        data: { copy_model: copyModel || 'gpt-4o-mini' },
      });
    } catch (err) {
      console.error('[ERRO][API:copy-config] GET', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { key, value } = req.body;
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ success: false, error: 'Chave invalida' });
    }
    try {
      await setSetting(tenantId, key, value);
      console.log('[SUCESSO][API:copy-config] Configuracao salva', { key, value });
      return res.json({ success: true });
    } catch (err) {
      console.error('[ERRO][API:copy-config] POST', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
}
