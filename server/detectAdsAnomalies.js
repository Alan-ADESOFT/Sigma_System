/**
 * server/detectAdsAnomalies.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cron diário (manhã): detecta anomalias em campanhas de todas as contas
 * de Ads ativas. Cada anomalia nova dispara notificação no sininho.
 *
 * Só executa se settings.ads_anomaly_detection === 'true'.
 *
 * Uso: `node server/detectAdsAnomalies.js` (Railway cron 0 9 * * *).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const adsAnomalies = require('../models/ads/adsAnomalies');
const { getSetting } = require('../models/settings.model');

async function runDetectionCycle() {
  console.log('[INFO][server/detectAdsAnomalies] iniciando');

  const workspaceId = process.env.WORKSPACE_TENANT_ID;
  if (workspaceId) {
    const enabled = await getSetting(workspaceId, 'ads_anomaly_detection');
    if (enabled === 'false') {
      console.log('[INFO][server/detectAdsAnomalies] desabilitado via ads_anomaly_detection=false');
      return { skipped: true };
    }
  }

  try {
    const summary = await adsAnomalies.detectForAllClients();
    console.log('[SUCESSO][server/detectAdsAnomalies] ciclo concluído', summary);
    return summary;
  } catch (err) {
    console.error('[ERRO][server/detectAdsAnomalies] erro geral', { error: err.message, stack: err.stack });
    throw err;
  }
}

module.exports = { runDetectionCycle };

if (require.main === module) {
  runDetectionCycle()
    .then((s) => { console.log('OK', s); process.exit(0); })
    .catch((e) => { console.error('FAIL', e); process.exit(1); });
}
