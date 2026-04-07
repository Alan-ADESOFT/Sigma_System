/**
 * models/instagram.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD da tabela instagram_accounts — uma conta Instagram conectada por cliente.
 *
 * Multi-tenancy: TODA query filtra por tenant_id (e por client_id quando aplicável).
 * O token de acesso é armazenado em texto (long-lived, ~60 dias).
 *
 * Cada cliente em marketing_clients pode ter no máximo 1 conta Instagram
 * (constraint UNIQUE(client_id) na migration).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');

/* ─────────────────────────────────────────────────────────────────────────────
   Mapper — converte row para o formato camelCase do frontend
───────────────────────────────────────────────────────────────────────────── */
function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    igUserId: row.ig_user_id,
    username: row.username,
    accessToken: row.access_token,
    tokenExpiresAt: row.token_expires_at,
    profilePictureUrl: row.profile_picture_url,
    followersCount: row.followers_count || 0,
    followsCount: row.follows_count || 0,
    mediaCount: row.media_count || 0,
    biography: row.biography,
    accountType: row.account_type,
    connectedAt: row.connected_at,
    lastRefreshedAt: row.last_refreshed_at,
    updatedAt: row.updated_at,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Leitura
───────────────────────────────────────────────────────────────────────────── */

/**
 * Busca a conta Instagram de um cliente (escopo por tenant).
 */
async function getInstagramAccount(tenantId, clientId) {
  const row = await queryOne(
    `SELECT * FROM instagram_accounts
     WHERE tenant_id = $1 AND client_id = $2`,
    [tenantId, clientId]
  );
  return mapAccount(row);
}

/**
 * Busca uma conta pelo id interno (sempre escopo de tenant).
 */
async function getInstagramAccountById(tenantId, id) {
  const row = await queryOne(
    `SELECT * FROM instagram_accounts
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return mapAccount(row);
}

/**
 * Lista contas com token expirando nos próximos N dias.
 * Usado pelo cron de refresh de token.
 */
async function getAccountsNeedingRefresh(daysAhead = 15) {
  const rows = await query(
    `SELECT * FROM instagram_accounts
     WHERE token_expires_at IS NOT NULL
       AND token_expires_at < now() + make_interval(days => $1)
     ORDER BY token_expires_at ASC`,
    [daysAhead]
  );
  return rows.map(mapAccount);
}

/* ─────────────────────────────────────────────────────────────────────────────
   Escrita
───────────────────────────────────────────────────────────────────────────── */

/**
 * Upsert de conta Instagram a partir do callback do OAuth.
 *
 * @param {string} tenantId
 * @param {string} clientId
 * @param {Object} data - dados normalizados do perfil + token
 * @param {string} data.igUserId
 * @param {string} data.accessToken
 * @param {Date|string} data.tokenExpiresAt
 * @param {string} [data.username]
 * @param {string} [data.profilePictureUrl]
 * @param {number} [data.followersCount]
 * @param {number} [data.followsCount]
 * @param {number} [data.mediaCount]
 * @param {string} [data.biography]
 * @param {string} [data.accountType]
 */
async function saveInstagramAccount(tenantId, clientId, data) {
  const row = await queryOne(
    `INSERT INTO instagram_accounts (
       tenant_id, client_id, ig_user_id, username, access_token,
       token_expires_at, profile_picture_url, followers_count,
       follows_count, media_count, biography, account_type,
       connected_at, last_refreshed_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now(), now()
     )
     ON CONFLICT (client_id) DO UPDATE SET
       ig_user_id          = EXCLUDED.ig_user_id,
       username            = EXCLUDED.username,
       access_token        = EXCLUDED.access_token,
       token_expires_at    = EXCLUDED.token_expires_at,
       profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, instagram_accounts.profile_picture_url),
       followers_count     = EXCLUDED.followers_count,
       follows_count       = EXCLUDED.follows_count,
       media_count         = EXCLUDED.media_count,
       biography           = COALESCE(EXCLUDED.biography, instagram_accounts.biography),
       account_type        = COALESCE(EXCLUDED.account_type, instagram_accounts.account_type),
       last_refreshed_at   = now(),
       updated_at          = now()
     RETURNING *`,
    [
      tenantId,
      clientId,
      data.igUserId,
      data.username || null,
      data.accessToken,
      data.tokenExpiresAt || null,
      data.profilePictureUrl || null,
      data.followersCount || 0,
      data.followsCount || 0,
      data.mediaCount || 0,
      data.biography || null,
      data.accountType || 'BUSINESS',
    ]
  );
  return mapAccount(row);
}

/**
 * Atualiza apenas o access_token e o token_expires_at de uma conta.
 * Usado após refresh de token.
 */
async function updateAccessToken(id, newToken, expiresAt) {
  const row = await queryOne(
    `UPDATE instagram_accounts
        SET access_token      = $1,
            token_expires_at  = $2,
            last_refreshed_at = now(),
            updated_at        = now()
      WHERE id = $3
      RETURNING *`,
    [newToken, expiresAt, id]
  );
  return mapAccount(row);
}

/**
 * Atualiza métricas básicas (chamado quando recarrega insights — não obrigatório).
 */
async function updateProfileMetrics(id, metrics) {
  const row = await queryOne(
    `UPDATE instagram_accounts
        SET followers_count = $1,
            follows_count   = $2,
            media_count     = $3,
            updated_at      = now()
      WHERE id = $4
      RETURNING *`,
    [
      metrics.followersCount || 0,
      metrics.followsCount || 0,
      metrics.mediaCount || 0,
      id,
    ]
  );
  return mapAccount(row);
}

/**
 * Remove a conta Instagram de um cliente (desconecta).
 */
async function removeInstagramAccount(tenantId, clientId) {
  const result = await query(
    `DELETE FROM instagram_accounts
     WHERE tenant_id = $1 AND client_id = $2
     RETURNING id`,
    [tenantId, clientId]
  );
  return result.length > 0;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Exports
───────────────────────────────────────────────────────────────────────────── */

module.exports = {
  getInstagramAccount,
  getInstagramAccountById,
  getAccountsNeedingRefresh,
  saveInstagramAccount,
  updateAccessToken,
  updateProfileMetrics,
  removeInstagramAccount,
};
