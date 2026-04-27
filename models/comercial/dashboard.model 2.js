/**
 * models/comercial/dashboard.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Agregações para o Dashboard Comercial.
 * Multi-tenant em todas as queries.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodBoundaries(period = 'month') {
  const now = new Date();
  let from;
  if (period === 'week') {
    from = new Date(now); from.setDate(from.getDate() - 7);
  } else if (period === 'year') {
    from = new Date(now); from.setFullYear(from.getFullYear() - 1);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { from, to: now };
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

async function getKPIs(tenantId, { period = 'month' } = {}) {
  const { from, to } = periodBoundaries(period);
  const fromIso = from.toISOString();
  const toIso   = to.toISOString();

  const [
    leadsCaptured, leadsImported, pipelineTotals, won, proposalsPub, proposalsViewed, jobsToday,
  ] = await Promise.all([
    queryOne(
      `SELECT COUNT(*)::int AS c FROM comercial_leads
        WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3`,
      [tenantId, fromIso, toIso]
    ),
    queryOne(
      `SELECT COUNT(*)::int AS c FROM comercial_leads
        WHERE tenant_id = $1 AND imported_to_pipeline = true
          AND created_at >= $2 AND created_at < $3`,
      [tenantId, fromIso, toIso]
    ),
    queryOne(
      `SELECT
         COUNT(*)::int                                         AS total,
         COALESCE(SUM(estimated_value), 0)::numeric            AS estimated,
         COUNT(*) FILTER (WHERE c.system_role = 'won')::int    AS won_count,
         COALESCE(SUM(CASE WHEN c.system_role = 'won' THEN pl.estimated_value ELSE 0 END), 0)::numeric AS won_value
       FROM comercial_pipeline_leads pl
       LEFT JOIN comercial_pipeline_columns c ON c.id = pl.column_id
      WHERE pl.tenant_id = $1`,
      [tenantId]
    ),
    queryOne(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(pl.estimated_value), 0)::numeric AS v,
              AVG(EXTRACT(EPOCH FROM (pl.won_at - pl.created_at)) / 86400)::numeric AS avg_days
         FROM comercial_pipeline_leads pl
        WHERE pl.tenant_id = $1
          AND pl.won_at IS NOT NULL
          AND pl.won_at >= $2 AND pl.won_at < $3`,
      [tenantId, fromIso, toIso]
    ),
    queryOne(
      `SELECT COUNT(*)::int AS c FROM comercial_proposals
        WHERE tenant_id = $1 AND published_at IS NOT NULL
          AND published_at >= $2 AND published_at < $3`,
      [tenantId, fromIso, toIso]
    ),
    queryOne(
      `SELECT COUNT(*)::int AS c FROM comercial_proposals
        WHERE tenant_id = $1 AND unique_view_count > 0
          AND last_viewed_at >= $2 AND last_viewed_at < $3`,
      [tenantId, fromIso, toIso]
    ),
    queryOne(
      `SELECT COUNT(*)::int AS c FROM comercial_lead_lists
        WHERE tenant_id = $1 AND created_at >= now() - INTERVAL '24 hours'`,
      [tenantId]
    ),
  ]);

  const totalPipeline = pipelineTotals?.total || 0;
  const wonCount      = won?.c || 0;
  const conversionRate = totalPipeline > 0 ? (wonCount / totalPipeline) * 100 : 0;
  const proposalsPubCount    = proposalsPub?.c || 0;
  const proposalsViewedCount = proposalsViewed?.c || 0;
  const proposalViewRate = proposalsPubCount > 0
    ? (proposalsViewedCount / proposalsPubCount) * 100
    : 0;
  const avgTicket = wonCount > 0 ? Number(won.v) / wonCount : 0;

  return {
    leadsCapturedMonth:    leadsCaptured?.c || 0,
    leadsImportedMonth:    leadsImported?.c || 0,
    pipelineTotalLeads:    totalPipeline,
    pipelineEstimatedValue: Number(pipelineTotals?.estimated || 0),
    pipelineWonValue:      Number(pipelineTotals?.won_value || 0),
    conversionRate:        Number(conversionRate.toFixed(2)),
    avgDaysToClose:        won?.avg_days ? Number(Number(won.avg_days).toFixed(1)) : null,
    proposalsSentMonth:    proposalsPubCount,
    proposalsViewedMonth:  proposalsViewedCount,
    proposalViewRate:      Number(proposalViewRate.toFixed(2)),
    closedMonthCount:      wonCount,
    closedMonthValue:      Number(won?.v || 0),
    avgTicket:             Number(avgTicket.toFixed(2)),
    activeJobsToday:       jobsToday?.c || 0,
    period: { from: fromIso, to: toIso, key: period },
  };
}

// ─── Funil ───────────────────────────────────────────────────────────────────

async function getFunnel(tenantId) {
  return query(
    `SELECT c.id AS column_id,
            c.name,
            c.color,
            c.system_role,
            c.sort_order,
            COUNT(pl.id)::int AS lead_count,
            COALESCE(SUM(pl.estimated_value), 0)::numeric AS total_value,
            AVG(EXTRACT(EPOCH FROM (now() - pl.last_activity_at)) / 86400)::numeric AS avg_days_in_column
       FROM comercial_pipeline_columns c
       LEFT JOIN comercial_pipeline_leads pl
         ON pl.column_id = c.id AND pl.tenant_id = c.tenant_id
      WHERE c.tenant_id = $1
      GROUP BY c.id, c.name, c.color, c.system_role, c.sort_order
      ORDER BY c.sort_order ASC`,
    [tenantId]
  );
}

// ─── Conversão entre etapas ──────────────────────────────────────────────────

async function getStageConversion(tenantId, { period = 'month' } = {}) {
  const { from, to } = periodBoundaries(period);

  // Conta status_change activities entrando em cada coluna no período
  const rows = await query(
    `SELECT
       a.metadata->>'toColumnId' AS to_column_id,
       a.metadata->>'toColumnName' AS to_column_name,
       COUNT(DISTINCT a.pipeline_lead_id)::int AS leads_passed
     FROM comercial_lead_activities a
    WHERE a.tenant_id = $1
      AND a.type = 'status_change'
      AND a.created_at >= $2 AND a.created_at < $3
    GROUP BY a.metadata->>'toColumnId', a.metadata->>'toColumnName'`,
    [tenantId, from.toISOString(), to.toISOString()]
  );

  return rows;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

async function getLeaderboard(tenantId, { period = 'month', limit = 10 } = {}) {
  const { from, to } = periodBoundaries(period);
  const fromIso = from.toISOString();
  const toIso   = to.toISOString();

  return query(
    `SELECT
       t.id   AS user_id,
       t.name AS user_name,
       t.avatar_url,
       (SELECT COUNT(*)::int FROM comercial_pipeline_leads pl
          WHERE pl.tenant_id = $1 AND pl.assigned_to = t.id) AS leads_assigned,
       (SELECT COUNT(*)::int FROM comercial_pipeline_leads pl
          WHERE pl.tenant_id = $1 AND pl.assigned_to = t.id
            AND pl.won_at IS NOT NULL
            AND pl.won_at >= $2 AND pl.won_at < $3) AS leads_won,
       (SELECT COALESCE(SUM(pl.estimated_value), 0)::numeric FROM comercial_pipeline_leads pl
          WHERE pl.tenant_id = $1 AND pl.assigned_to = t.id
            AND pl.won_at IS NOT NULL
            AND pl.won_at >= $2 AND pl.won_at < $3) AS leads_won_value,
       (SELECT COUNT(*)::int FROM comercial_proposals pp
          WHERE pp.tenant_id = $1 AND pp.created_by = t.id
            AND pp.published_at IS NOT NULL
            AND pp.published_at >= $2 AND pp.published_at < $3) AS proposals_sent,
       (SELECT COUNT(*)::int FROM comercial_lead_activities a
          WHERE a.tenant_id = $1 AND a.created_by = t.id
            AND a.created_at >= $2 AND a.created_at < $3) AS activities_count
     FROM tenants t
     WHERE t.id = $1
        OR t.id IN (
          SELECT DISTINCT created_by FROM comercial_lead_activities
           WHERE tenant_id = $1 AND created_by IS NOT NULL
             AND created_at >= $2 AND created_at < $3
          UNION
          SELECT DISTINCT assigned_to FROM comercial_pipeline_leads
           WHERE tenant_id = $1 AND assigned_to IS NOT NULL
        )
     ORDER BY leads_won DESC, proposals_sent DESC, activities_count DESC
     LIMIT $4`,
    [tenantId, fromIso, toIso, limit]
  );
}

// ─── Histórico semanal ───────────────────────────────────────────────────────

async function getWeeklyHistory(tenantId, { weeks = 52 } = {}) {
  return query(
    `WITH series AS (
       SELECT generate_series(
         date_trunc('week', now()) - INTERVAL '1 week' * ($2::int - 1),
         date_trunc('week', now()),
         '1 week'
       )::date AS week_start
     )
     SELECT
       s.week_start,
       (SELECT COUNT(*)::int FROM comercial_leads l
          WHERE l.tenant_id = $1
            AND l.created_at >= s.week_start
            AND l.created_at < s.week_start + INTERVAL '7 days') AS captured,
       (SELECT COUNT(*)::int FROM comercial_pipeline_leads pl
          WHERE pl.tenant_id = $1 AND pl.won_at IS NOT NULL
            AND pl.won_at >= s.week_start
            AND pl.won_at < s.week_start + INTERVAL '7 days') AS won,
       (SELECT COUNT(*)::int FROM comercial_pipeline_leads pl
          WHERE pl.tenant_id = $1 AND pl.lost_at IS NOT NULL
            AND pl.lost_at >= s.week_start
            AND pl.lost_at < s.week_start + INTERVAL '7 days') AS lost
     FROM series s
     ORDER BY s.week_start ASC`,
    [tenantId, weeks]
  );
}

// ─── Top propostas ───────────────────────────────────────────────────────────

async function getTopProposals(tenantId, { period = 'month', limit = 5 } = {}) {
  const { from, to } = periodBoundaries(period);
  return query(
    `SELECT pp.id, pp.slug,
            pp.data->>'client_name' AS client_name,
            pp.view_count, pp.unique_view_count,
            pp.total_time_seconds, pp.max_scroll_pct,
            pp.last_viewed_at, pp.published_at, pp.status
       FROM comercial_proposals pp
      WHERE pp.tenant_id = $1
        AND (pp.last_viewed_at IS NOT NULL OR pp.view_count > 0)
        AND (pp.last_viewed_at IS NULL OR pp.last_viewed_at >= $2)
      ORDER BY pp.view_count DESC, pp.unique_view_count DESC
      LIMIT $3`,
    [tenantId, from.toISOString(), limit]
  );
}

module.exports = {
  getKPIs,
  getFunnel,
  getStageConversion,
  getLeaderboard,
  getWeeklyHistory,
  getTopProposals,
  periodBoundaries,
};
