/**
 * server/refreshAdsTokens.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cron diário: renova tokens long-lived da Meta Ads que estão expirando.
 *
 * Fluxo:
 *   1. Lista contas com token_expires_at < now() + ads_token_refresh_days_ahead
 *      (default 15d) e token_type = 'oauth' (system_user / manual NÃO renovam)
 *   2. Para cada uma, chama metaAds.getLongLivedToken(token)
 *   3. Atualiza access_token + token_expires_at
 *   4. Em caso de falha, marca health_status = 'invalid' e cria notificação
 *
 * Uso: `node server/refreshAdsTokens.js` (Railway cron 0 4 * * *).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const metaAds = require('../infra/api/metaAds');
const adsAccount = require('../models/ads/adsAccount.model');
const { createNotification } = require('../models/clientForm');
const { queryOne } = require('../infra/db');
const { getSetting } = require('../models/settings.model');

async function runRefreshCycle() {
  console.log('[INFO][server/refreshAdsTokens] iniciando ciclo');

  const summary = { total: 0, refreshed: 0, failed: 0, skipped: 0 };

  try {
    // Lê threshold global (não por tenant — usamos fallback)
    const adminTenantId = process.env.ADMIN_TENANT_ID;
    const daysAhead = parseInt(
      adminTenantId ? await getSetting(adminTenantId, 'ads_token_refresh_days_ahead') : null,
      10,
    ) || 15;

    const accounts = await adsAccount.getAccountsNeedingRefresh(daysAhead);
    summary.total = accounts.length;
    console.log('[INFO][server/refreshAdsTokens] contas para renovar', { count: accounts.length, daysAhead });

    for (const acc of accounts) {
      // Pula tokens não-OAuth (manual + system_user não renovam)
      if (acc.token_type !== 'oauth') {
        summary.skipped++;
        continue;
      }

      const client = await queryOne(
        `SELECT company_name FROM marketing_clients WHERE id = $1`,
        [acc.client_id]
      ).catch(() => null);
      const clientName = client?.company_name || 'cliente';

      try {
        const refreshed = await metaAds.getLongLivedToken(acc.access_token);
        const newExpiresAt = new Date(Date.now() + (refreshed.expiresIn || 60 * 24 * 3600) * 1000);
        await adsAccount.updateToken(acc.id, acc.tenant_id, refreshed.accessToken, newExpiresAt);
        summary.refreshed++;
        console.log('[SUCESSO][server/refreshAdsTokens] token renovado', {
          id: acc.id,
          clientName,
        });
      } catch (err) {
        summary.failed++;
        console.error('[ERRO][server/refreshAdsTokens] falha ao renovar', {
          id: acc.id,
          clientName,
          error: err.message,
        });
        await adsAccount.updateHealth(acc.id, 'invalid', err.message.slice(0, 300)).catch(() => {});
        try {
          await createNotification(
            acc.tenant_id,
            'ads_token_refresh_failed',
            'Falha ao renovar token de Ads',
            `Token de Ads de ${clientName} não pôde ser renovado. Reconecte a conta. Erro: ${err.message.slice(0, 150)}`,
            acc.client_id,
            { error: err.message }
          );
        } catch {}
      }
    }

    console.log('[SUCESSO][server/refreshAdsTokens] ciclo concluído', summary);
    return summary;
  } catch (err) {
    console.error('[ERRO][server/refreshAdsTokens] erro geral', { error: err.message, stack: err.stack });
    throw err;
  }
}

module.exports = { runRefreshCycle };

// Permite execução standalone via Railway cron
if (require.main === module) {
  runRefreshCycle()
    .then((s) => { console.log('OK', s); process.exit(0); })
    .catch((e) => { console.error('FAIL', e); process.exit(1); });
}
