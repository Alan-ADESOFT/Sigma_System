/**
 * @fileoverview GET/POST /api/settings/jarvis-config
 *
 * GET  → retorna config completa do Jarvis para o tenant.
 * POST → salva uma chave: { key: 'jarvis_*', value: 'string' }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { getJarvisConfig, saveJarvisSetting, JARVIS_FUNCTIONS } from '../../../models/jarvis/config';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/settings/jarvis-config] Requisição', { method: req.method });

  const tenantId = await resolveTenantId(req);

  if (req.method === 'GET') {
    try {
      const cfg = await getJarvisConfig(tenantId);
      return res.json({
        success: true,
        config: cfg,
        functions_catalog: JARVIS_FUNCTIONS,
      });
    } catch (err) {
      console.error('[ERRO][API:/api/settings/jarvis-config] GET', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ success: false, error: 'key obrigatório' });

      // Sanitização: ocultar a key da ElevenLabs em logs
      const safeValue = key === 'jarvis_elevenlabs_key' ? '***' : value;
      console.log('[INFO][API:/api/settings/jarvis-config] Salvando', { key, value: safeValue });

      await saveJarvisSetting(tenantId, key, value);
      return res.json({ success: true });
    } catch (err) {
      console.error('[ERRO][API:/api/settings/jarvis-config] POST', { error: err.message });
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Método não permitido' });
}
