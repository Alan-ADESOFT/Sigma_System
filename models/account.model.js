const { query, queryOne } = require('../infra/db');

async function getAccounts(tenantId) {
  const rows = await query(
    `SELECT * FROM accounts WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows.map(mapAccount);
}

async function getAccountById(tenantId, id) {
  const row = await queryOne(
    `SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return row ? mapAccount(row) : null;
}

async function getAccountByProviderId(tenantId, providerAccountId) {
  const row = await queryOne(
    `SELECT * FROM accounts WHERE provider_account_id = $1 AND tenant_id = $2`,
    [providerAccountId, tenantId]
  );
  return row ? mapAccount(row) : null;
}

async function saveAccount(tenantId, account) {
  try {
    const handle = account.handle.replace('@', '').toLowerCase();
    await query(
      `INSERT INTO accounts (id, tenant_id, provider_account_id, username, name, type, provider, password, picture, access_token, ads_token, ads_account_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (tenant_id, provider_account_id) DO UPDATE SET
         username = COALESCE(NULLIF($4, ''), accounts.username),
         name = COALESCE(NULLIF($5, ''), accounts.name),
         password = COALESCE($8, accounts.password),
         picture = COALESCE($9, accounts.picture),
         access_token = COALESCE($10, accounts.access_token),
         ads_token = COALESCE($11, accounts.ads_token),
         ads_account_id = COALESCE($12, accounts.ads_account_id),
         notes = $13`,
      [
        account.id || undefined,
        tenantId,
        handle,
        account.name || handle,
        account.name || handle,
        'instagram',
        'instagram_business',
        account.password || null,
        account.avatarUrl || null,
        account.oauthToken || null,
        account.adsToken || null,
        account.adsAccountId || null,
        account.notes ?? null,
      ]
    );
    return { success: true };
  } catch (e) {
    console.error('Erro ao salvar conta:', e);
    return { success: false, error: e.message };
  }
}

async function upsertAccountFromOAuth(tenantId, providerAccountId, data) {
  try {
    await query(
      `INSERT INTO accounts (tenant_id, provider_account_id, access_token, expires_at, username, name, biography, followers_count, follows_count, media_count, website, picture, type, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'instagram', 'instagram_business')
       ON CONFLICT (tenant_id, provider_account_id) DO UPDATE SET
         access_token = $3, expires_at = $4, username = $5, name = $6,
         biography = $7, followers_count = $8, follows_count = $9,
         media_count = $10, website = $11, picture = $12`,
      [
        tenantId, providerAccountId, data.access_token, data.expires_at,
        data.username, data.name, data.biography, data.followers_count,
        data.follows_count, data.media_count, data.website, data.picture,
      ]
    );
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function deleteAccount(tenantId, id) {
  try {
    await query(`DELETE FROM accounts WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function findAccountByToken(token) {
  return queryOne(`SELECT * FROM accounts WHERE access_token = $1`, [token]);
}

async function updateAccountToken(id, newToken, expiresAt) {
  await query(
    `UPDATE accounts SET access_token = $1, expires_at = $2 WHERE id = $3`,
    [newToken, expiresAt, id]
  );
}

function mapAccount(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.username || row.provider_account_id,
    handle: `@${row.provider_account_id}`,
    avatarUrl: row.picture,
    notes: row.notes,
    password: row.password,
    oauthToken: row.access_token,
    adsToken: row.ads_token,
    adsAccountId: row.ads_account_id,
    expiresAt: row.expires_at,
    biography: row.biography,
    followersCount: row.followers_count,
    followsCount: row.follows_count,
    mediaCount: row.media_count,
    website: row.website,
    createdAt: row.created_at,
  };
}

module.exports = {
  getAccounts, getAccountById, getAccountByProviderId,
  saveAccount, upsertAccountFromOAuth, deleteAccount,
  findAccountByToken, updateAccountToken,
};
