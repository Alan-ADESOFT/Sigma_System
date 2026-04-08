/**
 * models/referral.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD + business logic do sistema de indicação.
 *
 * Modelo:
 *   - referrals       → cada link gerado é uma linha
 *   - referral_config → uma linha por tenant com config da página de venda
 *
 * Multi-tenancy: toda query de leitura/listagem filtra por tenant_id ou
 * referrer_id (que já carrega tenant). Funções públicas (visit, video-progress)
 * usam apenas o ref_code, que é um identificador opaco e único.
 *
 * Status de uma indicação (campo `status`):
 *   link_created       → cliente gerou o link, ninguém clicou ainda
 *   page_visited       → indicado abriu /indicacao/{ref_code} (timer iniciado)
 *   video_started      → tocou play
 *   video_completed    → assistiu >= 95%
 *   purchased          → bateu no checkout (comprado)
 *
 * O ref_code é um UUID curto (8 chars) — não precisa ser criptograficamente
 * impossível de adivinhar, só razoavelmente único e não-sequencial.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const { query, queryOne } = require('../infra/db');

/* ─────────────────────────────────────────────────────────────────────────────
   Defaults — textos das mensagens enviadas ao cliente que indica.
   Quando o admin nunca editou (NULL no banco), retornamos esses valores.
   O placeholder {LINK} no whatsappMessage é substituído pelo refLink real.
───────────────────────────────────────────────────────────────────────────── */
const DEFAULT_COPY_WARNING =
  'ATENÇÃO: esse link é único e exclusivo. Quem você indicar tem APENAS 72 horas após o primeiro acesso pra ver a oferta — depois ela some pra sempre. Não envia pra qualquer um.';

const DEFAULT_WHATSAPP_MESSAGE =
  'Fala! Tô num processo com a Sigma que tá mudando minha visão. Consegui acesso EXCLUSIVO pra você. Só liberam quando cliente indica. Clica: {LINK}';

/* ─────────────────────────────────────────────────────────────────────────────
   Mappers — row → frontend (camelCase)
───────────────────────────────────────────────────────────────────────────── */
function mapReferral(row) {
  if (!row) return null;
  return {
    id: row.id,
    referrerId: row.referrer_id,
    tenantId: row.tenant_id,
    refCode: row.ref_code,
    refLink: row.ref_link,
    referredName: row.referred_name,
    referredPhone: row.referred_phone,
    referredEmail: row.referred_email,
    status: row.status,
    videoProgress: row.video_progress || 0,
    firstAccessAt: row.first_access_at,
    timerExpires: row.timer_expires,
    purchasedAt: row.purchased_at,
    purchaseValue: row.purchase_value ? Number(row.purchase_value) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConfig(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    vslVideoUrl: row.vsl_video_url,
    vslVideoDuration: row.vsl_video_duration || 240,
    offerRevealAt: row.offer_reveal_at != null ? row.offer_reveal_at : 210,
    offerPrice: Number(row.offer_price || 0),
    offerOriginal: Number(row.offer_original || 0),
    offerInstallments: row.offer_installments || 12,
    timerHours: row.timer_hours || 72,
    checkoutUrl: row.checkout_url,
    copyWarningMessage: row.copy_warning_message || DEFAULT_COPY_WARNING,
    whatsappMessage:    row.whatsapp_message    || DEFAULT_WHATSAPP_MESSAGE,
    pageActive: !!row.page_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */

// Gera um código curto único (10 chars hex). Colisão é absurdamente rara
// e a constraint UNIQUE no banco serve de rede de segurança final.
function generateRefCode() {
  return crypto.randomBytes(5).toString('hex'); // 10 chars
}

// Monta a URL absoluta do link de indicação. Usa NEXT_PUBLIC_APP_URL ou
// NEXT_PUBLIC_BASE_URL com fallback razoável pra dev.
function buildRefLink(refCode) {
  const base = process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_BASE_URL
    || 'http://localhost:3001';
  return `${base.replace(/\/$/, '')}/indicacao/${refCode}`;
}

/* ═════════════════════════════════════════════════════════════════════════════
   REFERRALS — CRUD principal
═════════════════════════════════════════════════════════════════════════════ */

/**
 * Gera (ou retorna o existente) link de indicação pra um cliente.
 * Comportamento idempotente — se o cliente já tem um link `link_created`
 * ou `page_visited` (qualquer um vivo), reaproveita. Isso evita o cliente
 * recarregar a tela e ganhar 50 links zumbi no banco.
 *
 * Se houver indicação concluída (purchased) ou expirada, gera nova.
 */
async function generateReferralLink(clientId, tenantId) {
  if (!clientId || !tenantId) {
    throw new Error('clientId e tenantId são obrigatórios');
  }

  // Reusa link existente que ainda está vivo (não comprado e dentro do prazo,
  // ou ainda nem visitado). Pega o mais recente.
  const existing = await queryOne(
    `SELECT * FROM referrals
       WHERE referrer_id = $1
         AND tenant_id   = $2
         AND status IN ('link_created','page_visited','video_started','video_completed')
       ORDER BY created_at DESC
       LIMIT 1`,
    [clientId, tenantId]
  );
  if (existing) return mapReferral(existing);

  // Gera novo. Loop curto pra cobrir o caso (raríssimo) de colisão de hex.
  let refCode;
  for (let i = 0; i < 5; i++) {
    refCode = generateRefCode();
    const dup = await queryOne(
      `SELECT 1 FROM referrals WHERE ref_code = $1`,
      [refCode]
    );
    if (!dup) break;
  }
  const refLink = buildRefLink(refCode);

  const row = await queryOne(
    `INSERT INTO referrals (referrer_id, tenant_id, ref_code, ref_link, status)
     VALUES ($1, $2, $3, $4, 'link_created')
     RETURNING *`,
    [clientId, tenantId, refCode, refLink]
  );
  return mapReferral(row);
}

/**
 * Lista todas as indicações de um cliente (mais recentes primeiro).
 */
async function getReferralsByClient(clientId) {
  if (!clientId) return [];
  const rows = await query(
    `SELECT * FROM referrals
       WHERE referrer_id = $1
       ORDER BY created_at DESC`,
    [clientId]
  );
  return rows.map(mapReferral);
}

/**
 * Busca uma indicação pelo ref_code (usada pela página secreta).
 */
async function getReferralByCode(refCode) {
  if (!refCode) return null;
  const row = await queryOne(
    `SELECT * FROM referrals WHERE ref_code = $1`,
    [refCode]
  );
  return mapReferral(row);
}

/**
 * Marca a primeira visita à página secreta. Inicia o timer de N horas
 * (vindo do referral_config do tenant). Se o link já foi visitado antes,
 * NÃO reinicia o timer — o primeiro tap conta.
 */
async function markPageVisited(refCode) {
  const row = await queryOne(
    `SELECT * FROM referrals WHERE ref_code = $1`,
    [refCode]
  );
  if (!row) return null;

  // Se já tem first_access_at, só retorna o estado atual sem mexer
  if (row.first_access_at) return mapReferral(row);

  // Pega timer_hours do config do tenant
  const cfg = await queryOne(
    `SELECT timer_hours FROM referral_config WHERE tenant_id = $1`,
    [row.tenant_id]
  );
  const hours = cfg?.timer_hours || 72;

  const updated = await queryOne(
    `UPDATE referrals
        SET first_access_at = now(),
            timer_expires   = now() + ($1 || ' hours')::interval,
            status          = CASE WHEN status = 'link_created' THEN 'page_visited' ELSE status END
      WHERE ref_code = $2
      RETURNING *`,
    [String(hours), refCode]
  );
  return mapReferral(updated);
}

/**
 * Atualiza o progresso do vídeo (0-100%) e ajusta status conforme o avanço.
 * Não retrocede status (se já está purchased, não vira video_started).
 */
async function markVideoProgress(refCode, percent) {
  const p = Math.max(0, Math.min(100, parseInt(percent, 10) || 0));

  // Decide o novo status com base no percent
  let newStatus;
  if (p >= 95) newStatus = 'video_completed';
  else if (p > 0) newStatus = 'video_started';
  else newStatus = null;

  // Só promove status se ainda não passou desse ponto
  const STATUS_RANK = {
    link_created: 0,
    page_visited: 1,
    video_started: 2,
    video_completed: 3,
    purchased: 4,
  };

  const current = await queryOne(
    `SELECT status, video_progress FROM referrals WHERE ref_code = $1`,
    [refCode]
  );
  if (!current) return null;

  const shouldBumpStatus = newStatus
    && (STATUS_RANK[newStatus] || 0) > (STATUS_RANK[current.status] || 0);

  // Não regride o video_progress (cliente pode dar seek pra trás)
  const newProgress = Math.max(p, current.video_progress || 0);

  const updated = await queryOne(
    `UPDATE referrals
        SET video_progress = $1,
            status         = CASE WHEN $2::boolean THEN $3 ELSE status END
      WHERE ref_code = $4
      RETURNING *`,
    [newProgress, shouldBumpStatus, newStatus, refCode]
  );
  return mapReferral(updated);
}

/**
 * Marca como comprado. Salva valor pra histórico e métricas.
 */
async function markPurchase(refCode, value) {
  const updated = await queryOne(
    `UPDATE referrals
        SET status         = 'purchased',
            purchased_at   = now(),
            purchase_value = $1
      WHERE ref_code = $2
      RETURNING *`,
    [value || null, refCode]
  );
  return mapReferral(updated);
}

/**
 * Atualização genérica de status (admin).
 */
async function updateReferralStatus(refCode, status, extraData = {}) {
  const fields = ['status = $1'];
  const params = [status];
  let idx = 2;

  if (extraData.referredName) {
    fields.push(`referred_name = $${idx++}`);
    params.push(extraData.referredName);
  }
  if (extraData.referredPhone) {
    fields.push(`referred_phone = $${idx++}`);
    params.push(extraData.referredPhone);
  }
  if (extraData.referredEmail) {
    fields.push(`referred_email = $${idx++}`);
    params.push(extraData.referredEmail);
  }

  params.push(refCode);
  const updated = await queryOne(
    `UPDATE referrals SET ${fields.join(', ')} WHERE ref_code = $${idx} RETURNING *`,
    params
  );
  return mapReferral(updated);
}

/**
 * Verifica se o timer de uma indicação já expirou.
 * Retorna { expired: bool, msRemaining: number, expiresAt: Date }.
 */
async function checkTimer(refCode) {
  const row = await queryOne(
    `SELECT timer_expires, first_access_at FROM referrals WHERE ref_code = $1`,
    [refCode]
  );
  if (!row || !row.timer_expires) {
    return { expired: false, msRemaining: null, expiresAt: null };
  }
  const expiresAt = new Date(row.timer_expires);
  const ms = expiresAt.getTime() - Date.now();
  return {
    expired: ms <= 0,
    msRemaining: Math.max(0, ms),
    expiresAt,
  };
}

/* ═════════════════════════════════════════════════════════════════════════════
   ADMIN — listar todas indicações de um tenant + filtros
═════════════════════════════════════════════════════════════════════════════ */

/**
 * Lista todas as indicações do tenant, com nome do cliente referrer.
 * Aceita filtro opcional por status.
 */
async function listReferralsAdmin(tenantId, { status } = {}) {
  if (!tenantId) return [];

  const params = [tenantId];
  let where = `WHERE r.tenant_id = $1`;

  if (status) {
    params.push(status);
    where += ` AND r.status = $${params.length}`;
  }

  const rows = await query(
    `SELECT r.*,
            mc.company_name AS referrer_name,
            mc.phone        AS referrer_phone
       FROM referrals r
       LEFT JOIN marketing_clients mc ON mc.id = r.referrer_id
       ${where}
       ORDER BY r.created_at DESC`,
    params
  );

  return rows.map(row => ({
    ...mapReferral(row),
    referrerName: row.referrer_name,
    referrerPhone: row.referrer_phone,
  }));
}

/* ═════════════════════════════════════════════════════════════════════════════
   REFERRAL_CONFIG — config da página de venda (admin)
═════════════════════════════════════════════════════════════════════════════ */

/**
 * Carrega a config do tenant. Se não existir, cria com defaults e devolve.
 * Garante que a página secreta sempre tem algo pra renderizar.
 */
async function getReferralConfig(tenantId) {
  if (!tenantId) return null;

  let row = await queryOne(
    `SELECT * FROM referral_config WHERE tenant_id = $1`,
    [tenantId]
  );

  if (!row) {
    row = await queryOne(
      `INSERT INTO referral_config (tenant_id) VALUES ($1) RETURNING *`,
      [tenantId]
    );
  }

  return mapConfig(row);
}

/**
 * Upsert da config. Aceita um objeto parcial — só os campos enviados são
 * atualizados (COALESCE preserva o resto).
 */
async function upsertReferralConfig(tenantId, data = {}) {
  if (!tenantId) throw new Error('tenantId obrigatório');

  // Garante que existe linha
  await getReferralConfig(tenantId);

  const updated = await queryOne(
    `UPDATE referral_config SET
        vsl_video_url        = COALESCE($1,  vsl_video_url),
        vsl_video_duration   = COALESCE($2,  vsl_video_duration),
        offer_reveal_at      = COALESCE($3,  offer_reveal_at),
        offer_price          = COALESCE($4,  offer_price),
        offer_original       = COALESCE($5,  offer_original),
        offer_installments   = COALESCE($6,  offer_installments),
        timer_hours          = COALESCE($7,  timer_hours),
        checkout_url         = COALESCE($8,  checkout_url),
        copy_warning_message = COALESCE($9,  copy_warning_message),
        whatsapp_message     = COALESCE($10, whatsapp_message),
        page_active          = COALESCE($11, page_active)
      WHERE tenant_id = $12
      RETURNING *`,
    [
      data.vslVideoUrl ?? null,
      data.vslVideoDuration ?? null,
      data.offerRevealAt ?? null,
      data.offerPrice ?? null,
      data.offerOriginal ?? null,
      data.offerInstallments ?? null,
      data.timerHours ?? null,
      data.checkoutUrl ?? null,
      data.copyWarningMessage ?? null,
      data.whatsappMessage ?? null,
      typeof data.pageActive === 'boolean' ? data.pageActive : null,
      tenantId,
    ]
  );

  return mapConfig(updated);
}

module.exports = {
  // referrals
  generateReferralLink,
  getReferralsByClient,
  getReferralByCode,
  markPageVisited,
  markVideoProgress,
  markPurchase,
  updateReferralStatus,
  checkTimer,
  listReferralsAdmin,
  // config
  getReferralConfig,
  upsertReferralConfig,
  // helpers
  buildRefLink,
};
