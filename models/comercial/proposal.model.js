/**
 * models/comercial/proposal.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD + tracking de propostas comerciais.
 * Multi-tenant nas queries internas. Slug é exposto público (sem tenant).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const { query, queryOne } = require('../../infra/db');
const { getSetting, setSetting } = require('../settings.model');
const { createNotification } = require('../clientForm');

// ─── Slug helpers ────────────────────────────────────────────────────────────

function slugify(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'proposta';
}

function randomSuffix(len = 6) {
  return Math.random().toString(36).substring(2, 2 + len);
}

async function generateUniqueSlug(base) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `${slugify(base)}-${randomSuffix(6)}`;
    const exists = await queryOne(
      `SELECT 1 FROM comercial_proposals WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    if (!exists) return slug;
  }
  // Fallback: timestamp + uuid frag
  return `${slugify(base)}-${Date.now().toString(36)}-${randomSuffix(4)}`;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

const DEFAULT_DATA = {
  client_name: '',
  client_logo_url: null,
  doc_id: null,
  doc_hash: null,
  signed_by: 'SIGMA',
  issued_at: null,
  valid_until: null,
  cover_pitch: '',
  cover_industry: '',
  cover_modality: '',
  // KPI stats da capa (4 cards)
  hero_stats: [],
  // Diagnóstico estruturado (3 painCards) — preferido. diagnostic_text fica como texto livre opcional.
  pain_points: [],
  diagnostic_text: '',
  // Oportunidade — quote_block estruturado, opportunity_text como texto livre.
  quote_block: { text: '', source: '' },
  opportunity_text: '',
  pillars: [],
  scope_items: [],
  timeline: [],
  investment: {
    full_price: null,
    parcelado_value: null,
    parcelado_count: null,
    items: [],
    cash_value: null,
    cash_savings: null,
    parcelado_label: null,
    cycle_label: null,
    setup_note: null,
  },
  projection_stats: [],
  projection_disclaimer: '',
  next_steps: [],
  // Seção FINAL (chamada-pra-ação)
  final_title: '',
  final_message: '',
  final_tagline: '',
  custom_message: '',
  // Marca quando a IA preencheu o conteúdo — bloqueia regeneração pra economizar tokens.
  ai_generated_at: null,
};

async function createProposal(tenantId, { prospectId, data, createdBy, expiresAt }) {
  if (!prospectId) throw new Error('prospectId obrigatório');
  console.log('[INFO][model:proposal:createProposal]', { tenantId, prospectId });

  const prospect = await queryOne(
    `SELECT id, company_name FROM comercial_prospects WHERE id = $1 AND tenant_id = $2`,
    [prospectId, tenantId]
  );
  if (!prospect) throw new Error('Prospect não encontrado');

  const slug = await generateUniqueSlug(prospect.company_name);

  const finalData = {
    ...DEFAULT_DATA,
    client_name: prospect.company_name,
    issued_at: new Date().toISOString(),
    ...(data || {}),
  };

  const row = await queryOne(
    `INSERT INTO comercial_proposals
       (tenant_id, prospect_id, slug, data, status, expires_at, created_by)
     VALUES ($1, $2, $3, $4::jsonb, 'draft', $5, $6)
     RETURNING *`,
    [
      tenantId,
      prospectId,
      slug,
      JSON.stringify(finalData),
      expiresAt ? (expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt) : null,
      createdBy || null,
    ]
  );
  console.log('[SUCESSO][model:proposal:createProposal]', { id: row.id, slug });
  return row;
}

async function getProposalById(id, tenantId) {
  return queryOne(
    `SELECT pp.*, p.company_name AS prospect_name, p.pipeline_lead_id
       FROM comercial_proposals pp
       LEFT JOIN comercial_prospects p ON p.id = pp.prospect_id
      WHERE pp.id = $1 AND pp.tenant_id = $2`,
    [id, tenantId]
  );
}

/**
 * Sem tenant — usado pelo endpoint público.
 */
async function getProposalBySlug(slug) {
  return queryOne(
    `SELECT * FROM comercial_proposals WHERE slug = $1`,
    [slug]
  );
}

async function listProposals(tenantId, { status, prospectId, search, limit = 100, offset = 0 } = {}) {
  const conditions = ['pp.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (status)     { conditions.push(`pp.status = $${idx++}`);      params.push(status); }
  if (prospectId) { conditions.push(`pp.prospect_id = $${idx++}`); params.push(prospectId); }
  if (search && search.trim()) {
    conditions.push(`(pp.data->>'client_name' ILIKE $${idx} OR p.company_name ILIKE $${idx} OR pp.slug ILIKE $${idx})`);
    params.push(`%${search.trim()}%`);
    idx++;
  }

  return query(
    `SELECT pp.id, pp.slug, pp.status, pp.expires_at, pp.published_at,
            pp.view_count, pp.unique_view_count, pp.last_viewed_at,
            pp.total_time_seconds, pp.max_scroll_pct,
            pp.created_at, pp.updated_at,
            pp.data->>'client_name' AS client_name,
            p.company_name AS prospect_name
       FROM comercial_proposals pp
       LEFT JOIN comercial_prospects p ON p.id = pp.prospect_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY pp.updated_at DESC
      LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
}

/**
 * Merge JSONB no campo data (substitui top-level keys, sem deep-merge).
 * Se o caller quiser deep-merge, faz no nível do caller.
 */
async function updateProposalData(id, tenantId, dataPatch) {
  if (!dataPatch || typeof dataPatch !== 'object') {
    return getProposalById(id, tenantId);
  }
  const row = await queryOne(
    `UPDATE comercial_proposals
        SET data = data || $1::jsonb
      WHERE id = $2 AND tenant_id = $3
      RETURNING *`,
    [JSON.stringify(dataPatch), id, tenantId]
  );
  return row;
}

async function publishProposal(id, tenantId, { ttlDays = 7 } = {}) {
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  const row = await queryOne(
    `UPDATE comercial_proposals
        SET status = 'published',
            expires_at = $1,
            published_at = COALESCE(published_at, now())
      WHERE id = $2 AND tenant_id = $3
      RETURNING *`,
    [expiresAt.toISOString(), id, tenantId]
  );
  console.log('[SUCESSO][model:proposal:publishProposal]', { id, slug: row?.slug });
  return row;
}

async function deleteProposal(id, tenantId) {
  await query(
    `DELETE FROM comercial_proposals WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function duplicateProposal(id, tenantId, createdBy = null) {
  const orig = await getProposalById(id, tenantId);
  if (!orig) throw new Error('Proposta não encontrada');

  const slug = await generateUniqueSlug(orig.prospect_name || 'proposta');
  const row = await queryOne(
    `INSERT INTO comercial_proposals
       (tenant_id, prospect_id, slug, data, status, created_by)
     VALUES ($1, $2, $3, $4::jsonb, 'draft', $5)
     RETURNING *`,
    [tenantId, orig.prospect_id, slug, JSON.stringify(orig.data || {}), createdBy]
  );
  console.log('[SUCESSO][model:proposal:duplicateProposal]', { from: id, to: row.id });
  return row;
}

// ─── Visitor hash ────────────────────────────────────────────────────────────

async function getOrCreateVisitorSalt(tenantId) {
  const existing = await getSetting(tenantId, 'comercial_visitor_salt');
  if (existing) return existing;
  const salt = crypto.randomUUID();
  await setSetting(tenantId, 'comercial_visitor_salt', salt);
  return salt;
}

function hashVisitor(ip, userAgent, salt) {
  return crypto.createHash('sha256')
    .update(`${ip || ''}|${userAgent || ''}|${salt}`)
    .digest('hex');
}

// ─── Tracking ────────────────────────────────────────────────────────────────

/**
 * Registra início de visualização. Retorna { proposal, view }.
 * Se proposta não existe ou está expirada, retorna null.
 */
async function recordView(slug, { ip, userAgent, referer }) {
  const proposal = await getProposalBySlug(slug);
  if (!proposal) return null;

  // Marca expired automaticamente se passou da data
  if (proposal.expires_at && new Date(proposal.expires_at) < new Date()
      && proposal.status === 'published') {
    await query(
      `UPDATE comercial_proposals SET status = 'expired' WHERE id = $1 AND status = 'published'`,
      [proposal.id]
    );
    proposal.status = 'expired';
  }
  if (proposal.status === 'expired') return { proposal, view: null, expired: true };
  if (proposal.status === 'draft')   return { proposal, view: null, draft:   true };

  const salt = await getOrCreateVisitorSalt(proposal.tenant_id);
  const visitorHash = hashVisitor(ip, userAgent, salt);

  // Verifica se visitor já existe pra esta proposta
  const existing = await queryOne(
    `SELECT 1 FROM comercial_proposal_views
      WHERE proposal_id = $1 AND visitor_hash = $2 LIMIT 1`,
    [proposal.id, visitorHash]
  );
  const isUnique = !existing;

  const view = await queryOne(
    `INSERT INTO comercial_proposal_views
       (proposal_id, visitor_hash, user_agent, referer, is_unique)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [proposal.id, visitorHash, (userAgent || '').slice(0, 500), (referer || '').slice(0, 500), isUnique]
  );

  // Incrementa agregados
  const updated = await queryOne(
    `UPDATE comercial_proposals
        SET view_count = view_count + 1,
            unique_view_count = unique_view_count + $1,
            last_viewed_at = now()
      WHERE id = $2
      RETURNING view_count, unique_view_count`,
    [isUnique ? 1 : 0, proposal.id]
  );

  // Notificação de PRIMEIRA visualização única + activity
  if (isUnique && updated.unique_view_count === 1) {
    const clientName = proposal.data?.client_name || 'Cliente';

    // Notification (respeita toggle comercial_notify_proposal_viewed)
    try {
      const { getSetting } = require('../settings.model');
      const notifyEnabled = await getSetting(proposal.tenant_id, 'comercial_notify_proposal_viewed');
      if (notifyEnabled !== 'false') {
        await createNotification(
          proposal.tenant_id,
          'proposal_first_view',
          'Proposta visualizada',
          `${clientName} abriu sua proposta há instantes.`,
          null,
          { proposalId: proposal.id, slug: proposal.slug }
        );
      }
    } catch (err) {
      console.warn('[WARN][proposal:recordView] Notificação falhou', { error: err.message });
    }

    // Activity 'proposal_viewed' no pipeline_lead (se houver vínculo via prospect)
    try {
      const link = await queryOne(
        `SELECT p.pipeline_lead_id
           FROM comercial_prospects p
          WHERE p.id = $1 AND p.tenant_id = $2 AND p.pipeline_lead_id IS NOT NULL`,
        [proposal.prospect_id, proposal.tenant_id]
      );
      if (link?.pipeline_lead_id) {
        const { createActivity } = require('./activity.model');
        await createActivity(proposal.tenant_id, {
          pipelineLeadId: link.pipeline_lead_id,
          type: 'proposal_viewed',
          metadata: { proposalId: proposal.id, slug: proposal.slug, viewId: view.id },
        });
      }
    } catch (err) {
      console.warn('[WARN][proposal:recordView] Activity falhou', { error: err.message });
    }
  }

  return { proposal, view, expired: false };
}

/**
 * Atualiza tempo + scroll de uma view. Recalcula agregados na proposta.
 */
async function pingView(viewId, { timeSeconds, scrollPct }) {
  const t = Math.max(0, Math.min(parseInt(timeSeconds, 10) || 0, 86400));
  const s = Math.max(0, Math.min(parseInt(scrollPct, 10) || 0, 100));

  const view = await queryOne(
    `UPDATE comercial_proposal_views
        SET time_seconds = GREATEST(time_seconds, $1),
            max_scroll_pct = GREATEST(max_scroll_pct, $2),
            last_ping_at = now()
      WHERE id = $3
      RETURNING proposal_id, time_seconds, max_scroll_pct`,
    [t, s, viewId]
  );
  if (!view) return null;

  // Recalcula agregados da proposal (sum/max)
  await query(
    `UPDATE comercial_proposals pp
        SET total_time_seconds = COALESCE(
              (SELECT SUM(time_seconds)::int FROM comercial_proposal_views WHERE proposal_id = pp.id),
              0
            ),
            max_scroll_pct = COALESCE(
              (SELECT MAX(max_scroll_pct)::int FROM comercial_proposal_views WHERE proposal_id = pp.id),
              0
            )
      WHERE pp.id = $1`,
    [view.proposal_id]
  );

  return view;
}

async function endView(viewId) {
  const view = await queryOne(
    `UPDATE comercial_proposal_views
        SET ended_at = now()
      WHERE id = $1 AND ended_at IS NULL
      RETURNING proposal_id`,
    [viewId]
  );
  if (!view) return null;
  return view;
}

async function getProposalAnalytics(id, tenantId) {
  const summary = await queryOne(
    `SELECT view_count, unique_view_count, total_time_seconds, max_scroll_pct, last_viewed_at
       FROM comercial_proposals WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!summary) return null;

  const avgRow = await queryOne(
    `SELECT AVG(time_seconds)::int AS avg_time
       FROM comercial_proposal_views
      WHERE proposal_id = $1 AND time_seconds > 0`,
    [id]
  );

  const timeline = await query(
    `SELECT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS views,
            SUM(CASE WHEN is_unique THEN 1 ELSE 0 END)::int AS unique_views
       FROM comercial_proposal_views
      WHERE proposal_id = $1
      GROUP BY 1
      ORDER BY 1 ASC`,
    [id]
  );

  return {
    views: summary.view_count,
    uniqueViews: summary.unique_view_count,
    totalTimeSeconds: summary.total_time_seconds,
    avgTimeSeconds: avgRow?.avg_time || 0,
    maxScroll: summary.max_scroll_pct,
    lastViewedAt: summary.last_viewed_at,
    timeline,
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  createProposal,
  getProposalById,
  getProposalBySlug,
  listProposals,
  updateProposalData,
  publishProposal,
  deleteProposal,
  duplicateProposal,
  recordView,
  pingView,
  endView,
  getProposalAnalytics,
  // helpers expostos para testes
  slugify,
  generateUniqueSlug,
};
