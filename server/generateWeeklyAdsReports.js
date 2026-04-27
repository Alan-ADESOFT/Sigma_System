/**
 * server/generateWeeklyAdsReports.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cron semanal (segunda de manhã): gera relatório executivo de Ads
 * para cada cliente com conta ativa.
 *
 * Só executa se settings.ads_ai_weekly_enabled === 'true'.
 *
 * Uso: `node server/generateWeeklyAdsReports.js` (Railway cron 0 8 * * 1).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query } = require('../infra/db');
const { getSetting } = require('../models/settings.model');
const adsInsightsAI = require('../models/ads/adsInsightsAI');
const { createNotification } = require('../models/clientForm');

async function runWeeklyCycle() {
  console.log('[INFO][server/generateWeeklyAdsReports] iniciando');

  const workspaceId = process.env.WORKSPACE_TENANT_ID;
  if (workspaceId) {
    const enabled = await getSetting(workspaceId, 'ads_ai_weekly_enabled');
    if (enabled !== 'true') {
      console.log('[INFO][server/generateWeeklyAdsReports] desabilitado (ads_ai_weekly_enabled != true)');
      return { skipped: true };
    }
  }

  const summary = { total: 0, generated: 0, errors: 0 };
  const tenantsWithReports = new Set();

  try {
    const accounts = await query(
      `SELECT tenant_id, client_id FROM client_ads_accounts
        WHERE health_status IN ('healthy', 'expiring_soon')`
    );
    summary.total = accounts.length;

    for (const a of accounts) {
      try {
        const report = await adsInsightsAI.generateWeeklyReport(a.tenant_id, a.client_id);
        summary.generated++;
        tenantsWithReports.add(a.tenant_id);
        console.log('[SUCESSO][server/generateWeeklyAdsReports] relatório gerado', {
          clientId: a.client_id,
          reportId: report.id,
        });
      } catch (e) {
        summary.errors++;
        console.error('[ERRO][server/generateWeeklyAdsReports] cliente', {
          clientId: a.client_id,
          error: e.message,
        });
      }
    }

    // Notifica cada tenant
    for (const tenantId of tenantsWithReports) {
      try {
        await createNotification(
          tenantId,
          'ads_weekly_reports_ready',
          'Relatórios semanais de Ads prontos',
          'Os relatórios automáticos de Ads desta semana foram gerados. Confira na aba Ads de cada cliente.',
          null
        );
      } catch {}
    }

    console.log('[SUCESSO][server/generateWeeklyAdsReports] ciclo concluído', summary);
    return summary;
  } catch (err) {
    console.error('[ERRO][server/generateWeeklyAdsReports] erro geral', { error: err.message, stack: err.stack });
    throw err;
  }
}

module.exports = { runWeeklyCycle };

if (require.main === module) {
  runWeeklyCycle()
    .then((s) => { console.log('OK', s); process.exit(0); })
    .catch((e) => { console.error('FAIL', e); process.exit(1); });
}
