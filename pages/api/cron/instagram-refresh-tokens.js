/**
 * pages/api/cron/instagram-refresh-tokens.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/cron/instagram-refresh-tokens
 *
 * Cron diário (sugestão: 0 11 * * * UTC = 8h BRT):
 *   1. Renova tokens long-lived da Meta que estão expirando nos próximos 15 dias
 *   2. Cria notificação no sininho quando renovação falha (operador precisa reconectar)
 *   3. Cria notificação WARNING quando token expira em <= 7 dias
 *
 * Protegido por header `x-internal-token`.
 * Multi-tenancy: cada token é renovado isoladamente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const meta = require('../../../infra/api/meta');
const {
  getAccountsNeedingRefresh,
  updateAccessToken,
} = require('../../../models/instagram.model');
const { createNotification } = require('../../../models/clientForm');
const { queryOne } = require('../../../infra/db');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use POST' });
  }

  const token = req.headers['x-internal-token'];
  if (!token || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  console.log('[INFO][Cron:IGRefreshTokens] iniciando');

  const results = { total: 0, refreshed: 0, failed: 0, expiringSoon: 0 };

  try {
    const accounts = await getAccountsNeedingRefresh(15);
    results.total = accounts.length;
    console.log('[INFO][Cron:IGRefreshTokens] contas para renovar', { count: accounts.length });

    for (const acc of accounts) {
      // Calcula dias restantes pra detectar urgência
      const daysLeft = acc.tokenExpiresAt
        ? Math.floor((new Date(acc.tokenExpiresAt) - Date.now()) / 86400000)
        : null;

      // Pega nome do cliente pra mensagens
      const client = await queryOne(
        `SELECT company_name FROM marketing_clients WHERE id = $1`,
        [acc.clientId]
      ).catch(() => null);
      const clientName = client?.company_name || 'cliente';

      try {
        const refreshed = await meta.refreshToken(acc.accessToken);
        const newExpiresAt = new Date(Date.now() + (refreshed.expiresIn || 60 * 24 * 3600) * 1000);
        await updateAccessToken(acc.id, refreshed.accessToken, newExpiresAt);
        results.refreshed++;
        console.log('[SUCESSO][Cron:IGRefreshTokens] token renovado', {
          accountId: acc.id,
          username: acc.username,
        });
      } catch (err) {
        results.failed++;
        console.error('[ERRO][Cron:IGRefreshTokens] falha ao renovar', {
          accountId: acc.id,
          username: acc.username,
          error: err.message,
        });

        // Notificação ERROR — operador precisa intervir
        try {
          await createNotification(
            acc.tenantId,
            'instagram_token_refresh_failed',
            'Falha ao renovar token Instagram',
            `Token de @${acc.username || acc.igUserId} (${clientName}) não pôde ser renovado. ` +
            `Reconecte a conta para continuar publicando. Erro: ${err.message.slice(0, 150)}`,
            acc.clientId,
            { igUserId: acc.igUserId, error: err.message, daysLeft }
          );
        } catch {}
      }

      // Avisa se ainda está expirando em <= 7 dias (mesmo após tentativa de refresh)
      if (daysLeft !== null && daysLeft <= 7) {
        results.expiringSoon++;
        try {
          await createNotification(
            acc.tenantId,
            'instagram_token_expiring',
            'Token Instagram expirando em breve',
            `Token de @${acc.username || acc.igUserId} (${clientName}) expira em ${daysLeft} dia(s). ` +
            `Reconecte a conta antes que expire para evitar interrupção das publicações.`,
            acc.clientId,
            { igUserId: acc.igUserId, daysLeft }
          );
        } catch {}
      }
    }

    console.log('[SUCESSO][Cron:IGRefreshTokens] ciclo concluído', results);
    return res.json({ success: true, ...results });
  } catch (err) {
    console.error('[ERRO][Cron:IGRefreshTokens] erro geral', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
