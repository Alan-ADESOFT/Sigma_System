/**
 * pages/api/dashboard/overview.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoint pessoal do painel "Visão Geral".
 * Retorna tarefas, reuniões e KPIs do dia para o usuário logado.
 *
 * GET /api/dashboard/overview
 * → { success, data: { todayTasks, todayMeetings, recentTasks, stats } }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { query, queryOne } = require('../../../infra/db');
const { verifyToken } = require('../../../lib/auth');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Não autenticado.' });
    }

    const [
      todayTasks,
      todayMeetings,
      recentTasks,
      statsRow,
    ] = await Promise.all([

      /* ─── Tarefas do dia (do usuário logado) ───────────────────────────── */
      query(
        `SELECT ct.id, ct.title, ct.description, ct.status, ct.priority,
                ct.due_date, ct.client_id, ct.assigned_to,
                tc.name  AS category_name,
                tc.color AS category_color,
                mc.company_name AS client_name,
                COALESCE(jsonb_array_length(ct.subtasks), 0) AS subtasks_total,
                COALESCE((
                  SELECT COUNT(*) FROM jsonb_array_elements(ct.subtasks) s
                  WHERE (s->>'done')::boolean = true
                ), 0) AS subtasks_done,
                EXISTS(
                  SELECT 1 FROM task_dependencies td
                   JOIN client_tasks dep ON dep.id = td.depends_on_id
                  WHERE td.task_id = ct.id AND dep.status != 'done'
                ) AS has_pending_deps
           FROM client_tasks ct
           LEFT JOIN task_categories  tc ON tc.id = ct.category_id
           LEFT JOIN marketing_clients mc ON mc.id = ct.client_id
          WHERE ct.tenant_id = $1
            AND ct.assigned_to = $2
            AND ct.due_date = CURRENT_DATE
          ORDER BY
            CASE ct.priority
              WHEN 'urgente' THEN 0
              WHEN 'alta'    THEN 1
              WHEN 'normal'  THEN 2
              WHEN 'baixa'   THEN 3
              ELSE 4
            END ASC,
            ct.created_at ASC`,
        [tenantId, userId]
      ),

      /* ─── Reuniões do dia (criador OU participante) ────────────────────── */
      query(
        `SELECT m.id, m.title, m.description,
                m.meeting_date, m.start_time, m.end_time,
                m.status, m.client_id, m.meet_link, m.obs,
                m.created_by,
                mc.company_name AS client_name,
                COALESCE(array_length(m.participants, 1), 0) AS participants_count
           FROM meetings m
           LEFT JOIN marketing_clients mc ON mc.id = m.client_id
          WHERE m.tenant_id = $1
            AND m.meeting_date = CURRENT_DATE
            AND (m.created_by = $2 OR $2 = ANY(m.participants))
            AND m.status != 'cancelled'
          ORDER BY m.start_time ASC`,
        [tenantId, userId]
      ),

      /* ─── Últimas 10 tarefas adicionadas (do tenant) ───────────────────── */
      query(
        `SELECT ct.id, ct.title, ct.status, ct.priority, ct.due_date, ct.created_at,
                mc.company_name AS client_name,
                ta.name         AS assigned_to_name,
                tc_creator.name AS created_by_name,
                cat.name        AS category_name,
                cat.color       AS category_color
           FROM client_tasks ct
           LEFT JOIN marketing_clients mc          ON mc.id = ct.client_id
           LEFT JOIN tenants            ta         ON ta.id = ct.assigned_to
           LEFT JOIN tenants            tc_creator ON tc_creator.id = ct.created_by
           LEFT JOIN task_categories    cat        ON cat.id = ct.category_id
          WHERE ct.tenant_id = $1
          ORDER BY ct.created_at DESC
          LIMIT 10`,
        [tenantId]
      ),

      /* ─── KPIs pessoais ────────────────────────────────────────────────── */
      queryOne(
        `SELECT
           COUNT(*) FILTER (
             WHERE due_date = CURRENT_DATE AND assigned_to = $2
           )::int AS my_tasks_today,
           COUNT(*) FILTER (
             WHERE due_date = CURRENT_DATE AND assigned_to = $2 AND status = 'done'
           )::int AS my_tasks_done_today,
           COUNT(*) FILTER (
             WHERE assigned_to = $2
               AND status != 'done'
               AND due_date IS NOT NULL
               AND due_date < CURRENT_DATE
           )::int AS my_tasks_overdue,
           COUNT(*) FILTER (
             WHERE assigned_to = $2
               AND due_date >= date_trunc('week', CURRENT_DATE)::date
               AND due_date <  (date_trunc('week', CURRENT_DATE) + INTERVAL '7 days')::date
           )::int AS my_tasks_this_week,
           COUNT(*) FILTER (
             WHERE assigned_to = $2
               AND status = 'done'
               AND due_date >= date_trunc('week', CURRENT_DATE)::date
               AND due_date <  (date_trunc('week', CURRENT_DATE) + INTERVAL '7 days')::date
           )::int AS my_tasks_done_this_week
         FROM client_tasks
         WHERE tenant_id = $1`,
        [tenantId, userId]
      ),
    ]);

    const meetingsRow = await queryOne(
      `SELECT COUNT(*)::int AS total
         FROM meetings
        WHERE tenant_id = $1
          AND meeting_date = CURRENT_DATE
          AND (created_by = $2 OR $2 = ANY(participants))
          AND status != 'cancelled'`,
      [tenantId, userId]
    );

    return res.json({
      success: true,
      data: {
        todayTasks:    todayTasks    || [],
        todayMeetings: todayMeetings || [],
        recentTasks:   recentTasks   || [],
        stats: {
          myTasksToday:        statsRow?.my_tasks_today        || 0,
          myTasksDoneToday:    statsRow?.my_tasks_done_today    || 0,
          myTasksOverdue:      statsRow?.my_tasks_overdue       || 0,
          myMeetingsToday:     meetingsRow?.total               || 0,
          myTasksThisWeek:     statsRow?.my_tasks_this_week     || 0,
          myTasksDoneThisWeek: statsRow?.my_tasks_done_this_week || 0,
        },
      },
    });
  } catch (err) {
    console.error('[ERRO][API:dashboard/overview]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
