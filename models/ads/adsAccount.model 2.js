/**
 * models/ads/adsAccount.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD da tabela client_ads_accounts — uma conta Meta Ads conectada por cliente.
 *
 * Multi-tenancy: TODA query filtra por tenant_id.
 *
 * IMPORTANTE: o token NUNCA aparece em respostas pro frontend.
 *   - mapAccount(row)          → versão pública, SEM accessToken
 *   - mapAccountWithToken(row) → versão interna (apenas backend)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');

/* ─── Mappers ───────────────────────────────────────────────────────────── */

function mapAccountWithToken(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    adsAccountId: row.ads_account_id,
    businessId: row.business_id,
    pageId: row.page_id,
    instagramActorId: row.instagram_actor_id,
    accessToken: row.access_token,
    tokenType: row.token_type,
    tokenExpiresAt: row.token_expires_at,
    accountName: row.account_name,
    currency: row.currency,
    timezoneName: row.timezone_name,
    accountStatus: row.account_status,
    amountSpent: row.amount_spent != null ? Number(row.amount_spent) : null,
    balance: row.balance != null ? Number(row.balance) : null,
    lastHealthCheckAt: row.last_health_check_at,
    healthStatus: row.health_status,
    healthError: row.health_error,
    connectedAt: row.connected_at,
    lastRefreshedAt: row.last_refreshed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAccount(row) {
  const full = mapAccountWithToken(row);
  if (!full) return null;
  // eslint-disable-next-line no-unused-vars
  const { accessToken, ...safe } = full;
  return safe;
}

/* ─── Leitura ───────────────────────────────────────────────────────────── */

async function getByClient(tenantId, clientId) {
  const row = await queryOne(
    `SELECT * FROM client_ads_accounts
     WHERE tenant_id = $1 AND client_id = $2`,
    [tenantId, clientId]
  );
  return row;
}

async function getById(tenantId, id) {
  return queryOne(
    `SELECT * FROM client_ads_accounts
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
}

async function listByTenant(tenantId) {
  const rows = await query(
    `SELECT a.*, c.company_name
       FROM client_ads_accounts a
       JOIN marketing_clients c ON c.id = a.client_id
      WHERE a.tenant_id = $1
      ORDER BY c.company_name ASC`,
    [tenantId]
  );
  return rows.map((r) => ({ ...mapAccount(r), companyName: r.company_name }));
}

/**
 * Lista contas com token expirando nos próximos N dias.
 * SEM filtro de tenant — uso exclusivo de cron.
 */
async function getAccountsNeedingRefresh(daysAhead = 15) {
  return query(
    `SELECT * FROM client_ads_accounts
      WHERE token_expires_at IS NOT NULL
        AND token_type IN ('oauth')
        AND token_expires_at < now() + make_interval(days => $1)
      ORDER BY token_expires_at ASC`,
    [daysAhead]
  );
}

/**
 * Lista contas que precisam de health-check periódico.
 * SEM filtro de tenant — uso exclusivo de cron.
 */
async function getAccountsForHealthCheck() {
  return query(
    `SELECT * FROM client_ads_accounts
      WHERE last_health_check_at IS NULL
         OR last_health_check_at < now() - interval '24 hours'
      ORDER BY last_health_check_at ASC NULLS FIRST
      LIMIT 200`
  );
}

/* ─── Escrita ───────────────────────────────────────────────────────────── */

/**
 * Upsert vindo do callback OAuth.
 * @param {string} tenantId
 * @param {string} clientId
 * @param {Object} data
 */
async function upsertFromOAuth(tenantId, clientId, data) {
  const row = await queryOne(
    `INSERT INTO client_ads_accounts (
       tenant_id, client_id, ads_account_id, business_id, page_id, instagram_actor_id,
       access_token, token_type, token_expires_at,
       account_name, currency, timezone_name, account_status, amount_spent, balance,
       health_status, last_health_check_at,
       connected_at, last_refreshed_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9,
       $10, $11, $12, $13, $14, $15,
       'healthy', now(),
       now(), now()
     )
     ON CONFLICT (client_id) DO UPDATE SET
       ads_account_id     = EXCLUDED.ads_account_id,
       business_id        = COALESCE(EXCLUDED.business_id, client_ads_accounts.business_id),
       page_id            = COALESCE(EXCLUDED.page_id, client_ads_accounts.page_id),
       instagram_actor_id = COALESCE(EXCLUDED.instagram_actor_id, client_ads_accounts.instagram_actor_id),
       access_token       = EXCLUDED.access_token,
       token_type         = EXCLUDED.token_type,
       token_expires_at   = EXCLUDED.token_expires_at,
       account_name       = COALESCE(EXCLUDED.account_name, client_ads_accounts.account_name),
       currency           = COALESCE(EXCLUDED.currency, client_ads_accounts.currency),
       timezone_name      = COALESCE(EXCLUDED.timezone_name, client_ads_accounts.timezone_name),
       account_status     = COALESCE(EXCLUDED.account_status, client_ads_accounts.account_status),
       amount_spent       = COALESCE(EXCLUDED.amount_spent, client_ads_accounts.amount_spent),
       balance            = COALESCE(EXCLUDED.balance, client_ads_accounts.balance),
       health_status      = 'healthy',
       health_error       = NULL,
       last_health_check_at = now(),
       last_refreshed_at  = now(),
       updated_at         = now()
     RETURNING *`,
    [
      tenantId, clientId,
      data.adsAccountId,
      data.businessId || null,
      data.pageId || null,
      data.instagramActorId || null,
      data.accessToken,
      data.tokenType || 'oauth',
      data.tokenExpiresAt || null,
      data.accountName || null,
      data.currency || 'BRL',
      data.timezoneName || null,
      data.accountStatus || null,
      data.amountSpent != null ? Number(data.amountSpent) : null,
      data.balance != null ? Number(data.balance) : null,
    ]
  );
  return mapAccountWithToken(row);
}

/**
 * Insert/update manual (fallback) — operador cola um token system-user
 * + o ad_account_id.
 */
async function saveManual(tenantId, clientId, data) {
  return upsertFromOAuth(tenantId, clientId, {
    ...data,
    tokenType: data.tokenType || 'manual',
  });
}

async function updateToken(id, tenantId, accessToken, expiresAt) {
  const row = await queryOne(
    `UPDATE client_ads_accounts
        SET access_token      = $1,
            token_expires_at  = $2,
            health_status     = 'healthy',
            health_error      = NULL,
            last_refreshed_at = now(),
            updated_at        = now()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
    [accessToken, expiresAt, id, tenantId]
  );
  return mapAccountWithToken(row);
}

async function updateHealth(id, status, error = null) {
  const row = await queryOne(
    `UPDATE client_ads_accounts
        SET health_status        = $1,
            health_error         = $2,
            last_health_check_at = now(),
            updated_at           = now()
      WHERE id = $3
      RETURNING *`,
    [status, error, id]
  );
  return mapAccount(row);
}

async function updateMeta(id, tenantId, fields) {
  const allowed = ['page_id', 'instagram_actor_id', 'business_id', 'account_name'];
  const sets = [];
  const params = [];
  let idx = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${idx++}`);
      params.push(fields[key]);
    }
  }
  if (sets.length === 0) {
    return getById(tenantId, id);
  }
  sets.push(`updated_at = now()`);
  params.push(id, tenantId);
  const row = await queryOne(
    `UPDATE client_ads_accounts SET ${sets.join(', ')}
      WHERE id = $${idx++} AND tenant_id = $${idx++}
      RETURNING *`,
    params
  );
  return mapAccount(row);
}

async function remove(id, tenantId) {
  const result = await query(
    `DELETE FROM client_ads_accounts
      WHERE id = $1 AND tenant_id = $2
      RETURNING id`,
    [id, tenantId]
  );
  return result.length > 0;
}

/* ─── Exports ───────────────────────────────────────────────────────────── */

module.exports = {
  // Read
  getByClient,
  getById,
  listByTenant,
  getAccountsNeedingRefresh,
  getAccountsForHealthCheck,
  // Write
  upsertFromOAuth,
  saveManual,
  updateToken,
  updateHealth,
  updateMeta,
  remove,
  // Mappers
  mapAccount,
  mapAccountWithToken,
};
