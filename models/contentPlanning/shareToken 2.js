/**
 * models/contentPlanning/shareToken.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tokens públicos de aprovação de planejamentos. Cada token é único,
 * possivelmente protegido por PIN de 4 dígitos (scrypt + timing-safe compare),
 * tem validade explícita e contagem de aberturas.
 *
 * Tabela: content_plan_share_tokens
 *
 * Regra: ao gerar um novo token para um plano, os tokens 'active' anteriores
 * desse plano são revogados (status='revoked'). Garante 1 link válido por vez.
 *
 * O endpoint público que consome esses tokens NÃO filtra por tenant_id —
 * por isso `getTokenByValue` e `validateToken` recebem só o token bruto.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const { query, queryOne } = require('../../infra/db');
const activity = require('./activity');

// ─── Hash do PIN ─────────────────────────────────────────────────────────────

/**
 * Gera hash scrypt do PIN. Formato: "salt:hash" (mesmo padrão de lib/auth.js).
 * @param {string} pin
 * @returns {string}
 */
function hashPin(pin) {
  if (!pin) return null;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifica PIN com timing-safe compare.
 * @param {string} pin
 * @param {string} stored - "salt:hash"
 * @returns {boolean}
 */
function verifyPin(pin, stored) {
  if (!stored || !stored.includes(':') || pin == null) return false;
  const colonIdx = stored.indexOf(':');
  const salt = stored.substring(0, colonIdx);
  const hash = stored.substring(colonIdx + 1);
  try {
    const check = crypto.scryptSync(String(pin), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Gera string opaca para o token público.
 * @returns {string}
 */
function generateTokenString() {
  // 32 bytes de aleatoriedade em base64url — curto e suficiente
  return crypto.randomBytes(32).toString('base64url');
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

/**
 * Busca o token pelo valor (sem filtro de tenant — é endpoint público).
 * Faz JOIN com content_plans + marketing_clients para retornar dados do plano.
 */
async function getTokenByValue(token) {
  if (!token) return null;
  return queryOne(
    `SELECT
        t.*,
        p.id           AS plan_id,
        p.tenant_id    AS plan_tenant_id,
        p.client_id    AS plan_client_id,
        p.title        AS plan_title,
        p.objective    AS plan_objective,
        p.month_reference AS plan_month_reference,
        mc.company_name AS client_company_name,
        mc.logo_url     AS client_logo_url
       FROM content_plan_share_tokens t
       JOIN content_plans p   ON p.id  = t.plan_id
  LEFT JOIN marketing_clients mc ON mc.id = p.client_id
      WHERE t.token = $1
      LIMIT 1`,
    [token]
  );
}

/**
 * Lista tokens de um plano (escopo de tenant).
 */
async function listTokensByPlan(planId, tenantId) {
  return query(
    `SELECT * FROM content_plan_share_tokens
      WHERE plan_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC`,
    [planId, tenantId]
  );
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Gera novo token para o plano. Revoga tokens 'active' anteriores.
 *
 * @param {string} tenantId
 * @param {string} planId
 * @param {Object} opts
 * @param {number} opts.durationDays  - validade em dias (mín 1)
 * @param {string} [opts.pin]         - PIN de 4 dígitos (opcional)
 * @param {string} [opts.createdBy]   - tenants.id do usuário interno
 */
async function createShareToken(tenantId, planId, { durationDays, pin, createdBy } = {}) {
  console.log('[INFO][ContentPlanning:ShareToken] createShareToken', { tenantId, planId, hasPin: !!pin });

  if (!planId) throw new Error('planId é obrigatório');

  const days = Math.max(1, Math.min(365, Number(durationDays) || 7));

  try {
    const planExists = await queryOne(
      `SELECT id FROM content_plans WHERE id = $1 AND tenant_id = $2`,
      [planId, tenantId]
    );
    if (!planExists) throw new Error('plan_not_found');

    // Revoga tokens ativos anteriores
    await query(
      `UPDATE content_plan_share_tokens
          SET status = 'revoked', updated_at = now()
        WHERE plan_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [planId, tenantId]
    );

    const tokenStr = generateTokenString();
    const passwordHash = pin ? hashPin(pin) : null;

    const row = await queryOne(
      `INSERT INTO content_plan_share_tokens
         (tenant_id, plan_id, token, password_hash, status, expires_at, created_by)
       VALUES ($1, $2, $3, $4, 'active', now() + ($5 || ' days')::interval, $6)
       RETURNING *`,
      [tenantId, planId, tokenStr, passwordHash, String(days), createdBy || null]
    );

    await activity.logActivity(tenantId, planId, {
      actorType: 'internal',
      actorId: createdBy || null,
      eventType: 'link_generated',
      payload: { token_id: row.id, expires_at: row.expires_at, has_pin: !!passwordHash },
    });

    console.log('[SUCESSO][ContentPlanning:ShareToken] criado', { id: row.id, planId });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:ShareToken] createShareToken falhou', { error: err.message });
    throw err;
  }
}

/**
 * Valida um token + PIN (se aplicável).
 *
 * @returns {Promise<{ valid: boolean, reason?: string, tokenData?: Object, plan?: Object }>}
 *   reason ∈ 'not_found' | 'expired' | 'revoked' | 'password_required' | 'password_incorrect'
 */
async function validateToken(token, pin = null) {
  if (!token) return { valid: false, reason: 'not_found' };

  const data = await getTokenByValue(token);
  if (!data) return { valid: false, reason: 'not_found' };

  if (data.status === 'revoked') return { valid: false, reason: 'revoked' };

  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    return { valid: false, reason: 'expired' };
  }
  if (data.status === 'expired') return { valid: false, reason: 'expired' };

  if (data.password_hash) {
    if (!pin) return { valid: false, reason: 'password_required' };
    if (!verifyPin(pin, data.password_hash)) {
      return { valid: false, reason: 'password_incorrect' };
    }
  }

  return {
    valid: true,
    tokenData: data,
    plan: {
      id: data.plan_id,
      tenant_id: data.plan_tenant_id,
      client_id: data.plan_client_id,
      title: data.plan_title,
      objective: data.plan_objective,
      month_reference: data.plan_month_reference,
      client: {
        company_name: data.client_company_name,
        logo_url: data.client_logo_url,
      },
    },
  };
}

/**
 * Registra abertura do token. Idempotente em first_opened_at —
 * só seta na primeira vez. open_count incrementa sempre.
 *
 * @param {string} tokenId
 * @param {string} ip
 * @param {string} userAgent
 */
async function trackOpen(tokenId, ip, userAgent) {
  console.log('[INFO][ContentPlanning:ShareToken] trackOpen', { tokenId, ip });

  try {
    const before = await queryOne(
      `SELECT id, plan_id, tenant_id, first_opened_at
         FROM content_plan_share_tokens
        WHERE id = $1`,
      [tokenId]
    );
    if (!before) {
      console.log('[ERRO][ContentPlanning:ShareToken] trackOpen token não encontrado', { tokenId });
      return null;
    }

    const isFirstOpen = !before.first_opened_at;

    const row = await queryOne(
      `UPDATE content_plan_share_tokens
          SET open_count       = open_count + 1,
              last_opened_at   = now(),
              first_opened_at  = COALESCE(first_opened_at, now()),
              ip_first         = COALESCE(ip_first, $2),
              user_agent       = COALESCE(user_agent, $3),
              updated_at       = now()
        WHERE id = $1
        RETURNING *`,
      [tokenId, ip || null, userAgent ? String(userAgent).slice(0, 500) : null]
    );

    if (isFirstOpen) {
      await activity.logActivity(before.tenant_id, before.plan_id, {
        actorType: 'client',
        actorId: null,
        eventType: 'client_opened',
        payload: { token_id: tokenId, ip: ip || null },
      });
    }

    console.log('[SUCESSO][ContentPlanning:ShareToken] trackOpen', { tokenId, isFirstOpen });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:ShareToken] trackOpen falhou', { tokenId, error: err.message });
    throw err;
  }
}

/**
 * Revoga manualmente um token (soft — registro fica no histórico com status='revoked').
 */
async function revokeToken(id, tenantId) {
  console.log('[INFO][ContentPlanning:ShareToken] revokeToken', { id, tenantId });
  try {
    const row = await queryOne(
      `UPDATE content_plan_share_tokens
          SET status = 'revoked', updated_at = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [id, tenantId]
    );
    if (!row) {
      console.log('[ERRO][ContentPlanning:ShareToken] revokeToken não encontrado', { id });
      return null;
    }
    console.log('[SUCESSO][ContentPlanning:ShareToken] revogado', { id });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:ShareToken] revokeToken falhou', { id, error: err.message });
    throw err;
  }
}

/**
 * Hard delete: remove o token completamente do banco.
 * Quem ainda tinha o link aberto cai em "link inválido" (404 not_found).
 */
async function deleteToken(id, tenantId) {
  console.log('[INFO][ContentPlanning:ShareToken] deleteToken', { id, tenantId });
  try {
    const row = await queryOne(
      `DELETE FROM content_plan_share_tokens
        WHERE id = $1 AND tenant_id = $2
        RETURNING id`,
      [id, tenantId]
    );
    if (!row) {
      console.log('[ERRO][ContentPlanning:ShareToken] deleteToken não encontrado', { id });
      return false;
    }
    console.log('[SUCESSO][ContentPlanning:ShareToken] removido', { id });
    return true;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:ShareToken] deleteToken falhou', { id, error: err.message });
    throw err;
  }
}

module.exports = {
  hashPin,
  verifyPin,
  generateTokenString,
  createShareToken,
  getTokenByValue,
  validateToken,
  trackOpen,
  revokeToken,
  deleteToken,
  listTokensByPlan,
};
