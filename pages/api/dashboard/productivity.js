/**
 * pages/api/dashboard/productivity.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoint analítico de produtividade do time.
 * Retorna KPIs globais, desempenho por usuário, séries temporais
 * e tarefas críticas — tudo escopado por tenant.
 *
 * GET /api/dashboard/productivity?period=week|month
 * → { success, data: { period, dateRange, stats, userStats,
 *      dailyCompletions, statusDistribution, categoryDistribution, criticalTasks } }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { query, queryOne } = require('../../../infra/db');

/* Cores semânticas dos status para o gráfico de pizza */
const STATUS_PALETTE = {
  done:        { label: 'Concluídas',    color: '#22c55e' },
  in_progress: { label: 'Em progresso',  color: '#3b82f6' },
  pending:     { label: 'Pendentes',     color: '#737373' },
  overdue:     { label: 'Atrasadas',     color: '#ff3333' },
};

const DAY_LABELS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Calcula intervalo de datas a partir do período solicitado.
 * - week: segunda a domingo da semana atual
 * - month: 1º até último dia do mês atual
 */
function resolveRange(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (period === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toIsoDate(from), to: toIsoDate(to) };
  }

  // Default = week (segunda a domingo)
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const from = new Date(today);
  from.setDate(today.getDate() + diffToMonday);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const tenantId = await resolveTenantId(req);
    const period = req.query.period === 'month' ? 'month' : 'week';
    const { from, to } = resolveRange(period);

    const [
      statsRow,
      userStats,
      dailyRows,
      statusRows,
      categoryRows,
      criticalTasks,
      meetingsRow,
    ] = await Promise.all([

      /* ─── KPIs globais do time ─────────────────────────────────────────── */
      queryOne(
        `SELECT
           COUNT(*)::int AS total_tasks,
           COUNT(*) FILTER (WHERE status = 'done')::int AS completed_tasks,
           COUNT(*) FILTER (
             WHERE status != 'done' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
           )::int AS overdue_tasks,
           COALESCE(SUM(estimated_hours), 0)::numeric AS total_estimated_hours,
           COALESCE(
             AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400.0)
               FILTER (WHERE status = 'done'),
             0
           )::numeric AS avg_completion_days
         FROM client_tasks
         WHERE tenant_id = $1
           AND due_date BETWEEN $2 AND $3`,
        [tenantId, from, to]
      ),

      /* ─── Desempenho por usuário ───────────────────────────────────────── */
      query(
        `SELECT
           t.id          AS user_id,
           t.name        AS user_name,
           t.avatar_url,
           COALESCE(COUNT(ct.id), 0)::int AS total,
           COALESCE(COUNT(ct.id) FILTER (WHERE ct.status = 'done'), 0)::int AS completed,
           COALESCE(
             COUNT(ct.id) FILTER (
               WHERE ct.status != 'done'
                 AND ct.due_date IS NOT NULL
                 AND ct.due_date < CURRENT_DATE
             ), 0
           )::int AS overdue,
           COALESCE(COUNT(ct.id) FILTER (WHERE ct.status = 'in_progress'), 0)::int AS in_progress,
           COALESCE(COUNT(ct.id) FILTER (WHERE ct.status = 'pending'),     0)::int AS pending,
           COALESCE(SUM(ct.estimated_hours), 0)::numeric AS estimated_hours
         FROM tenants t
         LEFT JOIN client_tasks ct
           ON ct.assigned_to = t.id
          AND ct.tenant_id = $1
          AND ct.due_date BETWEEN $2 AND $3
         WHERE t.is_active = true
           AND COALESCE(t.role, 'admin') != 'client'
         GROUP BY t.id, t.name, t.avatar_url
         HAVING COALESCE(COUNT(ct.id), 0) > 0
         ORDER BY completed DESC, total DESC`,
        [tenantId, from, to]
      ),

      /* ─── Conclusões/criações por dia ──────────────────────────────────── */
      query(
        `WITH series AS (
           SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS d
         )
         SELECT
           s.d AS date,
           COALESCE(c1.completed, 0)::int AS completed,
           COALESCE(c2.created,   0)::int AS created
         FROM series s
         LEFT JOIN (
           SELECT due_date::date AS d, COUNT(*) AS completed
             FROM client_tasks
            WHERE tenant_id = $1
              AND status = 'done'
              AND due_date BETWEEN $2 AND $3
            GROUP BY due_date::date
         ) c1 ON c1.d = s.d
         LEFT JOIN (
           SELECT created_at::date AS d, COUNT(*) AS created
             FROM client_tasks
            WHERE tenant_id = $1
              AND created_at::date BETWEEN $2 AND $3
            GROUP BY created_at::date
         ) c2 ON c2.d = s.d
         ORDER BY s.d ASC`,
        [tenantId, from, to]
      ),

      /* ─── Distribuição por status ──────────────────────────────────────── */
      query(
        `SELECT
           CASE
             WHEN status = 'done' THEN 'done'
             WHEN status = 'in_progress' THEN 'in_progress'
             WHEN status != 'done' AND due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 'overdue'
             ELSE 'pending'
           END AS status_key,
           COUNT(*)::int AS count
         FROM client_tasks
         WHERE tenant_id = $1
           AND due_date BETWEEN $2 AND $3
         GROUP BY status_key`,
        [tenantId, from, to]
      ),

      /* ─── Distribuição por categoria ───────────────────────────────────── */
      query(
        `SELECT
           COALESCE(tc.name,  'Sem categoria') AS category,
           COALESCE(tc.color, '#6366f1')       AS color,
           COUNT(ct.id)::int                                       AS total,
           COUNT(ct.id) FILTER (WHERE ct.status = 'done')::int     AS completed
         FROM client_tasks ct
         LEFT JOIN task_categories tc ON tc.id = ct.category_id
         WHERE ct.tenant_id = $1
           AND ct.due_date BETWEEN $2 AND $3
         GROUP BY tc.name, tc.color
         ORDER BY total DESC`,
        [tenantId, from, to]
      ),

      /* ─── Top 5 tarefas críticas (mais atrasadas) ──────────────────────── */
      query(
        `SELECT ct.id, ct.title, ct.priority, ct.due_date,
                mc.company_name AS client_name,
                t.name          AS assigned_to_name,
                (CURRENT_DATE - ct.due_date)::int AS days_overdue
           FROM client_tasks ct
           LEFT JOIN marketing_clients mc ON mc.id = ct.client_id
           LEFT JOIN tenants            t  ON t.id  = ct.assigned_to
          WHERE ct.tenant_id = $1
            AND ct.status != 'done'
            AND ct.due_date IS NOT NULL
            AND ct.due_date < CURRENT_DATE
          ORDER BY days_overdue DESC,
            CASE ct.priority
              WHEN 'urgente' THEN 0
              WHEN 'alta'    THEN 1
              WHEN 'normal'  THEN 2
              WHEN 'baixa'   THEN 3
              ELSE 4
            END ASC
          LIMIT 5`,
        [tenantId]
      ),

      /* ─── Reuniões no período ──────────────────────────────────────────── */
      queryOne(
        `SELECT COUNT(*)::int AS total
           FROM meetings
          WHERE tenant_id = $1
            AND meeting_date BETWEEN $2 AND $3
            AND status != 'cancelled'`,
        [tenantId, from, to]
      ),
    ]);

    /* ─── Pós-processamento ────────────────────────────────────────────── */

    const total      = statsRow?.total_tasks     || 0;
    const completed  = statsRow?.completed_tasks || 0;
    const completionRate = total > 0
      ? Number(((completed / total) * 100).toFixed(1))
      : 0;

    /* Daily completions com label PT-BR */
    const dailyCompletions = (dailyRows || []).map(row => {
      const dateStr = typeof row.date === 'string' ? row.date : toIsoDate(new Date(row.date));
      const d = new Date(dateStr + 'T00:00:00');
      const label = period === 'month'
        ? String(d.getDate()).padStart(2, '0')
        : DAY_LABELS_PT[d.getDay()];
      return {
        date: dateStr,
        label,
        completed: Number(row.completed) || 0,
        created:   Number(row.created)   || 0,
      };
    });

    /* Status distribution → garante todas as 4 chaves no resultado */
    const statusMap = Object.fromEntries(
      (statusRows || []).map(r => [r.status_key, Number(r.count) || 0])
    );
    const statusDistribution = Object.keys(STATUS_PALETTE).map(key => ({
      status: key,
      label:  STATUS_PALETTE[key].label,
      color:  STATUS_PALETTE[key].color,
      count:  statusMap[key] || 0,
    }));

    /* Per-user com completion_rate calculado */
    const userStatsOut = (userStats || []).map(u => {
      const t = Number(u.total)     || 0;
      const c = Number(u.completed) || 0;
      return {
        user_id:         u.user_id,
        user_name:       u.user_name,
        avatar_url:      u.avatar_url,
        total:           t,
        completed:       c,
        completion_rate: t > 0 ? Number(((c / t) * 100).toFixed(1)) : 0,
        overdue:         Number(u.overdue)         || 0,
        in_progress:     Number(u.in_progress)     || 0,
        pending:         Number(u.pending)         || 0,
        estimated_hours: Number(u.estimated_hours) || 0,
      };
    });

    return res.json({
      success: true,
      data: {
        period,
        dateRange: { from, to },
        stats: {
          totalTasks:          total,
          completedTasks:      completed,
          completionRate,
          overdueTasks:        statsRow?.overdue_tasks      || 0,
          avgCompletionTime:   Number(Number(statsRow?.avg_completion_days || 0).toFixed(1)),
          totalMeetings:       meetingsRow?.total           || 0,
          totalEstimatedHours: Number(statsRow?.total_estimated_hours || 0),
        },
        userStats:            userStatsOut,
        dailyCompletions,
        statusDistribution,
        categoryDistribution: (categoryRows || []).map(r => ({
          category:  r.category,
          color:     r.color,
          total:     Number(r.total)     || 0,
          completed: Number(r.completed) || 0,
        })),
        criticalTasks: (criticalTasks || []).map(t => ({
          id:               t.id,
          title:            t.title,
          priority:         t.priority,
          due_date:         t.due_date,
          client_name:      t.client_name,
          assigned_to_name: t.assigned_to_name,
          days_overdue:     Number(t.days_overdue) || 0,
        })),
      },
    });
  } catch (err) {
    console.error('[ERRO][API:dashboard/productivity]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
