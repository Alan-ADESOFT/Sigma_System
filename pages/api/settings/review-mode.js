/**
 * @fileoverview Endpoint: Modo Revisão de Agentes
 * @route GET  /api/settings/review-mode → { enabled: boolean }
 * @route POST /api/settings/review-mode → body { enabled: boolean }
 *
 * Usa a tabela settings existente com key = 'review_mode_enabled'
 */

import { resolveTenantId }  from '../../../infra/get-tenant-id';
import { queryOne }         from '../../../infra/db';

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    if (req.method === 'GET') {
      const row = await queryOne(
        `SELECT value FROM settings WHERE tenant_id = $1 AND key = 'review_mode_enabled'`,
        [tenantId]
      );
      return res.json({ success: true, enabled: row?.value === 'true' });
    }

    if (req.method === 'POST') {
      const { enabled } = req.body;
      const value = enabled ? 'true' : 'false';

      await queryOne(
        `INSERT INTO settings (tenant_id, key, value)
         VALUES ($1, 'review_mode_enabled', $2)
         ON CONFLICT (tenant_id, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = now()
         RETURNING id`,
        [tenantId, value]
      );

      console.log('[INFO][API:review-mode] Modo revisão atualizado', { tenantId, enabled });
      return res.json({ success: true, enabled: !!enabled });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:review-mode]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
