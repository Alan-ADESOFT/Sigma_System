/**
 * pages/api/ads/anomalies.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route GET   /api/ads/anomalies?clientId=X&status=open
 * @route PATCH /api/ads/anomalies  body: { anomalyId, action: 'ack'|'resolve' }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const adsAnomalies = require('../../../models/ads/adsAnomalies');

const VALID_ACTIONS = ['ack', 'resolve'];

export default async function handler(req, res) {
  console.log('[INFO][API:/api/ads/anomalies]', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);

    if (req.method === 'GET') {
      const { clientId, status, severity, limit } = req.query;
      const list = await adsAnomalies.getAllForTenant(tenantId, {
        clientId,
        status,
        severity,
        limit: limit ? parseInt(limit, 10) : 50,
      });
      return res.json({ success: true, anomalies: list });
    }

    if (req.method === 'PATCH') {
      const { anomalyId, action } = req.body || {};
      if (!anomalyId || !action) return res.status(400).json({ success: false, error: 'anomalyId e action obrigatórios' });
      if (!VALID_ACTIONS.includes(action)) return res.status(400).json({ success: false, error: `action inválida (${VALID_ACTIONS.join('|')})` });

      let updated;
      if (action === 'ack') updated = await adsAnomalies.acknowledge(tenantId, anomalyId);
      if (action === 'resolve') updated = await adsAnomalies.resolve(tenantId, anomalyId);
      if (!updated) return res.status(404).json({ success: false, error: 'Anomalia não encontrada' });

      console.log('[SUCESSO][API:/api/ads/anomalies] PATCH', { anomalyId, action });
      return res.json({ success: true, anomaly: updated });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/ads/anomalies]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
