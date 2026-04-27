/**
 * models/ads/adsPublicReport.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD da tabela ads_public_report_tokens — tokens públicos para
 * compartilhar relatório de Ads com o cliente final.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const { query, queryOne } = require('../../infra/db');

const ALLOWED_EXPIRY_DAYS = [null, 30, 90, 180];

const DEFAULT_CONFIG = {
  showCampaignList: true,
  showChart: true,
  defaultDateRange: 'last_30d',
  allowExport: true,
};

function mapToken(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    token: row.token,
    status: row.status,
    expiresAt: row.expires_at,
    config: row.config || DEFAULT_CONFIG,
    viewsCount: row.views_count || 0,
    lastViewedAt: row.last_viewed_at,
    lastViewedIp: row.last_viewed_ip,
    createdBy: row.created_by,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ─── Geração ───────────────────────────────────────────────────────────── */

async function generateToken(tenantId, clientId, opts = {}) {
  const { expiresInDays = null, config, createdBy } = opts;

  if (!ALLOWED_EXPIRY_DAYS.includes(expiresInDays === null ? null : Number(expiresInDays))) {
    throw new Error(`expiresInDays deve ser um de [${ALLOWED_EXPIRY_DAYS.join(', ')}]`);
  }

  const token = crypto.randomBytes(24).toString('hex');
  const finalConfig = { ...DEFAULT_CONFIG, ...(config || {}) };

  let expiresAt = null;
  if (expiresInDays != null) {
    expiresAt = new Date(Date.now() + Number(expiresInDays) * 86400000);
  }

  const row = await queryOne(
    `INSERT INTO ads_public_report_tokens (
       tenant_id, client_id, token, status, expires_at, config, created_by
     ) VALUES ($1, $2, $3, 'active', $4, $5, $6)
     RETURNING *`,
    [tenantId, clientId, token, expiresAt, JSON.stringify(finalConfig), createdBy || null]
  );
  return mapToken(row);
}

/* ─── Leitura ───────────────────────────────────────────────────────────── */

/**
 * Busca um token pelo valor raw, JOIN com cliente para retorno público mínimo.
 * Retorna { tokenRow, client } ou null.
 */
async function getByToken(tokenValue) {
  return queryOne(
    `SELECT t.*, c.id AS client_id_join, c.company_name, c.logo_url, c.tenant_id AS client_tenant_id
       FROM ads_public_report_tokens t
       JOIN marketing_clients c ON c.id = t.client_id
      WHERE t.token = $1`,
    [tokenValue]
  );
}

/**
 * Valida um token: existência, status, expiração.
 * Retorna { valid, reason, tokenData }.
 */
async function validateToken(tokenValue) {
  if (!tokenValue || typeof tokenValue !== 'string' || tokenValue.length < 16) {
    return { valid: false, reason: 'invalid_format', tokenData: null };
  }
  const row = await getByToken(tokenValue);
  if (!row) return { valid: false, reason: 'not_found', tokenData: null };
  if (row.status === 'revoked') return { valid: false, reason: 'revoked', tokenData: row };
  if (row.expires_at && new Date(row.expires_at) <= new Date()) {
    return { valid: false, reason: 'expired', tokenData: row };
  }
  if (row.status !== 'active') return { valid: false, reason: row.status, tokenData: row };
  return { valid: true, reason: 'valid', tokenData: row };
}

async function listByClient(tenantId, clientId) {
  const rows = await query(
    `SELECT t.*, c.company_name, c.logo_url
       FROM ads_public_report_tokens t
       JOIN marketing_clients c ON c.id = t.client_id
      WHERE t.tenant_id = $1 AND t.client_id = $2
      ORDER BY t.created_at DESC`,
    [tenantId, clientId]
  );
  return rows.map((r) => ({
    ...mapToken(r),
    companyName: r.company_name,
    logoUrl: r.logo_url,
  }));
}

/**
 * Lista todos os tokens do tenant, com dados básicos do cliente para a UI.
 * Usado pela página de gestão de Relatórios Públicos.
 */
async function listAll(tenantId) {
  const rows = await query(
    `SELECT t.*, c.company_name, c.logo_url
       FROM ads_public_report_tokens t
       JOIN marketing_clients c ON c.id = t.client_id
      WHERE t.tenant_id = $1
      ORDER BY t.created_at DESC`,
    [tenantId]
  );
  return rows.map((r) => ({
    ...mapToken(r),
    companyName: r.company_name,
    logoUrl: r.logo_url,
  }));
}

/* ─── Escrita ───────────────────────────────────────────────────────────── */

async function revoke(tenantId, tokenId, reason = null) {
  return queryOne(
    `UPDATE ads_public_report_tokens
        SET status         = 'revoked',
            revoked_at     = now(),
            revoked_reason = $1,
            updated_at     = now()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *`,
    [reason, tokenId, tenantId]
  );
}

async function incrementView(tokenId, ip) {
  return query(
    `UPDATE ads_public_report_tokens
        SET views_count    = views_count + 1,
            last_viewed_at = now(),
            last_viewed_ip = $1,
            updated_at     = now()
      WHERE id = $2`,
    [ip || null, tokenId]
  );
}

module.exports = {
  generateToken,
  getByToken,
  validateToken,
  listByClient,
  listAll,
  revoke,
  incrementView,
  mapToken,
  ALLOWED_EXPIRY_DAYS,
  DEFAULT_CONFIG,
};
